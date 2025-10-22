import { describe, it, expect } from 'vitest';
import { ProcessingScheduler, type FileItem } from '../../electron/utils/processing-scheduler.js';
import { updateFileFromIPCMessage, addFiles, updateFileStatus } from '../../electron/utils/file-state-reducer.js';

describe('ProcessingScheduler', () => {
  describe('getFilesToProcess', () => {
    it('should return files up to max concurrent limit', () => {
      const scheduler = new ProcessingScheduler(3);
      const files: FileItem[] = [
        { path: '/test/a.pdf', name: 'a.pdf', status: 'pending', progress: 0 },
        { path: '/test/b.pdf', name: 'b.pdf', status: 'pending', progress: 0 },
        { path: '/test/c.pdf', name: 'c.pdf', status: 'pending', progress: 0 },
        { path: '/test/d.pdf', name: 'd.pdf', status: 'pending', progress: 0 },
      ];

      const toProcess = scheduler.getFilesToProcess(files);

      expect(toProcess.length).toBe(3); // Max concurrent is 3
      expect(toProcess[0].path).toBe('/test/a.pdf');
      expect(toProcess[1].path).toBe('/test/b.pdf');
      expect(toProcess[2].path).toBe('/test/c.pdf');
    });

    it('should account for already processing files', () => {
      const scheduler = new ProcessingScheduler(3);
      const files: FileItem[] = [
        { path: '/test/a.pdf', name: 'a.pdf', status: 'extracting', progress: 25 },
        { path: '/test/b.pdf', name: 'b.pdf', status: 'pending', progress: 0 },
        { path: '/test/c.pdf', name: 'c.pdf', status: 'pending', progress: 0 },
        { path: '/test/d.pdf', name: 'd.pdf', status: 'pending', progress: 0 },
      ];

      const toProcess = scheduler.getFilesToProcess(files);

      expect(toProcess.length).toBe(2); // 3 max - 1 processing = 2 slots
      expect(toProcess[0].path).toBe('/test/b.pdf');
      expect(toProcess[1].path).toBe('/test/c.pdf');
    });

    it('should return empty array when at max capacity', () => {
      const scheduler = new ProcessingScheduler(2);
      const files: FileItem[] = [
        { path: '/test/a.pdf', name: 'a.pdf', status: 'extracting', progress: 25 },
        { path: '/test/b.pdf', name: 'b.pdf', status: 'analyzing', progress: 50 },
        { path: '/test/c.pdf', name: 'c.pdf', status: 'pending', progress: 0 },
      ];

      const toProcess = scheduler.getFilesToProcess(files);

      expect(toProcess.length).toBe(0); // All slots full
    });

    it('should only count extracting and analyzing as processing', () => {
      const scheduler = new ProcessingScheduler(3);
      const files: FileItem[] = [
        { path: '/test/a.pdf', name: 'a.pdf', status: 'ready-to-upload', progress: 100 },
        { path: '/test/b.pdf', name: 'b.pdf', status: 'uploading', progress: 90 },
        { path: '/test/c.pdf', name: 'c.pdf', status: 'pending', progress: 0 },
        { path: '/test/d.pdf', name: 'd.pdf', status: 'pending', progress: 0 },
      ];

      const toProcess = scheduler.getFilesToProcess(files);

      expect(toProcess.length).toBe(2); // ready-to-upload and uploading don't count
    });
  });

  describe('shouldProcessMore', () => {
    it('should return true when pending files and available slots', () => {
      const scheduler = new ProcessingScheduler(3);
      const files: FileItem[] = [
        { path: '/test/a.pdf', name: 'a.pdf', status: 'pending', progress: 0 },
      ];

      expect(scheduler.shouldProcessMore(files)).toBe(true);
    });

    it('should return false when no pending files', () => {
      const scheduler = new ProcessingScheduler(3);
      const files: FileItem[] = [
        { path: '/test/a.pdf', name: 'a.pdf', status: 'complete', progress: 100 },
      ];

      expect(scheduler.shouldProcessMore(files)).toBe(false);
    });

    it('should return false when at max capacity', () => {
      const scheduler = new ProcessingScheduler(2);
      const files: FileItem[] = [
        { path: '/test/a.pdf', name: 'a.pdf', status: 'extracting', progress: 25 },
        { path: '/test/b.pdf', name: 'b.pdf', status: 'analyzing', progress: 50 },
        { path: '/test/c.pdf', name: 'c.pdf', status: 'pending', progress: 0 },
      ];

      expect(scheduler.shouldProcessMore(files)).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const scheduler = new ProcessingScheduler(3);
      const files: FileItem[] = [
        { path: '/test/a.pdf', name: 'a.pdf', status: 'pending', progress: 0 },
        { path: '/test/b.pdf', name: 'b.pdf', status: 'extracting', progress: 25 },
        { path: '/test/c.pdf', name: 'c.pdf', status: 'analyzing', progress: 50 },
        { path: '/test/d.pdf', name: 'd.pdf', status: 'ready-to-upload', progress: 100 },
        { path: '/test/e.pdf', name: 'e.pdf', status: 'uploading', progress: 90 },
        { path: '/test/f.pdf', name: 'f.pdf', status: 'complete', progress: 100 },
        { path: '/test/g.json', name: 'g.json', status: 'error', progress: 0, error: 'Unsupported' },
      ];

      const stats = scheduler.getStats(files);

      expect(stats.total).toBe(7);
      expect(stats.pending).toBe(1);
      expect(stats.processing).toBe(2); // extracting + analyzing
      expect(stats.readyToUpload).toBe(1);
      expect(stats.uploading).toBe(1);
      expect(stats.complete).toBe(1);
      expect(stats.error).toBe(1);
    });
  });
});

describe('Concurrent Processing Bug Scenario', () => {
  it('should continue processing valid file when another file fails', () => {
    const scheduler = new ProcessingScheduler(3);

    // Step 1: Add two files (one valid PDF, one unsupported JSON)
    let files = addFiles([], [
      '/test/fixtures/pdf-with-text.pdf',
      '/test/fixtures/unsupported.json'
    ]);

    expect(files.length).toBe(2);
    expect(files[0].status).toBe('pending');
    expect(files[1].status).toBe('pending');

    // Step 2: Both files should start processing
    const toProcess = scheduler.getFilesToProcess(files);
    expect(toProcess.length).toBe(2);

    // Step 3: Simulate both files starting extraction
    files = updateFileFromIPCMessage(files, {
      filePath: '/test/fixtures/pdf-with-text.pdf',
      status: 'extracting',
      progress: 10,
      message: 'Extracting file content...'
    });

    files = updateFileFromIPCMessage(files, {
      filePath: '/test/fixtures/unsupported.json',
      status: 'extracting',
      progress: 10,
      message: 'Extracting file content...'
    });

    expect(files[0].status).toBe('extracting');
    expect(files[1].status).toBe('extracting');

    // Step 4: JSON file fails with unsupported type error
    files = updateFileFromIPCMessage(files, {
      filePath: '/test/fixtures/unsupported.json',
      status: 'error',
      progress: 0,
      error: 'Failed to extract content from unsupported.json: Unsupported file type: .json'
    });

    expect(files[1].status).toBe('error');
    expect(files[1].error).toContain('Unsupported file type');

    // Step 5: PDF continues to analyzing (THIS IS THE BUG - PDF should not be affected)
    files = updateFileFromIPCMessage(files, {
      filePath: '/test/fixtures/pdf-with-text.pdf',
      status: 'analyzing',
      progress: 50,
      message: 'Analyzing with AI...'
    });

    // CRITICAL ASSERTION: PDF should have progressed, not stuck at extracting
    expect(files[0].status).toBe('analyzing');
    expect(files[0].progress).toBe(50);

    // Step 6: PDF completes analysis
    files = updateFileFromIPCMessage(files, {
      filePath: '/test/fixtures/pdf-with-text.pdf',
      status: 'ready-to-upload',
      progress: 100,
      message: 'Analysis complete, ready to upload',
      result: {
        title: 'Test Document',
        description: 'A test document',
        tags: ['test']
      }
    });

    // CRITICAL ASSERTION: PDF should complete successfully
    expect(files[0].status).toBe('ready-to-upload');
    expect(files[0].result?.title).toBe('Test Document');

    // Verify final state
    expect(files[0].status).toBe('ready-to-upload'); // PDF succeeded
    expect(files[1].status).toBe('error'); // JSON failed
  });

  it('should handle path mismatches gracefully', () => {
    let files = addFiles([], ['/test/file.pdf']);

    // Try to update with different path (simulates path normalization issue)
    const updatedFiles = updateFileFromIPCMessage(files, {
      filePath: '/test/different.pdf', // Path mismatch
      status: 'extracting',
      progress: 10
    });

    // File should not be updated (path doesn't match)
    expect(updatedFiles).toEqual(files);
    expect(updatedFiles[0].status).toBe('pending'); // Unchanged
  });

  it('should maintain immutability when updating files', () => {
    const original = addFiles([], ['/test/file.pdf']);

    const updated = updateFileFromIPCMessage(original, {
      filePath: '/test/file.pdf',
      status: 'extracting',
      progress: 25
    });

    // Original should be unchanged
    expect(original[0].status).toBe('pending');
    expect(original[0].progress).toBe(0);

    // Updated should have new values
    expect(updated[0].status).toBe('extracting');
    expect(updated[0].progress).toBe(25);

    // Should be different arrays
    expect(updated).not.toBe(original);
  });
});
