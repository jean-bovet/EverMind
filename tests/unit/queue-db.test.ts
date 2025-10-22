import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDatabase,
  closeDatabase,
  addFile,
  updateFileStatus,
  updateFileAnalysis,
  updateFileUpload,
  updateFileError,
  updateRetryInfo,
  getFile,
  isAlreadyProcessed,
  getReadyToUploadFiles,
  getFilesReadyToRetry,
  shouldRetry,
  getPendingFiles,
  getAllFiles,
  getStats,
  deleteFile,
  deleteCompletedFiles,
  deleteAllFiles,
  parseTags,
  type FileRecord
} from '../../electron/database/queue-db.js';

describe('QueueDB', () => {
  beforeEach(() => {
    // Use in-memory database for fast tests
    // Force reinit to ensure clean slate for each test
    initDatabase(':memory:', true);
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('addFile', () => {
    it('should add a new file to the queue', () => {
      const result = addFile('/test/file.pdf');
      expect(result).toBe(true);

      const file = getFile('/test/file.pdf');
      expect(file).toBeTruthy();
      expect(file?.file_path).toBe('/test/file.pdf');
      expect(file?.status).toBe('pending');
      expect(file?.progress).toBe(0);
    });

    it('should prevent duplicate files', () => {
      addFile('/test/file.pdf');
      const result = addFile('/test/file.pdf');

      expect(result).toBe(false);

      const files = getAllFiles();
      expect(files.length).toBe(1);
    });

    it('should allow adding multiple different files', () => {
      addFile('/test/file1.pdf');
      addFile('/test/file2.pdf');
      addFile('/test/file3.pdf');

      const files = getAllFiles();
      expect(files.length).toBe(3);
    });
  });

  describe('updateFileStatus', () => {
    it('should update file status and progress', () => {
      addFile('/test/file.pdf');

      updateFileStatus('/test/file.pdf', 'extracting', 25);

      const file = getFile('/test/file.pdf');
      expect(file?.status).toBe('extracting');
      expect(file?.progress).toBe(25);
    });

    it('should update error message', () => {
      addFile('/test/file.pdf');

      updateFileStatus('/test/file.pdf', 'error', 0, 'Test error');

      const file = getFile('/test/file.pdf');
      expect(file?.status).toBe('error');
      expect(file?.error_message).toBe('Test error');
    });

    it('should clear error message when set to null', () => {
      addFile('/test/file.pdf');
      updateFileStatus('/test/file.pdf', 'error', 0, 'Test error');
      updateFileStatus('/test/file.pdf', 'pending', 0);

      const file = getFile('/test/file.pdf');
      expect(file?.status).toBe('pending');
      expect(file?.error_message).toBeNull();
    });
  });

  describe('updateFileAnalysis', () => {
    it('should store AI analysis results', () => {
      addFile('/test/file.pdf');

      updateFileAnalysis('/test/file.pdf', 'Test Title', 'Test Description', ['tag1', 'tag2']);

      const file = getFile('/test/file.pdf');
      expect(file?.title).toBe('Test Title');
      expect(file?.description).toBe('Test Description');
      expect(file?.tags).toBe(JSON.stringify(['tag1', 'tag2']));
    });

    it('should handle empty tags', () => {
      addFile('/test/file.pdf');

      updateFileAnalysis('/test/file.pdf', 'Title', 'Description', []);

      const file = getFile('/test/file.pdf');
      expect(file?.tags).toBe('[]');
    });
  });

  describe('updateFileUpload', () => {
    it('should mark file as uploaded with note URL', () => {
      addFile('/test/file.pdf');

      const noteUrl = 'https://www.evernote.com/note/123';
      updateFileUpload('/test/file.pdf', noteUrl);

      const file = getFile('/test/file.pdf');
      expect(file?.status).toBe('complete');
      expect(file?.progress).toBe(100);
      expect(file?.note_url).toBe(noteUrl);
      expect(file?.uploaded_at).toBeTruthy();
      expect(file?.retry_after).toBeNull();
    });
  });

  describe('updateFileError', () => {
    it('should mark file as error with message', () => {
      addFile('/test/file.pdf');

      updateFileError('/test/file.pdf', 'Upload failed');

      const file = getFile('/test/file.pdf');
      expect(file?.status).toBe('error');
      expect(file?.progress).toBe(0);
      expect(file?.error_message).toBe('Upload failed');
    });
  });

  describe('updateRetryInfo', () => {
    it('should store retry timestamp', () => {
      addFile('/test/file.pdf');

      const retryAfter = Date.now() + 5000;
      updateRetryInfo('/test/file.pdf', retryAfter);

      const file = getFile('/test/file.pdf');
      expect(file?.retry_after).toBe(retryAfter);
      expect(file?.last_attempt_at).toBeTruthy();
    });
  });

  describe('isAlreadyProcessed', () => {
    it('should return true for analyzed file', () => {
      addFile('/test/file.pdf');
      updateFileAnalysis('/test/file.pdf', 'Title', 'Description', ['tag']);
      expect(isAlreadyProcessed('/test/file.pdf')).toBe(true);
    });

    it('should return false for non-existing file', () => {
      // Verify database is empty at start
      const files = getAllFiles();
      expect(files.length).toBe(0);

      expect(isAlreadyProcessed('/test/nonexistent.pdf')).toBe(false);
    });

    it('should return false for file without analysis', () => {
      // File exists in DB but has not been analyzed yet
      addFile('/test/pending-file.pdf');
      expect(isAlreadyProcessed('/test/pending-file.pdf')).toBe(false);
    });
  });

  describe('getReadyToUploadFiles', () => {
    it('should return only ready-to-upload files', () => {
      addFile('/test/file1.pdf');
      addFile('/test/file2.pdf');
      addFile('/test/file3.pdf');

      updateFileStatus('/test/file1.pdf', 'ready-to-upload', 100);
      updateFileStatus('/test/file2.pdf', 'extracting', 50);
      updateFileStatus('/test/file3.pdf', 'ready-to-upload', 100);

      const files = getReadyToUploadFiles();
      expect(files.length).toBe(2);
      expect(files.every(f => f.status === 'ready-to-upload')).toBe(true);
    });

    it('should return files in creation order', () => {
      addFile('/test/file1.pdf');
      addFile('/test/file2.pdf');

      updateFileStatus('/test/file1.pdf', 'ready-to-upload', 100);
      updateFileStatus('/test/file2.pdf', 'ready-to-upload', 100);

      const files = getReadyToUploadFiles();
      expect(files[0].file_path).toBe('/test/file1.pdf');
      expect(files[1].file_path).toBe('/test/file2.pdf');
    });
  });

  describe('shouldRetry', () => {
    it('should return true if no retry time set', () => {
      addFile('/test/file.pdf');
      expect(shouldRetry('/test/file.pdf')).toBe(true);
    });

    it('should return false if retry time not reached', () => {
      addFile('/test/file.pdf');

      const retryAfter = Date.now() + 10000; // 10 seconds in future
      updateRetryInfo('/test/file.pdf', retryAfter);

      expect(shouldRetry('/test/file.pdf')).toBe(false);
    });

    it('should return true if retry time has passed', () => {
      addFile('/test/file.pdf');

      const retryAfter = Date.now() - 1000; // 1 second ago
      updateRetryInfo('/test/file.pdf', retryAfter);

      expect(shouldRetry('/test/file.pdf')).toBe(true);
    });

    it('should return false for non-existing file', () => {
      expect(shouldRetry('/test/nonexistent.pdf')).toBe(false);
    });
  });

  describe('getPendingFiles', () => {
    it('should return only pending files', () => {
      addFile('/test/file1.pdf');
      addFile('/test/file2.pdf');
      addFile('/test/file3.pdf');

      updateFileStatus('/test/file2.pdf', 'extracting', 25);

      const files = getPendingFiles();
      expect(files.length).toBe(2);
      expect(files.every(f => f.status === 'pending')).toBe(true);
    });
  });

  describe('getAllFiles', () => {
    it('should return all files', () => {
      addFile('/test/file1.pdf');
      addFile('/test/file2.pdf');
      addFile('/test/file3.pdf');

      const files = getAllFiles();
      expect(files.length).toBe(3);
    });

    it('should return files in reverse creation order (newest first)', () => {
      addFile('/test/file1.pdf');
      addFile('/test/file2.pdf');
      addFile('/test/file3.pdf');

      const files = getAllFiles();
      expect(files[0].file_path).toBe('/test/file3.pdf');
      expect(files[2].file_path).toBe('/test/file1.pdf');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      addFile('/test/file1.pdf');
      addFile('/test/file2.pdf');
      addFile('/test/file3.pdf');
      addFile('/test/file4.pdf');
      addFile('/test/file5.pdf');
      addFile('/test/file6.pdf');

      updateFileStatus('/test/file1.pdf', 'pending', 0);
      updateFileStatus('/test/file2.pdf', 'extracting', 25);
      updateFileStatus('/test/file3.pdf', 'ready-to-upload', 100);
      updateFileStatus('/test/file4.pdf', 'uploading', 50);
      updateFileStatus('/test/file5.pdf', 'complete', 100);
      updateFileStatus('/test/file6.pdf', 'error', 0);

      const stats = getStats();
      expect(stats.total).toBe(6);
      expect(stats.pending).toBe(1);
      expect(stats.processing).toBe(1); // extracting
      expect(stats.readyToUpload).toBe(1);
      expect(stats.uploading).toBe(1);
      expect(stats.complete).toBe(1);
      expect(stats.error).toBe(1);
    });

    it('should return zero stats for empty database', () => {
      const stats = getStats();
      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.processing).toBe(0);
      expect(stats.complete).toBe(0);
    });
  });

  describe('deleteFile', () => {
    it('should delete a specific file', () => {
      addFile('/test/file1.pdf');
      addFile('/test/file2.pdf');

      deleteFile('/test/file1.pdf');

      const files = getAllFiles();
      expect(files.length).toBe(1);
      expect(files[0].file_path).toBe('/test/file2.pdf');
    });
  });

  describe('deleteCompletedFiles', () => {
    it('should delete only completed files', () => {
      addFile('/test/file1.pdf');
      addFile('/test/file2.pdf');
      addFile('/test/file3.pdf');

      updateFileStatus('/test/file1.pdf', 'complete', 100);
      updateFileStatus('/test/file2.pdf', 'pending', 0);
      updateFileStatus('/test/file3.pdf', 'complete', 100);

      const deleted = deleteCompletedFiles();
      expect(deleted).toBe(2);

      const files = getAllFiles();
      expect(files.length).toBe(1);
      expect(files[0].status).toBe('pending');
    });

    it('should return 0 if no completed files', () => {
      addFile('/test/file1.pdf');
      addFile('/test/file2.pdf');

      const deleted = deleteCompletedFiles();
      expect(deleted).toBe(0);
    });
  });

  describe('deleteAllFiles', () => {
    it('should delete all files', () => {
      addFile('/test/file1.pdf');
      addFile('/test/file2.pdf');
      addFile('/test/file3.pdf');

      const deleted = deleteAllFiles();
      expect(deleted).toBe(3);

      const files = getAllFiles();
      expect(files.length).toBe(0);
    });
  });

  describe('parseTags', () => {
    it('should parse tags from JSON string', () => {
      addFile('/test/file.pdf');
      updateFileAnalysis('/test/file.pdf', 'Title', 'Desc', ['tag1', 'tag2']);

      const file = getFile('/test/file.pdf');
      const tags = parseTags(file!);

      expect(tags).toEqual(['tag1', 'tag2']);
    });

    it('should return empty array for null tags', () => {
      addFile('/test/file.pdf');

      const file = getFile('/test/file.pdf');
      const tags = parseTags(file!);

      expect(tags).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      addFile('/test/file.pdf');
      const file = getFile('/test/file.pdf');

      // Manually corrupt the tags field
      file!.tags = 'invalid json';

      const tags = parseTags(file!);
      expect(tags).toEqual([]);
    });
  });

  describe('Bug Reproduction: Overlapping file paths', () => {
    it('should handle files with overlapping paths (plain.txt and plain.txt.evernote.json)', () => {
      // This is the original bug scenario
      const file1 = '/test/plain.txt';
      const file2 = '/test/plain.txt.evernote.json';

      // Add both files
      addFile(file1);
      addFile(file2);

      // Both should exist in database (but not yet "processed" without analysis)
      expect(getFile(file1)).not.toBeNull();
      expect(getFile(file2)).not.toBeNull();

      // They should be separate records
      const files = getAllFiles();
      expect(files.length).toBe(2);

      // Update one shouldn't affect the other
      updateFileStatus(file1, 'complete', 100);
      updateFileStatus(file2, 'error', 0, 'Unsupported file type');

      const f1 = getFile(file1);
      const f2 = getFile(file2);

      expect(f1?.status).toBe('complete');
      expect(f2?.status).toBe('error');

      // After marking complete, file1 should be considered "processed"
      expect(isAlreadyProcessed(file1)).toBe(true);
      // file2 with error status is not considered "processed" (no analysis data)
      expect(isAlreadyProcessed(file2)).toBe(false);
    });
  });

  describe('Bug Fix: isAlreadyProcessed behavior for pending files', () => {
    it('should return false for newly added files without analysis', () => {
      // BUG: When a file is added to DB with status='pending',
      // isAlreadyProcessed() returns true, causing analyzeFile() to exit early
      const filePath = '/test/new-file.pdf';

      // Add file to database (creates with status='pending', no analysis data)
      addFile(filePath);

      // Verify file exists in DB but has no analysis
      const file = getFile(filePath);
      expect(file).not.toBeNull();
      expect(file?.status).toBe('pending');
      expect(file?.title).toBeNull();
      expect(file?.description).toBeNull();

      // BUG: isAlreadyProcessed should return FALSE because file has no analysis yet
      // Currently returns TRUE, causing file to be skipped
      const result = isAlreadyProcessed(filePath);
      expect(result).toBe(false);
    });

    it('should return true for files with analysis data', () => {
      const filePath = '/test/analyzed-file.pdf';

      // Add file and set analysis data
      addFile(filePath);
      updateFileAnalysis(filePath, 'Test Title', 'Test Description', ['tag1']);

      // Now isAlreadyProcessed should return TRUE
      const result = isAlreadyProcessed(filePath);
      expect(result).toBe(true);
    });

    it('should return true for completed files', () => {
      const filePath = '/test/completed-file.pdf';

      addFile(filePath);
      updateFileStatus(filePath, 'complete', 100);

      const result = isAlreadyProcessed(filePath);
      expect(result).toBe(true);
    });

    it('should return true for ready-to-upload files', () => {
      const filePath = '/test/ready-file.pdf';

      addFile(filePath);
      updateFileAnalysis(filePath, 'Title', 'Description', ['tag']);
      updateFileStatus(filePath, 'ready-to-upload', 100);

      const result = isAlreadyProcessed(filePath);
      expect(result).toBe(true);
    });
  });
});
