import { BrowserWindow } from 'electron';
import { uploadFile as defaultUploadFile, UploadResult } from './file-processor.js';
import { getReadyToUploadFiles, deleteFile } from '../database/queue-db.js';

// Configuration
const UPLOAD_RETRY_DELAY = 5000;        // 5s between retries
const MAX_UPLOAD_RETRIES = 3;           // Max retry attempts
const RATE_LIMIT_BUFFER = 2000;         // Add 2s buffer to rate limit wait
const POLL_INTERVAL = 1000;             // Check queue every 1s

interface QueueItem {
  jsonPath: string;
  originalFilePath: string;
  retryCount: number;
}

type UploadFunction = (
  jsonPath: string,
  originalFilePath: string,
  mainWindow: BrowserWindow | null
) => Promise<UploadResult>;

/**
 * Background worker that processes the upload queue
 * Handles one file at a time, with rate limiting and retries
 */
export class UploadWorker {
  private isRunning = false;
  private queue: QueueItem[] = [];
  private mainWindow: BrowserWindow | null = null;
  private uploadFileFn: UploadFunction;

  constructor(
    mainWindow: BrowserWindow | null,
    uploadFileFn: UploadFunction = defaultUploadFile
  ) {
    this.mainWindow = mainWindow;
    this.uploadFileFn = uploadFileFn;
  }

  /**
   * Start the upload worker
   */
  start() {
    if (this.isRunning) {
      console.warn('UploadWorker already running');
      return;
    }

    this.isRunning = true;
    this.processLoop();
    console.log('UploadWorker started');
  }

  /**
   * Stop the upload worker
   */
  stop() {
    this.isRunning = false;
    console.log('UploadWorker stopped');
  }

  /**
   * Add a file to the upload queue
   */
  addToQueue(jsonPath: string, originalFilePath: string) {
    // Check if already in queue
    const exists = this.queue.some(item => item.jsonPath === jsonPath);
    if (exists) {
      console.log(`File already in upload queue: ${originalFilePath}`);
      return;
    }

    this.queue.push({
      jsonPath,
      originalFilePath,
      retryCount: 0
    });

    console.log(`Added to upload queue: ${originalFilePath} (queue size: ${this.queue.length})`);
  }

  /**
   * Get current queue status
   */
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      currentFile: this.queue[0]?.originalFilePath || null
    };
  }

  /**
   * Get queue length (for testing)
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Update the main window reference
   */
  setMainWindow(mainWindow: BrowserWindow | null) {
    this.mainWindow = mainWindow;
  }

  /**
   * Main processing loop
   */
  private async processLoop() {
    while (this.isRunning) {
      // Check database for files ready to upload
      const readyFiles = getReadyToUploadFiles();

      if (readyFiles.length === 0) {
        // Check internal queue as fallback
        if (this.queue.length === 0) {
          // No files to upload, wait a bit
          await this.sleep(POLL_INTERVAL);
          continue;
        }
      }

      // Process from database first, then internal queue
      const item = readyFiles.length > 0 && readyFiles[0]
        ? { jsonPath: readyFiles[0].file_path, originalFilePath: readyFiles[0].file_path, retryCount: 0 }
        : this.queue[0];

      if (!item) {
        await this.sleep(POLL_INTERVAL);
        continue;
      }

      try {
        // Attempt upload
        const result = await this.uploadFileFn(
          item.jsonPath,
          item.originalFilePath,
          this.mainWindow
        );

        if (result.success) {
          // Success - remove from internal queue if it was from there
          if (readyFiles.length === 0 && this.queue.length > 0) {
            this.queue.shift();
          }
          console.log(`Upload successful: ${item.originalFilePath}`);

          // Update file with complete status (including noteUrl)
          // Database is updated via uploadFile function
          this.mainWindow?.webContents.send('file-progress', {
            filePath: item.originalFilePath,
            status: 'complete',
            progress: 100,
            message: 'Uploaded successfully',
            result: {
              noteUrl: result.noteUrl
            }
          });

          // Remove from database immediately after successful upload
          deleteFile(item.originalFilePath);
          console.log(`  Removed from database: ${item.originalFilePath}`);

          // Notify UI that file was removed from queue
          this.mainWindow?.webContents.send('file-removed-from-queue', {
            filePath: item.originalFilePath
          });

        } else if (result.rateLimitDuration) {
          // Rate limited - wait and retry
          const waitMs = (result.rateLimitDuration * 1000) + RATE_LIMIT_BUFFER;
          console.log(
            `Rate limited: ${item.originalFilePath}, waiting ${result.rateLimitDuration}s`
          );

          this.mainWindow?.webContents.send('file-progress', {
            filePath: item.originalFilePath,
            status: 'rate-limited',
            progress: 10,
            message: `Rate limited - retry in ${result.rateLimitDuration}s`
          });

          await this.sleep(waitMs);

        } else {
          // Other error - retry with exponential backoff
          item.retryCount++;

          if (item.retryCount >= MAX_UPLOAD_RETRIES) {
            // Max retries reached - remove from internal queue and mark as error
            if (readyFiles.length === 0 && this.queue.length > 0) {
              this.queue.shift();
            }
            console.error(
              `Max retries reached for ${item.originalFilePath}: ${result.error?.message}`
            );

            this.mainWindow?.webContents.send('file-progress', {
              filePath: item.originalFilePath,
              status: 'error',
              progress: 0,
              error: `Upload failed after ${MAX_UPLOAD_RETRIES} retries: ${result.error?.message}`
            });

          } else {
            // Retry after delay
            const retryDelay = UPLOAD_RETRY_DELAY * item.retryCount;
            console.log(
              `Upload failed for ${item.originalFilePath}, retrying in ${retryDelay}ms (attempt ${item.retryCount}/${MAX_UPLOAD_RETRIES})`
            );

            this.mainWindow?.webContents.send('file-progress', {
              filePath: item.originalFilePath,
              status: 'retrying',
              progress: 10,
              message: `Retrying in ${retryDelay / 1000}s... (${item.retryCount}/${MAX_UPLOAD_RETRIES})`,
              error: result.error?.message
            });

            await this.sleep(retryDelay);
          }
        }

      } catch (error) {
        // Critical error - remove from internal queue and mark as error
        if (readyFiles.length === 0 && this.queue.length > 0) {
          this.queue.shift();
        }
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Critical error uploading ${item.originalFilePath}:`, error);

        this.mainWindow?.webContents.send('file-progress', {
          filePath: item.originalFilePath,
          status: 'error',
          progress: 0,
          error: errorMsg
        });
      }
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
