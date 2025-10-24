/**
 * Upload Queue Manager
 * Now uses SQLite database instead of JSON files
 */

import { promises as fs } from 'fs';
import { createNote } from '../evernote/client.js';
import {
  addFile,
  getFile,
  updateFileAnalysis,
  updateFileUpload,
  updateRetryInfo,
  getReadyToUploadFiles,
  shouldRetry,
  parseTags
} from '../database/queue-db.js';

export interface NoteData {
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
  lastAttempt: string | null;
  retryAfter: number | null;
  uploadedAt?: string;
  noteUrl?: string;
}

export interface UploadResult {
  success: boolean;
  noteUrl?: string;
  error?: Error;
  rateLimitDuration?: number;
  alreadyUploaded?: boolean;
}

export interface RetryStats {
  attempted: number;
  successful: number;
  rateLimited: number;
  failed: number;
}

export interface WaitResult {
  successful: number;
  failed: number;
}

/**
 * Get the JSON file path for a given source file
 * @deprecated - No longer used with database, kept for backwards compatibility
 */
export function getJSONPath(filePath: string): string {
  return `${filePath}.evernote.json`;
}

/**
 * Check if a file has already been processed (has analysis data)
 * @param filePath - Path to the source file
 */
export async function hasExistingJSON(filePath: string): Promise<boolean> {
  const file = getFile(filePath);
  // Only consider "already processed" if it has analysis results
  return file != null && file.title != null;
}

/**
 * Save note data to database
 * @param filePath - Path to the original file
 * @param noteData - Note data to save
 * @param contentHash - Optional MD5 hash of content for caching
 */
export async function saveNoteToJSON(
  filePath: string,
  noteData: { title: string; description: string; tags: string[] },
  contentHash?: string
): Promise<string> {
  // Add file to database if not exists
  addFile(filePath);

  // Update with analysis results (including content hash)
  updateFileAnalysis(filePath, noteData.title, noteData.description, noteData.tags, contentHash);

  // Return file path (instead of JSON path) for compatibility
  return filePath;
}

/**
 * Load note data from database
 * @param filePathOrJsonPath - Path to the file or old JSON path
 */
export async function loadNoteFromJSON(filePathOrJsonPath: string): Promise<NoteData> {
  // Handle legacy JSON paths (.evernote.json)
  let filePath = filePathOrJsonPath;
  if (filePath.endsWith('.evernote.json')) {
    filePath = filePath.replace('.evernote.json', '');
  }

  const record = getFile(filePath);

  if (!record) {
    throw new Error(`File not found in database: ${filePath}`);
  }

  return {
    filePath: record.file_path,
    title: record.title || '',
    description: record.description || '',
    tags: parseTags(record),
    createdAt: record.created_at,
    lastAttempt: record.last_attempt_at,
    retryAfter: record.retry_after,
    uploadedAt: record.uploaded_at || undefined,
    noteUrl: record.note_url || undefined
  };
}

/**
 * Check if a note has been successfully uploaded
 * @param filePathOrJsonPath - Path to the file or old JSON path
 */
export async function isUploaded(filePathOrJsonPath: string): Promise<boolean> {
  let filePath = filePathOrJsonPath;
  if (filePath.endsWith('.evernote.json')) {
    filePath = filePath.replace('.evernote.json', '');
  }

  const record = getFile(filePath);
  return record?.status === 'complete' && !!record.uploaded_at;
}

/**
 * Upload a note from database to Evernote
 * @param filePathOrJsonPath - Path to the file or old JSON path
 */
export async function uploadNoteFromJSON(filePathOrJsonPath: string): Promise<UploadResult> {
  try {
    const noteData = await loadNoteFromJSON(filePathOrJsonPath);
    const { filePath } = noteData;

    // Check if already uploaded
    if (noteData.uploadedAt) {
      return {
        success: true,
        noteUrl: noteData.noteUrl,
        alreadyUploaded: true,
      };
    }

    // Verify the original file still exists
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`Original file not found: ${filePath}`);
    }

    // Attempt to create the note in Evernote
    const { noteUrl, noteGuid } = await createNote(filePath, noteData.title, noteData.description, noteData.tags);

    // Success! Update database with upload info
    updateFileUpload(filePath, noteUrl, noteGuid);

    return {
      success: true,
      noteUrl: noteUrl,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Extract file path for database update
    let filePath = filePathOrJsonPath;
    if (filePath.endsWith('.evernote.json')) {
      filePath = filePath.replace('.evernote.json', '');
    }

    // Check if it's a rate limit error
    const isRateLimit = errorMessage.includes('rateLimitDuration') ||
                        errorMessage.includes('errorCode":19');

    if (isRateLimit) {
      // Extract rate limit duration
      const match = errorMessage.match(/rateLimitDuration[":]+(\d+)/);
      const durationSeconds = match && match[1] ? parseInt(match[1], 10) : 60;
      const retryAfterMs = Date.now() + (durationSeconds * 1000);

      // Update database with retry time
      updateRetryInfo(filePath, retryAfterMs);

      return {
        success: false,
        error: error instanceof Error ? error : new Error(errorMessage),
        rateLimitDuration: durationSeconds,
      };
    }

    // Other error - don't update retry time, just return the error
    return {
      success: false,
      error: error instanceof Error ? error : new Error(errorMessage),
    };
  }
}

/**
 * Find all pending upload files in a directory (recursive)
 * @deprecated - Database tracks all files, no need to scan directories
 * @param directory - Directory to search (ignored)
 */
export async function findPendingUploads(_directory: string): Promise<string[]> {
  // Return files ready for upload from database
  const files = getReadyToUploadFiles();
  return files.map(f => f.file_path);
}

/**
 * Attempt to upload all pending uploads that are ready to retry
 * @param directory - Directory to search for pending uploads (ignored, uses DB)
 */
export async function retryPendingUploads(_directory: string): Promise<RetryStats> {
  const pendingFiles = getReadyToUploadFiles();

  const stats: RetryStats = {
    attempted: 0,
    successful: 0,
    rateLimited: 0,
    failed: 0,
  };

  for (const record of pendingFiles) {
    // Check if we should retry this upload
    const canRetry = shouldRetry(record.file_path);

    if (!canRetry) {
      // Not ready to retry yet
      continue;
    }

    stats.attempted++;

    const fileName = record.file_path.split('/').pop() || record.file_path;
    console.log(`Retrying upload: ${fileName}`);

    const result = await uploadNoteFromJSON(record.file_path);

    if (result.success) {
      stats.successful++;
      console.log('Uploaded successfully');
    } else if (result.rateLimitDuration) {
      stats.rateLimited++;
      console.log(`Rate limited - retry in ${result.rateLimitDuration}s`);
    } else {
      stats.failed++;
      const errorMessage = result.error?.message || 'Unknown error';
      console.log(`Failed: ${errorMessage}`);
    }
  }

  return stats;
}

/**
 * Get count of pending uploads
 * @param directory - Directory to search (ignored, uses DB)
 */
export async function getPendingCount(_directory: string): Promise<number> {
  const files = getReadyToUploadFiles();
  return files.length;
}

/**
 * Wait for all pending uploads to complete with smart retry logic
 * @param directory - Directory containing pending uploads (ignored, uses DB)
 * @param maxWaitTime - Maximum time to wait in milliseconds (default: 10 minutes)
 */
export async function waitForPendingUploads(
  directory: string,
  maxWaitTime: number = 600000
): Promise<WaitResult> {
  const startTime = Date.now();
  let totalSuccessful = 0;
  let totalFailed = 0;

  while (true) {
    const pendingFiles = getReadyToUploadFiles();

    if (pendingFiles.length === 0) {
      // All done!
      break;
    }

    // Check if we've exceeded max wait time
    if (Date.now() - startTime > maxWaitTime) {
      console.warn(`Timeout reached. ${pendingFiles.length} uploads still pending.`);
      totalFailed = pendingFiles.length;
      break;
    }

    // Find the earliest retry time
    let earliestRetry: number | null = null;
    for (const record of pendingFiles) {
      if (record.retry_after) {
        if (!earliestRetry || record.retry_after < earliestRetry) {
          earliestRetry = record.retry_after;
        }
      }
    }

    // Try to upload anything that's ready
    const stats = await retryPendingUploads(directory);
    totalSuccessful += stats.successful;

    if (stats.attempted === 0) {
      // Nothing was ready to retry
      if (earliestRetry) {
        const waitTime = Math.max(0, earliestRetry - Date.now());
        if (waitTime > 0) {
          const waitSeconds = Math.ceil(waitTime / 1000);
          console.log(`Waiting ${waitSeconds}s until next retry...`);
          await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 5000))); // Wait max 5s at a time
        }
      } else {
        // No retry times set, wait a bit and try again
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  return {
    successful: totalSuccessful,
    failed: totalFailed,
  };
}
