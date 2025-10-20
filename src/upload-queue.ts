import { promises as fs } from 'fs';
import path from 'path';
import { createNote } from './evernote-client.js';
import { colors, warning, info } from './output-formatter.js';

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
 * @param filePath - Path to the source file
 */
export function getJSONPath(filePath: string): string {
  return `${filePath}.evernote.json`;
}

/**
 * Check if a file has already been processed (has JSON)
 * @param filePath - Path to the source file
 */
export async function hasExistingJSON(filePath: string): Promise<boolean> {
  const jsonPath = getJSONPath(filePath);
  try {
    await fs.access(jsonPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Save note data to JSON file next to the original file
 * @param filePath - Path to the original file
 * @param noteData - Note data to save
 */
export async function saveNoteToJSON(
  filePath: string,
  noteData: { title: string; description: string; tags: string[] }
): Promise<string> {
  const jsonPath = getJSONPath(filePath);

  const queueData: NoteData = {
    filePath: filePath,
    title: noteData.title,
    description: noteData.description,
    tags: noteData.tags,
    createdAt: new Date().toISOString(),
    lastAttempt: null,
    retryAfter: null,
  };

  await fs.writeFile(jsonPath, JSON.stringify(queueData, null, 2), 'utf-8');
  return jsonPath;
}

/**
 * Load note data from JSON file
 * @param jsonPath - Path to the JSON file
 */
export async function loadNoteFromJSON(jsonPath: string): Promise<NoteData> {
  const content = await fs.readFile(jsonPath, 'utf-8');
  return JSON.parse(content) as NoteData;
}

/**
 * Update JSON file with retry information after a rate limit error
 * @param jsonPath - Path to the JSON file
 * @param retryAfterMs - Timestamp when retry should be attempted
 */
async function updateRetryInfo(jsonPath: string, retryAfterMs: number): Promise<void> {
  const noteData = await loadNoteFromJSON(jsonPath);
  noteData.lastAttempt = new Date().toISOString();
  noteData.retryAfter = retryAfterMs;
  await fs.writeFile(jsonPath, JSON.stringify(noteData, null, 2), 'utf-8');
}

/**
 * Check if enough time has passed to retry an upload
 * @param jsonPath - Path to the JSON file
 */
async function shouldRetry(jsonPath: string): Promise<boolean> {
  try {
    const noteData = await loadNoteFromJSON(jsonPath);

    // If no retry time set, we can retry
    if (!noteData.retryAfter) {
      return true;
    }

    // Check if current time is past the retry time
    return Date.now() >= noteData.retryAfter;
  } catch (error) {
    // If we can't read the file, assume we should retry
    return true;
  }
}

/**
 * Check if a note has been successfully uploaded
 * @param jsonPath - Path to the JSON file
 */
export async function isUploaded(jsonPath: string): Promise<boolean> {
  try {
    const noteData = await loadNoteFromJSON(jsonPath);
    return !!noteData.uploadedAt;
  } catch {
    return false;
  }
}

/**
 * Upload a note from JSON file to Evernote
 * @param jsonPath - Path to the JSON file
 */
export async function uploadNoteFromJSON(jsonPath: string): Promise<UploadResult> {
  try {
    const noteData = await loadNoteFromJSON(jsonPath);

    // Check if already uploaded
    if (noteData.uploadedAt) {
      return {
        success: true,
        noteUrl: noteData.noteUrl,
        alreadyUploaded: true,
      };
    }

    const { filePath, title, description, tags } = noteData;

    // Verify the original file still exists
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`Original file not found: ${filePath}`);
    }

    // Attempt to create the note in Evernote
    const noteUrl = await createNote(filePath, title, description, tags);

    // Success! Update the JSON file with upload info (don't delete)
    noteData.uploadedAt = new Date().toISOString();
    noteData.noteUrl = noteUrl;
    noteData.lastAttempt = new Date().toISOString();
    noteData.retryAfter = null;
    await fs.writeFile(jsonPath, JSON.stringify(noteData, null, 2), 'utf-8');

    return {
      success: true,
      noteUrl: noteUrl,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check if it's a rate limit error
    const isRateLimit = errorMessage.includes('rateLimitDuration') ||
                        errorMessage.includes('errorCode":19');

    if (isRateLimit) {
      // Extract rate limit duration
      const match = errorMessage.match(/rateLimitDuration[":]+(\d+)/);
      const durationSeconds = match && match[1] ? parseInt(match[1], 10) : 60;
      const retryAfterMs = Date.now() + (durationSeconds * 1000);

      // Update JSON with retry time
      await updateRetryInfo(jsonPath, retryAfterMs);

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
 * Find all pending upload JSON files in a directory (recursive)
 * Only returns JSONs that haven't been uploaded yet
 * @param directory - Directory to search
 */
export async function findPendingUploads(directory: string): Promise<string[]> {
  const jsonFiles: string[] = [];

  async function scan(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.evernote.json')) {
        // Only include if not yet uploaded
        if (!(await isUploaded(fullPath))) {
          jsonFiles.push(fullPath);
        }
      }
    }
  }

  await scan(directory);
  return jsonFiles.sort();
}

/**
 * Attempt to upload all pending uploads that are ready to retry
 * @param directory - Directory to search for pending uploads
 */
export async function retryPendingUploads(directory: string): Promise<RetryStats> {
  const pendingFiles = await findPendingUploads(directory);

  const stats: RetryStats = {
    attempted: 0,
    successful: 0,
    rateLimited: 0,
    failed: 0,
  };

  for (const jsonPath of pendingFiles) {
    // Check if we should retry this upload
    const canRetry = await shouldRetry(jsonPath);

    if (!canRetry) {
      // Not ready to retry yet
      continue;
    }

    stats.attempted++;

    const noteData = await loadNoteFromJSON(jsonPath);
    if (!noteData.filePath) continue;
    const fileName = path.basename(noteData.filePath);

    console.log(`  ${colors.info('↻')} Retrying upload: ${colors.highlight(fileName)}`);

    const result = await uploadNoteFromJSON(jsonPath);

    if (result.success) {
      stats.successful++;
      console.log(`    ${colors.success('✓')} Uploaded successfully`);
    } else if (result.rateLimitDuration) {
      stats.rateLimited++;
      console.log(`    ${colors.error('⚠')} Rate limited - retry in ${result.rateLimitDuration}s`);
    } else {
      stats.failed++;
      const errorMessage = result.error?.message || 'Unknown error';
      console.log(`    ${colors.error('✗')} Failed: ${errorMessage}`);
    }
  }

  return stats;
}

/**
 * Get count of pending uploads in a directory
 * @param directory - Directory to search
 */
export async function getPendingCount(directory: string): Promise<number> {
  const pendingFiles = await findPendingUploads(directory);
  return pendingFiles.length;
}

/**
 * Wait for all pending uploads to complete with smart retry logic
 * @param directory - Directory containing pending uploads
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
    const pendingFiles = await findPendingUploads(directory);

    if (pendingFiles.length === 0) {
      // All done!
      break;
    }

    // Check if we've exceeded max wait time
    if (Date.now() - startTime > maxWaitTime) {
      console.log(`\n${warning(`Timeout reached. ${pendingFiles.length} uploads still pending.`)}`);
      totalFailed = pendingFiles.length;
      break;
    }

    // Find the earliest retry time
    let earliestRetry: number | null = null;
    for (const jsonPath of pendingFiles) {
      try {
        const noteData = await loadNoteFromJSON(jsonPath);
        if (noteData.retryAfter) {
          if (!earliestRetry || noteData.retryAfter < earliestRetry) {
            earliestRetry = noteData.retryAfter;
          }
        }
      } catch {
        // Skip files we can't read
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
          console.log(`\n${info(`Waiting ${waitSeconds}s until next retry...`)}`);
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
