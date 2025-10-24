import { describe, it, expect } from 'vitest';
import {
  updateFileFromIPCMessage,
  addFiles,
  removeCompletedFiles,
  clearAllFiles,
  updateFileStatus,
  type FileProgressData
} from '../../electron/utils/file-state-reducer.js';
import type { FileItem } from '../../electron/utils/processing-scheduler.js';

describe('file-state-reducer', () => {
  describe('updateFileFromIPCMessage', () => {
    it('should update file with new status and progress', () => {
      const files: FileItem[] = [
        { path: '/path/to/file1.pdf', name: 'file1.pdf', status: 'pending', progress: 0, created: 1000 },
        { path: '/path/to/file2.pdf', name: 'file2.pdf', status: 'pending', progress: 0, created: 2000 }
      ];

      const message: FileProgressData = {
        filePath: '/path/to/file1.pdf',
        status: 'analyzing',
        progress: 50,
        message: 'Analyzing with AI...'
      };

      const result = updateFileFromIPCMessage(files, message);

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('analyzing');
      expect(result[0].progress).toBe(50);
      expect(result[0].message).toBe('Analyzing with AI...');
      expect(result[1]).toEqual(files[1]); // Second file unchanged
    });

    it('should merge result data without losing existing data', () => {
      const files: FileItem[] = [
        {
          path: '/path/to/file.pdf',
          name: 'file.pdf',
          status: 'analyzing',
          progress: 50,
          created: 1000,
          result: { title: 'Original Title' }
        }
      ];

      const message: FileProgressData = {
        filePath: '/path/to/file.pdf',
        status: 'complete',
        progress: 100,
        result: {
          description: 'New Description',
          tags: ['tag1', 'tag2']
        }
      };

      const result = updateFileFromIPCMessage(files, message);

      expect(result[0].result).toEqual({
        title: 'Original Title',
        description: 'New Description',
        tags: ['tag1', 'tag2']
      });
    });

    it('should add error message when provided', () => {
      const files: FileItem[] = [
        { path: '/path/to/file.pdf', name: 'file.pdf', status: 'analyzing', progress: 50, created: 1000 }
      ];

      const message: FileProgressData = {
        filePath: '/path/to/file.pdf',
        status: 'error',
        progress: 0,
        error: 'Failed to extract content'
      };

      const result = updateFileFromIPCMessage(files, message);

      expect(result[0].status).toBe('error');
      expect(result[0].error).toBe('Failed to extract content');
    });

    it('should add jsonPath when provided', () => {
      const files: FileItem[] = [
        { path: '/path/to/file.pdf', name: 'file.pdf', status: 'analyzing', progress: 75, created: 1000 }
      ];

      const message: FileProgressData = {
        filePath: '/path/to/file.pdf',
        status: 'ready-to-upload',
        progress: 100,
        jsonPath: '/path/to/file.json'
      };

      const result = updateFileFromIPCMessage(files, message);

      expect(result[0].jsonPath).toBe('/path/to/file.json');
      expect(result[0].status).toBe('ready-to-upload');
    });

    it('should return unchanged list if file not found', () => {
      const files: FileItem[] = [
        { path: '/path/to/file1.pdf', name: 'file1.pdf', status: 'pending', progress: 0, created: 1000 }
      ];

      const message: FileProgressData = {
        filePath: '/path/to/nonexistent.pdf',
        status: 'analyzing',
        progress: 50
      };

      const result = updateFileFromIPCMessage(files, message);

      expect(result).toBe(files); // Same reference, unchanged
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(files[0]);
    });

    it('should be pure (not mutate original array)', () => {
      const files: FileItem[] = [
        { path: '/path/to/file.pdf', name: 'file.pdf', status: 'pending', progress: 0, created: 1000 }
      ];

      const original = [...files];

      const message: FileProgressData = {
        filePath: '/path/to/file.pdf',
        status: 'complete',
        progress: 100
      };

      const result = updateFileFromIPCMessage(files, message);

      expect(files).toEqual(original); // Original unchanged
      expect(result).not.toBe(files); // New array
      expect(result[0]).not.toBe(files[0]); // New object
    });

    it('should handle complete status with noteUrl', () => {
      const files: FileItem[] = [
        { path: '/path/to/file.pdf', name: 'file.pdf', status: 'uploading', progress: 90, created: 1000 }
      ];

      const message: FileProgressData = {
        filePath: '/path/to/file.pdf',
        status: 'complete',
        progress: 100,
        result: {
          noteUrl: 'https://www.evernote.com/Home.action#n=abc123',
          title: 'Final Title'
        }
      };

      const result = updateFileFromIPCMessage(files, message);

      expect(result[0].status).toBe('complete');
      expect(result[0].result?.noteUrl).toBe('https://www.evernote.com/Home.action#n=abc123');
      expect(result[0].result?.title).toBe('Final Title');
    });
  });

  describe('addFiles', () => {
    it('should add new files to empty list', () => {
      const files: FileItem[] = [];
      const newPaths = ['/path/to/file1.pdf', '/path/to/file2.pdf'];

      const result = addFiles(files, newPaths);

      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('/path/to/file1.pdf');
      expect(result[0].name).toBe('file1.pdf');
      expect(result[0].status).toBe('pending');
      expect(result[0].progress).toBe(0);
      expect(result[0].created).toBeGreaterThan(0);

      expect(result[1].path).toBe('/path/to/file2.pdf');
      expect(result[1].name).toBe('file2.pdf');
    });

    it('should append files to existing list', () => {
      const files: FileItem[] = [
        { path: '/existing/file.pdf', name: 'file.pdf', status: 'complete', progress: 100, created: 1000 }
      ];

      const newPaths = ['/new/file.pdf'];

      const result = addFiles(files, newPaths);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(files[0]); // Existing file preserved
      expect(result[1].path).toBe('/new/file.pdf');
      expect(result[1].status).toBe('pending');
    });

    it('should handle complex file paths', () => {
      const files: FileItem[] = [];
      const newPaths = [
        '/Users/john/Documents/My Report.pdf',
        '/path/with spaces/file name.docx'
      ];

      const result = addFiles(files, newPaths);

      expect(result[0].name).toBe('My Report.pdf');
      expect(result[1].name).toBe('file name.docx');
    });

    it('should handle paths without directory separators', () => {
      const files: FileItem[] = [];
      const newPaths = ['file.pdf'];

      const result = addFiles(files, newPaths);

      expect(result[0].name).toBe('file.pdf');
      expect(result[0].path).toBe('file.pdf');
    });

    it('should be pure (not mutate original array)', () => {
      const files: FileItem[] = [
        { path: '/existing.pdf', name: 'existing.pdf', status: 'pending', progress: 0, created: 1000 }
      ];

      const original = [...files];
      const newPaths = ['/new.pdf'];

      const result = addFiles(files, newPaths);

      expect(files).toEqual(original); // Original unchanged
      expect(result).not.toBe(files); // New array
    });

    it('should handle empty array of new paths', () => {
      const files: FileItem[] = [
        { path: '/existing.pdf', name: 'existing.pdf', status: 'pending', progress: 0, created: 1000 }
      ];

      const result = addFiles(files, []);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(files[0]);
    });

    it('should set timestamps for new files', () => {
      const beforeTime = Date.now();
      const result = addFiles([], ['/test.pdf']);
      const afterTime = Date.now();

      expect(result[0].created).toBeGreaterThanOrEqual(beforeTime);
      expect(result[0].created).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('removeCompletedFiles', () => {
    it('should remove all completed files', () => {
      const files: FileItem[] = [
        { path: '/file1.pdf', name: 'file1.pdf', status: 'complete', progress: 100, created: 1000 },
        { path: '/file2.pdf', name: 'file2.pdf', status: 'pending', progress: 0, created: 2000 },
        { path: '/file3.pdf', name: 'file3.pdf', status: 'complete', progress: 100, created: 3000 },
        { path: '/file4.pdf', name: 'file4.pdf', status: 'analyzing', progress: 50, created: 4000 }
      ];

      const result = removeCompletedFiles(files);

      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('/file2.pdf');
      expect(result[1].path).toBe('/file4.pdf');
      expect(result.every(f => f.status !== 'complete')).toBe(true);
    });

    it('should return empty array if all files are complete', () => {
      const files: FileItem[] = [
        { path: '/file1.pdf', name: 'file1.pdf', status: 'complete', progress: 100, created: 1000 },
        { path: '/file2.pdf', name: 'file2.pdf', status: 'complete', progress: 100, created: 2000 }
      ];

      const result = removeCompletedFiles(files);

      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it('should return all files if none are complete', () => {
      const files: FileItem[] = [
        { path: '/file1.pdf', name: 'file1.pdf', status: 'pending', progress: 0, created: 1000 },
        { path: '/file2.pdf', name: 'file2.pdf', status: 'analyzing', progress: 50, created: 2000 },
        { path: '/file3.pdf', name: 'file3.pdf', status: 'error', progress: 0, created: 3000 }
      ];

      const result = removeCompletedFiles(files);

      expect(result).toHaveLength(3);
      expect(result).toEqual(files);
    });

    it('should handle empty array', () => {
      const result = removeCompletedFiles([]);

      expect(result).toEqual([]);
    });

    it('should be pure (not mutate original array)', () => {
      const files: FileItem[] = [
        { path: '/file1.pdf', name: 'file1.pdf', status: 'complete', progress: 100, created: 1000 },
        { path: '/file2.pdf', name: 'file2.pdf', status: 'pending', progress: 0, created: 2000 }
      ];

      const original = [...files];

      const result = removeCompletedFiles(files);

      expect(files).toEqual(original); // Original unchanged
      expect(result).not.toBe(files); // New array
    });

    it('should preserve all other statuses', () => {
      const files: FileItem[] = [
        { path: '/f1.pdf', name: 'f1.pdf', status: 'pending', progress: 0, created: 1 },
        { path: '/f2.pdf', name: 'f2.pdf', status: 'extracting', progress: 25, created: 2 },
        { path: '/f3.pdf', name: 'f3.pdf', status: 'analyzing', progress: 50, created: 3 },
        { path: '/f4.pdf', name: 'f4.pdf', status: 'ready-to-upload', progress: 75, created: 4 },
        { path: '/f5.pdf', name: 'f5.pdf', status: 'uploading', progress: 90, created: 5 },
        { path: '/f6.pdf', name: 'f6.pdf', status: 'complete', progress: 100, created: 6 },
        { path: '/f7.pdf', name: 'f7.pdf', status: 'error', progress: 0, created: 7 },
        { path: '/f8.pdf', name: 'f8.pdf', status: 'rate-limited', progress: 0, created: 8 },
        { path: '/f9.pdf', name: 'f9.pdf', status: 'retrying', progress: 0, created: 9 }
      ];

      const result = removeCompletedFiles(files);

      expect(result).toHaveLength(8); // All except 'complete'
      expect(result.find(f => f.status === 'complete')).toBeUndefined();
    });
  });

  describe('clearAllFiles', () => {
    it('should return empty array', () => {
      const result = clearAllFiles();

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should always return new empty array', () => {
      const result1 = clearAllFiles();
      const result2 = clearAllFiles();

      expect(result1).toEqual([]);
      expect(result2).toEqual([]);
      expect(result1).not.toBe(result2); // Different references
    });
  });

  describe('updateFileStatus', () => {
    it('should update status of matching file', () => {
      const files: FileItem[] = [
        { path: '/file1.pdf', name: 'file1.pdf', status: 'pending', progress: 0, created: 1000 },
        { path: '/file2.pdf', name: 'file2.pdf', status: 'analyzing', progress: 50, created: 2000 }
      ];

      const result = updateFileStatus(files, '/file1.pdf', 'complete');

      expect(result[0].status).toBe('complete');
      expect(result[0].path).toBe('/file1.pdf');
      expect(result[1]).toEqual(files[1]); // Other file unchanged
    });

    it('should update status with error message', () => {
      const files: FileItem[] = [
        { path: '/file.pdf', name: 'file.pdf', status: 'analyzing', progress: 50, created: 1000 }
      ];

      const result = updateFileStatus(files, '/file.pdf', 'error', 'Failed to analyze');

      expect(result[0].status).toBe('error');
      expect(result[0].error).toBe('Failed to analyze');
    });

    it('should return unchanged list if file not found', () => {
      const files: FileItem[] = [
        { path: '/file1.pdf', name: 'file1.pdf', status: 'pending', progress: 0, created: 1000 }
      ];

      const result = updateFileStatus(files, '/nonexistent.pdf', 'complete');

      expect(result).toEqual(files);
    });

    it('should handle all status types', () => {
      const files: FileItem[] = [
        { path: '/file.pdf', name: 'file.pdf', status: 'pending', progress: 0, created: 1000 }
      ];

      const statuses: Array<FileItem['status']> = [
        'pending', 'extracting', 'analyzing', 'ready-to-upload',
        'uploading', 'rate-limited', 'retrying', 'complete', 'error'
      ];

      for (const status of statuses) {
        const result = updateFileStatus(files, '/file.pdf', status);
        expect(result[0].status).toBe(status);
      }
    });

    it('should be pure (not mutate original array)', () => {
      const files: FileItem[] = [
        { path: '/file.pdf', name: 'file.pdf', status: 'pending', progress: 0, created: 1000 }
      ];

      const original = [...files];

      const result = updateFileStatus(files, '/file.pdf', 'analyzing');

      expect(files).toEqual(original); // Original unchanged
      expect(result).not.toBe(files); // New array
      expect(result[0]).not.toBe(files[0]); // New object
    });

    it('should clear error when updating to non-error status', () => {
      const files: FileItem[] = [
        { path: '/file.pdf', name: 'file.pdf', status: 'error', progress: 0, created: 1000, error: 'Old error' }
      ];

      const result = updateFileStatus(files, '/file.pdf', 'retrying');

      expect(result[0].status).toBe('retrying');
      expect(result[0].error).toBeUndefined();
    });

    it('should handle empty array', () => {
      const result = updateFileStatus([], '/file.pdf', 'complete');

      expect(result).toEqual([]);
    });

    it('should preserve other file properties', () => {
      const files: FileItem[] = [
        {
          path: '/file.pdf',
          name: 'file.pdf',
          status: 'analyzing',
          progress: 50,
          created: 1000,
          message: 'Analyzing...',
          result: { title: 'Test' },
          jsonPath: '/test.json'
        }
      ];

      const result = updateFileStatus(files, '/file.pdf', 'complete');

      expect(result[0].progress).toBe(50);
      expect(result[0].message).toBe('Analyzing...');
      expect(result[0].result).toEqual({ title: 'Test' });
      expect(result[0].jsonPath).toBe('/test.json');
      expect(result[0].created).toBe(1000);
    });
  });
});
