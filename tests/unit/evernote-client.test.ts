import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createNote, listTags } from '../../electron/evernote-client.js';
import {
  resetEvernoteMocks,
  mockCreateNote,
  mockListTags,
  mockRateLimitError,
  mockAuthError,
} from '../mocks/evernote.mock.js';

// Mock the evernote module
vi.mock('evernote', async () => {
  const mocks = await import('../mocks/evernote.mock.js');
  return { default: mocks.mockEvernote };
});

// Mock oauth-helper to return a fake token
vi.mock('../../electron/oauth-helper.js', () => ({
  getToken: vi.fn().mockResolvedValue('mock-token-123'),
}));

describe('evernote-client', () => {
  let tempDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Reset all mocks before each test
    resetEvernoteMocks();

    // Create temp directory and test file
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'evernote-test-'));
    testFilePath = path.join(tempDir, 'test.pdf');
    await fs.writeFile(testFilePath, 'Mock PDF content for testing', 'utf8');

    // Set default environment
    process.env['EVERNOTE_ENDPOINT'] = 'https://www.evernote.com';
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('createNote', () => {
    it('should create a note with file attachment', async () => {
      const title = 'Test Note Title';
      const description = 'Test note description';
      const tags = ['tag1', 'tag2'];

      const noteUrl = await createNote(testFilePath, title, description, tags);

      expect(noteUrl).toContain('Home.action#n=mock-note-guid-123');
      expect(mockCreateNote).toHaveBeenCalledOnce();

      // Verify note was created with correct structure
      const noteArg = mockCreateNote.mock.calls[0]?.[0];
      expect(noteArg).toBeDefined();
      expect(noteArg.title).toBe(title);
      expect(noteArg.tagNames).toEqual(tags);
    });

    it('should attach file as resource', async () => {
      await createNote(testFilePath, 'Title', 'Description', []);

      const noteArg = mockCreateNote.mock.calls[0]?.[0];
      expect(noteArg.resources).toBeDefined();
      expect(Array.isArray(noteArg.resources)).toBe(true);
      expect(noteArg.resources?.length).toBe(1);
    });

    it('should include file name in note content', async () => {
      await createNote(testFilePath, 'Title', 'Description', []);

      const noteArg = mockCreateNote.mock.calls[0]?.[0];
      expect(noteArg.content).toContain('test.pdf');
      expect(noteArg.content).toContain('Description');
    });

    it('should handle rate limit error', async () => {
      mockRateLimitError();

      await expect(
        createNote(testFilePath, 'Title', 'Desc', [])
      ).rejects.toThrow(/Rate limit/);
    });

    it('should handle authentication error', async () => {
      const { getToken } = await import('../../electron/oauth-helper.js');
      vi.mocked(getToken).mockResolvedValueOnce(null);

      await expect(
        createNote(testFilePath, 'Title', 'Desc', [])
      ).rejects.toThrow(/Not authenticated/);
    });

    it('should handle sandbox endpoint', async () => {
      process.env['EVERNOTE_ENDPOINT'] = 'https://sandbox.evernote.com';

      await createNote(testFilePath, 'Title', 'Desc', []);

      // Should still work with sandbox
      expect(mockCreateNote).toHaveBeenCalled();
    });

    it('should handle file with spaces in name', async () => {
      const spacedFilePath = path.join(tempDir, 'file with spaces.pdf');
      await fs.writeFile(spacedFilePath, 'content', 'utf8');

      await createNote(spacedFilePath, 'Title', 'Desc', []);

      const noteArg = mockCreateNote.mock.calls[0]?.[0];
      expect(noteArg.content).toContain('file with spaces.pdf');
    });

    it('should handle empty tags array', async () => {
      await createNote(testFilePath, 'Title', 'Desc', []);

      const noteArg = mockCreateNote.mock.calls[0]?.[0];
      expect(noteArg.tagNames).toEqual([]);
    });

    it('should escape XML characters in description', async () => {
      const descWithSpecialChars = 'Test <description> with & special "characters"';

      await createNote(testFilePath, 'Title', descWithSpecialChars, []);

      const noteArg = mockCreateNote.mock.calls[0]?.[0];
      expect(noteArg.content).toContain('&lt;');
      expect(noteArg.content).toContain('&gt;');
      expect(noteArg.content).toContain('&amp;');
      expect(noteArg.content).toContain('&quot;');
    });

    it('should create valid ENML content', async () => {
      await createNote(testFilePath, 'Title', 'Description', []);

      const noteArg = mockCreateNote.mock.calls[0]?.[0];
      expect(noteArg.content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(noteArg.content).toContain('<!DOCTYPE en-note');
      expect(noteArg.content).toContain('<en-note>');
      expect(noteArg.content).toContain('</en-note>');
      expect(noteArg.content).toContain('<en-media');
    });

    it('should set correct MIME type for PDF', async () => {
      await createNote(testFilePath, 'Title', 'Desc', []);

      const noteArg = mockCreateNote.mock.calls[0]?.[0];
      const resource = noteArg.resources?.[0];
      expect(resource?.mime).toBe('application/pdf');
    });

    it('should set correct MIME type for DOCX', async () => {
      const docxPath = path.join(tempDir, 'test.docx');
      await fs.writeFile(docxPath, 'content', 'utf8');

      await createNote(docxPath, 'Title', 'Desc', []);

      const noteArg = mockCreateNote.mock.calls[0]?.[0];
      const resource = noteArg.resources?.[0];
      expect(resource?.mime).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('should set correct MIME type for images', async () => {
      const pngPath = path.join(tempDir, 'test.png');
      await fs.writeFile(pngPath, 'content', 'utf8');

      await createNote(pngPath, 'Title', 'Desc', []);

      const noteArg = mockCreateNote.mock.calls[0]?.[0];
      const resource = noteArg.resources?.[0];
      expect(resource?.mime).toBe('image/png');
    });

    it('should handle missing file gracefully', async () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.pdf');

      await expect(
        createNote(nonExistentPath, 'Title', 'Desc', [])
      ).rejects.toThrow();
    });
  });

  describe('listTags', () => {
    it('should return list of tag names', async () => {
      const tags = await listTags();

      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThan(0);
      expect(tags).toEqual(['tag1', 'tag2', 'tag3']);
      expect(mockListTags).toHaveBeenCalledOnce();
    });

    it('should handle empty tags list', async () => {
      mockListTags.mockResolvedValueOnce([]);

      const tags = await listTags();

      expect(tags).toEqual([]);
      expect(Array.isArray(tags)).toBe(true);
    });

    it('should handle authentication error', async () => {
      const { getToken } = await import('../../electron/oauth-helper.js');
      vi.mocked(getToken).mockResolvedValueOnce(null);

      await expect(listTags()).rejects.toThrow(/Not authenticated/);
    });

    it('should work with sandbox endpoint', async () => {
      process.env['EVERNOTE_ENDPOINT'] = 'https://sandbox.evernote.com';

      const tags = await listTags();

      expect(tags).toBeDefined();
      expect(mockListTags).toHaveBeenCalled();
    });
  });
});
