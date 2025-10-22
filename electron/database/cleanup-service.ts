/**
 * Cleanup Service
 * Verifies uploaded notes exist in Evernote and removes them from local database
 */

import { checkNoteExists } from '../evernote/client.js';
import { getCompletedFilesWithGuids, deleteFile } from './queue-db.js';

export interface CleanupResult {
  checked: number;
  verified: number;
  removed: number;
  failed: number;
}

/**
 * Verify uploaded notes exist in Evernote and remove them from database
 * @param batchSize - Number of notes to verify in each batch (for rate limiting)
 * @param delayBetweenBatches - Delay in ms between batches (default: 1000ms)
 */
export async function verifyAndRemoveUploadedNotes(
  batchSize: number = 10,
  delayBetweenBatches: number = 1000
): Promise<CleanupResult> {
  console.log('Starting cleanup of uploaded notes...');

  const completedFiles = getCompletedFilesWithGuids();

  if (completedFiles.length === 0) {
    console.log('  No completed files to verify');
    return { checked: 0, verified: 0, removed: 0, failed: 0 };
  }

  console.log(`  Found ${completedFiles.length} completed file(s) to verify`);

  const result: CleanupResult = {
    checked: 0,
    verified: 0,
    removed: 0,
    failed: 0
  };

  // Process in batches to respect rate limits
  for (let i = 0; i < completedFiles.length; i += batchSize) {
    const batch = completedFiles.slice(i, i + batchSize);

    // Verify each note in the batch
    for (const file of batch) {
      if (!file.note_guid) {
        // Skip files without GUID (shouldn't happen, but handle gracefully)
        console.warn(`  ⚠ File has no GUID: ${file.file_path}`);
        result.failed++;
        continue;
      }

      result.checked++;

      try {
        const exists = await checkNoteExists(file.note_guid);

        if (exists) {
          // Note exists in Evernote, safe to remove from local DB
          result.verified++;
          deleteFile(file.file_path);
          result.removed++;
          console.log(`  ✓ Verified and removed: ${file.file_path.split('/').pop()}`);
        } else {
          // Note doesn't exist in Evernote - keep it in DB
          console.warn(`  ⚠ Note not found in Evernote: ${file.file_path.split('/').pop()} (GUID: ${file.note_guid})`);
          result.failed++;
        }
      } catch (error) {
        // Error verifying note - keep it in DB to be safe
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`  ✗ Error verifying ${file.file_path.split('/').pop()}: ${errorMsg}`);
        result.failed++;
      }
    }

    // Wait between batches to respect rate limits
    if (i + batchSize < completedFiles.length) {
      console.log(`  Waiting ${delayBetweenBatches}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  console.log('\nCleanup summary:');
  console.log(`  Checked: ${result.checked}`);
  console.log(`  Verified: ${result.verified}`);
  console.log(`  Removed: ${result.removed}`);
  console.log(`  Failed: ${result.failed}`);

  return result;
}
