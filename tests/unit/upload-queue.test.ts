import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  getJSONPath,
  hasExistingJSON,
  saveNoteToJSON,
  loadNoteFromJSON,
  isUploaded,
  uploadNoteFromJSON,
  findPendingUploads,
  getPendingCount,
} from '../../src/upload-queue.js';
import { resetEvernoteMocks, mockCreateNote, mockRateLimitError } from '../mocks/evernote.mock.js';

// Mock the evernote module
vi.mock('evernote', async () => {
  const mocks = await import('../mocks/evernote.mock.js');
  return { default: mocks.mockEvernote };
});

// Mock oauth-helper
vi.mock('../../src/oauth-helper.js', () => ({
  getToken: vi.fn().mockResolvedValue('mock-token'),
}));

describe('upload-queue', () => {
  let tempDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    resetEvernoteMocks();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'queue-test-'));
    testFilePath = path.join(tempDir, 'test.pdf');
    await fs.writeFile(testFilePath, 'test content', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('getJSONPath', () => {
    it('should append .evernote.json to file path', () => {
      const jsonPath = getJSONPath('/path/to/file.pdf');
      expect(jsonPath).toBe('/path/to/file.pdf.evernote.json');
    });

    it('should work with files that have no extension', () => {
      const jsonPath = getJSONPath('/path/to/file');
      expect(jsonPath).toBe('/path/to/file.evernote.json');
    });
  });

  describe('hasExistingJSON', () => {
    it('should return false if JSON does not exist', async () => {
      const exists = await hasExistingJSON(testFilePath);
      expect(exists).toBe(false);
    });

    it('should return true if JSON exists', async () => {
      const jsonPath = getJSONPath(testFilePath);
      await fs.writeFile(jsonPath, '{}', 'utf8');

      const exists = await hasExistingJSON(testFilePath);
      expect(exists).toBe(true);
    });
  });

  describe('saveNoteToJSON', () => {
    it('should save note data to JSON file', async () => {
      const noteData = {
        title: 'Test Title',
        description: 'Test Description',
        tags: ['tag1', 'tag2'],
      };

      const jsonPath = await saveNoteToJSON(testFilePath, noteData);

      expect(jsonPath).toBe(getJSONPath(testFilePath));

      const savedData = await loadNoteFromJSON(jsonPath);
      expect(savedData.title).toBe('Test Title');
      expect(savedData.description).toBe('Test Description');
      expect(savedData.tags).toEqual(['tag1', 'tag2']);
      expect(savedData.filePath).toBe(testFilePath);
    });

    it('should include metadata in saved JSON', async () => {
      const noteData = {
        title: 'Test',
        description: 'Desc',
        tags: [],
      };

      const jsonPath = await saveNoteToJSON(testFilePath, noteData);
      const savedData = await loadNoteFromJSON(jsonPath);

      expect(savedData).toHaveProperty('createdAt');
      expect(savedData).toHaveProperty('lastAttempt');
      expect(savedData).toHaveProperty('retryAfter');
      expect(savedData.lastAttempt).toBeNull();
      expect(savedData.retryAfter).toBeNull();
    });
  });

  describe('loadNoteFromJSON', () => {
    it('should load and parse JSON file', async () => {
      const noteData = {
        title: 'Test',
        description: 'Desc',
        tags: ['tag1'],
      };

      const jsonPath = await saveNoteToJSON(testFilePath, noteData);
      const loaded = await loadNoteFromJSON(jsonPath);

      expect(loaded.title).toBe('Test');
      expect(loaded.description).toBe('Desc');
      expect(loaded.tags).toEqual(['tag1']);
    });

    it('should throw error for non-existent file', async () => {
      const fakePath = path.join(tempDir, 'fake.json');

      await expect(loadNoteFromJSON(fakePath)).rejects.toThrow();
    });
  });

  describe('isUploaded', () => {
    it('should return false for pending upload', async () => {
      const jsonPath = await saveNoteToJSON(testFilePath, {
        title: 'Test',
        description: 'Desc',
        tags: [],
      });

      const uploaded = await isUploaded(jsonPath);
      expect(uploaded).toBe(false);
    });

    it('should return true for uploaded note', async () => {
      const jsonPath = await saveNoteToJSON(testFilePath, {
        title: 'Test',
        description: 'Desc',
        tags: [],
      });

      // Simulate upload
      const data = await loadNoteFromJSON(jsonPath);
      data.uploadedAt = new Date().toISOString();
      await fs.writeFile(jsonPath, JSON.stringify(data), 'utf8');

      const uploaded = await isUploaded(jsonPath);
      expect(uploaded).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const fakePath = path.join(tempDir, 'fake.json');
      const uploaded = await isUploaded(fakePath);
      expect(uploaded).toBe(false);
    });
  });

  describe('uploadNoteFromJSON', () => {
    it('should upload note successfully', async () => {
      const jsonPath = await saveNoteToJSON(testFilePath, {
        title: 'Test',
        description: 'Desc',
        tags: ['tag1'],
      });

      const result = await uploadNoteFromJSON(jsonPath);

      expect(result.success).toBe(true);
      expect(result.noteUrl).toBeDefined();
      expect(mockCreateNote).toHaveBeenCalled();
    });

    it('should mark note as uploaded in JSON', async () => {
      const jsonPath = await saveNoteToJSON(testFilePath, {
        title: 'Test',
        description: 'Desc',
        tags: [],
      });

      await uploadNoteFromJSON(jsonPath);

      const data = await loadNoteFromJSON(jsonPath);
      expect(data.uploadedAt).toBeDefined();
      expect(data.noteUrl).toBeDefined();
    });

    it('should skip already uploaded notes', async () => {
      const jsonPath = await saveNoteToJSON(testFilePath, {
        title: 'Test',
        description: 'Desc',
        tags: [],
      });

      // First upload
      await uploadNoteFromJSON(jsonPath);

      // Reset mock
      mockCreateNote.mockClear();

      // Second upload should skip
      const result = await uploadNoteFromJSON(jsonPath);

      expect(result.success).toBe(true);
      expect(result.alreadyUploaded).toBe(true);
      expect(mockCreateNote).not.toHaveBeenCalled();
    });

    it('should handle rate limit error', async () => {
      const jsonPath = await saveNoteToJSON(testFilePath, {
        title: 'Test',
        description: 'Desc',
        tags: [],
      });

      mockRateLimitError();

      const result = await uploadNoteFromJSON(jsonPath);

      expect(result.success).toBe(false);
      expect(result.rateLimitDuration).toBe(60);
      expect(result.error).toBeDefined();
    });

    it('should update retry time on rate limit', async () => {
      const jsonPath = await saveNoteToJSON(testFilePath, {
        title: 'Test',
        description: 'Desc',
        tags: [],
      });

      mockRateLimitError();

      await uploadNoteFromJSON(jsonPath);

      const data = await loadNoteFromJSON(jsonPath);
      expect(data.retryAfter).toBeGreaterThan(Date.now());
      expect(data.lastAttempt).toBeDefined();
    });

    it('should handle missing original file', async () => {
      const jsonPath = await saveNoteToJSON(testFilePath, {
        title: 'Test',
        description: 'Desc',
        tags: [],
      });

      // Delete original file
      await fs.unlink(testFilePath);

      const result = await uploadNoteFromJSON(jsonPath);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Original file not found');
    });
  });

  describe('findPendingUploads', () => {
    it('should find pending JSON files', async () => {
      // Create multiple test files
      const file1 = path.join(tempDir, 'file1.pdf');
      const file2 = path.join(tempDir, 'file2.pdf');

      await fs.writeFile(file1, 'content1', 'utf8');
      await fs.writeFile(file2, 'content2', 'utf8');

      await saveNoteToJSON(file1, { title: 'T1', description: 'D1', tags: [] });
      await saveNoteToJSON(file2, { title: 'T2', description: 'D2', tags: [] });

      const pending = await findPendingUploads(tempDir);

      expect(pending.length).toBe(2);
      expect(pending[0]).toMatch(/\.evernote\.json$/);
    });

    it('should not include uploaded notes', async () => {
      const file1 = path.join(tempDir, 'file1.pdf');
      const file2 = path.join(tempDir, 'file2.pdf');

      await fs.writeFile(file1, 'content1', 'utf8');
      await fs.writeFile(file2, 'content2', 'utf8');

      const json1 = await saveNoteToJSON(file1, { title: 'T1', description: 'D1', tags: [] });
      await saveNoteToJSON(file2, { title: 'T2', description: 'D2', tags: [] });

      // Mark first as uploaded
      const data1 = await loadNoteFromJSON(json1);
      data1.uploadedAt = new Date().toISOString();
      await fs.writeFile(json1, JSON.stringify(data1), 'utf8');

      const pending = await findPendingUploads(tempDir);

      expect(pending.length).toBe(1);
    });

    it('should handle empty directory', async () => {
      const pending = await findPendingUploads(tempDir);
      expect(pending).toEqual([]);
    });

    it('should recursively search subdirectories', async () => {
      const subdir = path.join(tempDir, 'subdir');
      await fs.mkdir(subdir);

      const file1 = path.join(tempDir, 'file1.pdf');
      const file2 = path.join(subdir, 'file2.pdf');

      await fs.writeFile(file1, 'content1', 'utf8');
      await fs.writeFile(file2, 'content2', 'utf8');

      await saveNoteToJSON(file1, { title: 'T1', description: 'D1', tags: [] });
      await saveNoteToJSON(file2, { title: 'T2', description: 'D2', tags: [] });

      const pending = await findPendingUploads(tempDir);

      expect(pending.length).toBe(2);
    });
  });

  describe('getPendingCount', () => {
    it('should return correct count of pending uploads', async () => {
      const file1 = path.join(tempDir, 'file1.pdf');
      const file2 = path.join(tempDir, 'file2.pdf');

      await fs.writeFile(file1, 'content1', 'utf8');
      await fs.writeFile(file2, 'content2', 'utf8');

      await saveNoteToJSON(file1, { title: 'T1', description: 'D1', tags: [] });
      await saveNoteToJSON(file2, { title: 'T2', description: 'D2', tags: [] });

      const count = await getPendingCount(tempDir);

      expect(count).toBe(2);
    });

    it('should return 0 for empty directory', async () => {
      const count = await getPendingCount(tempDir);
      expect(count).toBe(0);
    });
  });
});
