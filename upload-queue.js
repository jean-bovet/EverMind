const fs = require('fs').promises;
const path = require('path');
const { createNote } = require('./evernote-client');
const { colors, warning, info, error: errorMsg } = require('./output-formatter');

/**
 * Get the JSON file path for a given source file
 * @param {string} filePath - Path to the source file
 * @returns {string} - Path to the JSON file
 */
function getJSONPath(filePath) {
  return `${filePath}.evernote.json`;
}

/**
 * Check if a file has already been processed (has JSON)
 * @param {string} filePath - Path to the source file
 * @returns {Promise<boolean>}
 */
async function hasExistingJSON(filePath) {
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
 * @param {string} filePath - Path to the original file
 * @param {Object} noteData - Note data to save
 * @param {string} noteData.title - Note title
 * @param {string} noteData.description - Note description
 * @param {string[]} noteData.tags - Note tags
 * @returns {Promise<string>} - Path to the saved JSON file
 */
async function saveNoteToJSON(filePath, noteData) {
  const jsonPath = getJSONPath(filePath);

  const queueData = {
    filePath: filePath,
    title: noteData.title,
    description: noteData.description,
    tags: noteData.tags,
    createdAt: new Date().toISOString(),
    lastAttempt: null,
    retryAfter: null
  };

  await fs.writeFile(jsonPath, JSON.stringify(queueData, null, 2), 'utf-8');
  return jsonPath;
}

/**
 * Load note data from JSON file
 * @param {string} jsonPath - Path to the JSON file
 * @returns {Promise<Object>} - Note data
 */
async function loadNoteFromJSON(jsonPath) {
  const content = await fs.readFile(jsonPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Update JSON file with retry information after a rate limit error
 * @param {string} jsonPath - Path to the JSON file
 * @param {number} retryAfterMs - Timestamp when retry should be attempted
 */
async function updateRetryInfo(jsonPath, retryAfterMs) {
  const noteData = await loadNoteFromJSON(jsonPath);
  noteData.lastAttempt = new Date().toISOString();
  noteData.retryAfter = retryAfterMs;
  await fs.writeFile(jsonPath, JSON.stringify(noteData, null, 2), 'utf-8');
}

/**
 * Check if enough time has passed to retry an upload
 * @param {string} jsonPath - Path to the JSON file
 * @returns {Promise<boolean>}
 */
async function shouldRetry(jsonPath) {
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
 * @param {string} jsonPath - Path to the JSON file
 * @returns {Promise<boolean>}
 */
async function isUploaded(jsonPath) {
  try {
    const noteData = await loadNoteFromJSON(jsonPath);
    return !!noteData.uploadedAt;
  } catch {
    return false;
  }
}

/**
 * Upload a note from JSON file to Evernote
 * @param {string} jsonPath - Path to the JSON file
 * @returns {Promise<{success: boolean, noteUrl?: string, error?: Error, rateLimitDuration?: number}>}
 */
async function uploadNoteFromJSON(jsonPath) {
  try {
    const noteData = await loadNoteFromJSON(jsonPath);

    // Check if already uploaded
    if (noteData.uploadedAt) {
      return {
        success: true,
        noteUrl: noteData.noteUrl,
        alreadyUploaded: true
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
      noteUrl: noteUrl
    };

  } catch (error) {
    // Check if it's a rate limit error
    const isRateLimit = error.message.includes('rateLimitDuration') ||
                        error.message.includes('errorCode":19');

    if (isRateLimit) {
      // Extract rate limit duration
      const match = error.message.match(/rateLimitDuration[":]+(\d+)/);
      const durationSeconds = match ? parseInt(match[1]) : 60;
      const retryAfterMs = Date.now() + (durationSeconds * 1000);

      // Update JSON with retry time
      await updateRetryInfo(jsonPath, retryAfterMs);

      return {
        success: false,
        error: error,
        rateLimitDuration: durationSeconds
      };
    }

    // Other error - don't update retry time, just return the error
    return {
      success: false,
      error: error
    };
  }
}

/**
 * Find all pending upload JSON files in a directory (recursive)
 * Only returns JSONs that haven't been uploaded yet
 * @param {string} directory - Directory to search
 * @returns {Promise<string[]>} - Array of JSON file paths
 */
async function findPendingUploads(directory) {
  const jsonFiles = [];

  async function scan(dir) {
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
 * @param {string} directory - Directory to search for pending uploads
 * @returns {Promise<{attempted: number, successful: number, rateLimited: number, failed: number}>}
 */
async function retryPendingUploads(directory) {
  const pendingFiles = await findPendingUploads(directory);

  const stats = {
    attempted: 0,
    successful: 0,
    rateLimited: 0,
    failed: 0
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
      console.log(`    ${colors.error('✗')} Failed: ${result.error.message}`);
    }
  }

  return stats;
}

/**
 * Get count of pending uploads in a directory
 * @param {string} directory - Directory to search
 * @returns {Promise<number>}
 */
async function getPendingCount(directory) {
  const pendingFiles = await findPendingUploads(directory);
  return pendingFiles.length;
}

/**
 * Wait for all pending uploads to complete with smart retry logic
 * @param {string} directory - Directory containing pending uploads
 * @param {number} maxWaitTime - Maximum time to wait in milliseconds (default: 10 minutes)
 * @returns {Promise<{successful: number, failed: number}>}
 */
async function waitForPendingUploads(directory, maxWaitTime = 600000) {
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
    let earliestRetry = null;
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
    failed: totalFailed
  };
}

module.exports = {
  getJSONPath,
  hasExistingJSON,
  isUploaded,
  saveNoteToJSON,
  loadNoteFromJSON,
  updateRetryInfo,
  shouldRetry,
  uploadNoteFromJSON,
  findPendingUploads,
  retryPendingUploads,
  getPendingCount,
  waitForPendingUploads
};
