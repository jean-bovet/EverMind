import { BrowserWindow } from 'electron';
import path from 'path';
import { promises as fs } from 'fs';

// Import existing CLI modules
import { extractFileContent } from './file-extractor.js';
import { contentAnalysisWorkflow } from '../ai/content-analysis-workflow.js';
import {
  hasExistingJSON,
  saveNoteToJSON,
  uploadNoteFromJSON,
} from './upload-queue.js';
import { addFile, deleteFile } from '../database/queue-db.js';
import {
  createProgressData,
  extractErrorMessage,
  getSupportedExtensions
} from './progress-helpers.js';

export interface ProcessFileOptions {
  debug?: boolean;
}

export interface ProcessResult {
  success: boolean;
  title?: string;
  description?: string;
  tags?: string[];
  noteUrl?: string;
  error?: string;
}

export interface AnalysisResult {
  success: boolean;
  title?: string;
  description?: string;
  tags?: string[];
  jsonPath?: string;
  error?: string;
}

export interface UploadResult {
  success: boolean;
  noteUrl?: string;
  rateLimitDuration?: number;
  error?: Error;
}

/**
 * Stage 1: Analyze file (extract text and analyze with AI)
 * This function extracts content, fetches tags, analyzes with AI,
 * and saves the result to a JSON file for later upload.
 */
export async function analyzeFile(
  filePath: string,
  options: ProcessFileOptions,
  mainWindow: BrowserWindow | null
): Promise<AnalysisResult> {
  const absolutePath = path.resolve(filePath);

  try {
    // Check if file exists
    await fs.access(absolutePath);

    // Add file to database (if not already exists)
    addFile(absolutePath);

    // Check if already processed
    if (await hasExistingJSON(absolutePath)) {
      return {
        success: false,
        error: 'File already processed'
      };
    }

    // Send progress update: Extracting content
    mainWindow?.webContents.send('file-progress',
      createProgressData(absolutePath, 'extracting')
    );

    // Extract file content
    const { text, fileType, fileName } = await extractFileContent(absolutePath);

    // Send progress update: Analyzing with AI
    mainWindow?.webContents.send('file-progress',
      createProgressData(absolutePath, 'analyzing')
    );

    // Use shared workflow for AI analysis (handles tag fetching, caching, filtering)
    const analysisResult = await contentAnalysisWorkflow.analyze(
      text,
      fileName,
      'file',
      absolutePath,
      {
        debug: options.debug || false,
        useCache: false,
        sourceFilePath: options.debug ? absolutePath : undefined
      }
    );

    // Send progress update: Saving to JSON
    mainWindow?.webContents.send('file-progress',
      createProgressData(absolutePath, 'saving')
    );

    // Save to JSON queue
    const jsonPath = await saveNoteToJSON(absolutePath, {
      title: analysisResult.title,
      description: analysisResult.description,
      tags: analysisResult.tags
    }, analysisResult.contentHash);

    // Send progress: Ready for upload
    mainWindow?.webContents.send('file-progress',
      createProgressData(absolutePath, 'ready-to-upload', {
        result: {
          title: analysisResult.title,
          description: analysisResult.description,
          tags: analysisResult.tags
        }
      })
    );

    return {
      success: true,
      title: analysisResult.title,
      description: analysisResult.description,
      tags: analysisResult.tags,
      jsonPath
    };

  } catch (error) {
    const errorMsg = extractErrorMessage(error);

    mainWindow?.webContents.send('file-progress',
      createProgressData(absolutePath, 'error', { error: errorMsg })
    );

    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Stage 2: Upload file from JSON to Evernote
 * This function loads a previously analyzed file from its JSON
 * and uploads it to Evernote, handling rate limits and retries.
 */
export async function uploadFile(
  jsonPath: string,
  originalFilePath: string,
  mainWindow: BrowserWindow | null
): Promise<UploadResult> {
  try {
    // Send progress update: Uploading
    mainWindow?.webContents.send('file-progress',
      createProgressData(originalFilePath, 'uploading')
    );

    // Attempt upload
    const uploadResult = await uploadNoteFromJSON(jsonPath);

    if (uploadResult.success) {
      // Success
      mainWindow?.webContents.send('file-progress',
        createProgressData(originalFilePath, 'complete', {
          result: { noteUrl: uploadResult.noteUrl }
        })
      );

      // Remove from database immediately after successful upload
      deleteFile(originalFilePath);

      return {
        success: true,
        noteUrl: uploadResult.noteUrl
      };

    } else if (uploadResult.rateLimitDuration) {
      // Rate limited
      mainWindow?.webContents.send('file-progress',
        createProgressData(originalFilePath, 'rate-limited', {
          rateLimitDuration: uploadResult.rateLimitDuration
        })
      );

      return {
        success: false,
        rateLimitDuration: uploadResult.rateLimitDuration
      };

    } else {
      // Other error
      const errorMsg = extractErrorMessage(uploadResult.error) || 'Upload failed';

      mainWindow?.webContents.send('file-progress',
        createProgressData(originalFilePath, 'retrying', { error: errorMsg })
      );

      return {
        success: false,
        error: uploadResult.error
      };
    }

  } catch (error) {
    const errorMsg = extractErrorMessage(error);

    mainWindow?.webContents.send('file-progress',
      createProgressData(originalFilePath, 'error', { error: errorMsg })
    );

    return {
      success: false,
      error: error instanceof Error ? error : new Error(errorMsg)
    };
  }
}

/**
 * Process a single file and upload to Evernote
 * (Legacy function - kept for backward compatibility)
 */
export async function processFile(
  filePath: string,
  options: ProcessFileOptions,
  mainWindow: BrowserWindow | null
): Promise<ProcessResult> {
  const absolutePath = path.resolve(filePath);

  try {
    // Check if file exists
    await fs.access(absolutePath);

    // Check if already processed
    if (await hasExistingJSON(absolutePath)) {
      return {
        success: false,
        error: 'File already processed'
      };
    }

    // Send progress update: Extracting content
    mainWindow?.webContents.send('file-progress',
      createProgressData(absolutePath, 'extracting')
    );

    // Extract file content
    const { text, fileType, fileName } = await extractFileContent(absolutePath);

    // Send progress update: Analyzing with AI
    mainWindow?.webContents.send('file-progress',
      createProgressData(absolutePath, 'analyzing')
    );

    // Use shared workflow for AI analysis (handles tag fetching, caching, filtering)
    const analysisResult = await contentAnalysisWorkflow.analyze(
      text,
      fileName,
      'file',
      absolutePath,
      {
        debug: options.debug || false,
        useCache: false,
        sourceFilePath: options.debug ? absolutePath : undefined
      }
    );

    // Send progress update: Saving and uploading
    mainWindow?.webContents.send('file-progress', {
      filePath: absolutePath,
      status: 'uploading',
      progress: 75,
      message: 'Saving and uploading to Evernote...'
    });

    // Save to JSON queue
    const jsonPath = await saveNoteToJSON(absolutePath, {
      title: analysisResult.title,
      description: analysisResult.description,
      tags: analysisResult.tags
    }, analysisResult.contentHash);

    // Attempt upload
    const uploadResult = await uploadNoteFromJSON(jsonPath);

    if (uploadResult.success) {
      // Send completion
      mainWindow?.webContents.send('file-progress', {
        filePath: absolutePath,
        status: 'complete',
        progress: 100,
        message: 'Uploaded successfully',
        result: {
          title: analysisResult.title,
          description: analysisResult.description,
          tags: analysisResult.tags,
          noteUrl: uploadResult.noteUrl
        }
      });

      // Remove from database immediately after successful upload
      deleteFile(absolutePath);

      return {
        success: true,
        title: analysisResult.title,
        description: analysisResult.description,
        tags: analysisResult.tags,
        noteUrl: uploadResult.noteUrl
      };
    } else if (uploadResult.rateLimitDuration) {
      // Rate limited - queued for retry
      mainWindow?.webContents.send('file-progress', {
        filePath: absolutePath,
        status: 'complete',
        progress: 100,
        message: 'Rate limited - queued for retry',
        result: {
          title: analysisResult.title,
          description: analysisResult.description,
          tags: analysisResult.tags
        }
      });

      return {
        success: true,
        title: analysisResult.title,
        description: analysisResult.description,
        tags: analysisResult.tags
      };
    } else {
      // Upload failed - queued for retry
      const errorMsg = uploadResult.error?.message || 'Upload failed';

      mainWindow?.webContents.send('file-progress', {
        filePath: absolutePath,
        status: 'error',
        progress: 100,
        message: errorMsg,
        error: errorMsg
      });

      return {
        success: false,
        error: errorMsg
      };
    }

  } catch (error) {
    const errorMsg = extractErrorMessage(error);

    mainWindow?.webContents.send('file-progress',
      createProgressData(absolutePath, 'error', { error: errorMsg })
    );

    return {
      success: false,
      error: errorMsg
    };
  }
}

/**
 * Process a batch of files or a folder
 */
export async function processBatch(
  folderPath: string,
  options: ProcessFileOptions,
  mainWindow: BrowserWindow | null
): Promise<void> {
  const SUPPORTED_EXTENSIONS = getSupportedExtensions();

  // Scan folder recursively
  const files: string[] = [];

  async function scan(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await scan(folderPath);

  // Send batch progress
  mainWindow?.webContents.send('batch-progress', {
    totalFiles: files.length,
    processed: 0,
    status: 'scanning'
  });

  // Process each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;

    mainWindow?.webContents.send('batch-progress', {
      totalFiles: files.length,
      processed: i,
      currentFile: file,
      status: 'processing'
    });

    try {
      await processFile(file, options, mainWindow);
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
      // Continue with next file
    }
  }

  // Complete
  mainWindow?.webContents.send('batch-progress', {
    totalFiles: files.length,
    processed: files.length,
    status: 'complete'
  });
}
