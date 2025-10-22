import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  createNote,
  listTags,
  listNotebooks,
  listNotesInNotebook,
  getNoteWithContent,
  updateNote,
  getNoteApplicationData
} from '../../electron/evernote/client.js';
import {
  resetEvernoteMocks,
  mockCreateNote,
  mockListTags,
  mockListNotebooks,
  mockFindNotesMetadata,
  mockGetNote,
  mockUpdateNote,
  mockRateLimitError,
  mockAuthError,
} from '../mocks/evernote.mock.js';

// Mock the evernote module
vi.mock('evernote', async () => {
  const mocks = await import('../mocks/evernote.mock.js');
  return { default: mocks.mockEvernote };
});

// Mock oauth-helper to return a fake token
vi.mock('../../electron/evernote/oauth-helper.js', () => ({
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
      const { getToken } = await import('../../electron/evernote/oauth-helper.js');
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
      const { getToken } = await import('../../electron/evernote/oauth-helper.js');
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

  describe('Note Augmentation Functions', () => {

    describe('listNotebooks', () => {
      it('should return list of notebooks', async () => {
        mockListNotebooks.mockResolvedValueOnce([
          { guid: 'nb1', name: 'Documents', defaultNotebook: true },
          { guid: 'nb2', name: 'Work', defaultNotebook: false }
        ]);

        const notebooks = await listNotebooks();

        expect(notebooks).toHaveLength(2);
        expect(notebooks[0].name).toBe('Documents');
        expect(notebooks[0].defaultNotebook).toBe(true);
        expect(mockListNotebooks).toHaveBeenCalledOnce();
      });

      it('should handle authentication error', async () => {
        const { getToken } = await import('../../electron/evernote/oauth-helper.js');
        vi.mocked(getToken).mockResolvedValueOnce(null);

        await expect(listNotebooks()).rejects.toThrow(/Not authenticated/);
      });

      it('should handle empty notebook list', async () => {
        mockListNotebooks.mockResolvedValueOnce([]);

        const notebooks = await listNotebooks();

        expect(notebooks).toEqual([]);
        expect(Array.isArray(notebooks)).toBe(true);
      });
    });

    describe('listNotesInNotebook', () => {
      it('should return notes from notebook', async () => {
        mockFindNotesMetadata.mockResolvedValueOnce({
          notes: [
            { guid: 'n1', title: 'Note 1', created: 1234567890000, updated: 1234567891000 },
            { guid: 'n2', title: 'Note 2', created: 1234567892000, updated: 1234567893000 }
          ],
          totalNotes: 2
        });

        const notes = await listNotesInNotebook('nb1');

        expect(notes).toHaveLength(2);
        expect(notes[0].title).toBe('Note 1');
        expect(notes[1].title).toBe('Note 2');
      });

      it('should handle pagination parameters', async () => {
        mockFindNotesMetadata.mockResolvedValueOnce({
          notes: [],
          totalNotes: 0
        });

        await listNotesInNotebook('nb1', 50, 25);

        expect(mockFindNotesMetadata).toHaveBeenCalledWith(
          expect.any(Object), // filter
          50, // offset
          25, // limit
          expect.any(Object) // resultSpec
        );
      });

      it('should use default pagination values', async () => {
        mockFindNotesMetadata.mockResolvedValueOnce({
          notes: [],
          totalNotes: 0
        });

        await listNotesInNotebook('nb1');

        expect(mockFindNotesMetadata).toHaveBeenCalledWith(
          expect.any(Object),
          0,  // default offset
          50, // default limit
          expect.any(Object)
        );
      });

      it('should handle empty results', async () => {
        mockFindNotesMetadata.mockResolvedValueOnce({
          notes: [],
          totalNotes: 0
        });

        const notes = await listNotesInNotebook('nb1');

        expect(notes).toEqual([]);
      });

      it('should handle missing notes array', async () => {
        mockFindNotesMetadata.mockResolvedValueOnce({
          totalNotes: 0
        });

        const notes = await listNotesInNotebook('nb1');

        expect(notes).toEqual([]);
      });
    });

    describe('getNoteWithContent', () => {
      it('should return full note with content', async () => {
        mockGetNote.mockResolvedValueOnce({
          guid: 'n1',
          title: 'Test Note',
          content: '<en-note><div>Content</div></en-note>',
          resources: [],
          attributes: {}
        });

        const note = await getNoteWithContent('n1');

        expect(note.guid).toBe('n1');
        expect(note.title).toBe('Test Note');
        expect(note.content).toContain('Content');
        expect(mockGetNote).toHaveBeenCalledWith('n1', true, true, true, true);
      });

      it('should include resources', async () => {
        mockGetNote.mockResolvedValueOnce({
          guid: 'n1',
          title: 'Note with Image',
          content: '<en-note></en-note>',
          resources: [
            {
              mime: 'image/png',
              data: { body: Buffer.from('fake-image-data'), size: 100 }
            }
          ]
        });

        const note = await getNoteWithContent('n1');

        expect(note.resources).toHaveLength(1);
        expect(note.resources[0].mime).toBe('image/png');
      });

      it('should handle authentication error', async () => {
        const { getToken } = await import('../../electron/evernote/oauth-helper.js');
        vi.mocked(getToken).mockResolvedValueOnce(null);

        await expect(getNoteWithContent('n1')).rejects.toThrow(/Not authenticated/);
      });
    });

    describe('updateNote', () => {
      beforeEach(() => {
        // Mock getting current note (for update sequence)
        mockGetNote.mockResolvedValue({
          guid: 'n1',
          title: 'Original',
          content: '<en-note>Old</en-note>',
          updateSequenceNum: 123
        });
      });

      it('should update note content', async () => {
        mockUpdateNote.mockResolvedValueOnce({
          guid: 'n1',
          title: 'Original',
          content: '<en-note>Updated</en-note>',
          updateSequenceNum: 124
        });

        const updated = await updateNote('n1', '<en-note>Updated</en-note>');

        expect(updated.content).toContain('Updated');
        expect(mockUpdateNote).toHaveBeenCalled();
      });

      it('should update note attributes', async () => {
        mockUpdateNote.mockResolvedValueOnce({ guid: 'n1', updateSequenceNum: 124 });

        await updateNote('n1', undefined, {
          applicationData: { aiAugmented: 'true' }
        });

        const updateCall = mockUpdateNote.mock.calls[0][0];
        expect(updateCall.attributes).toBeDefined();
      });

      it('should update both content and attributes', async () => {
        mockUpdateNote.mockResolvedValueOnce({ guid: 'n1', updateSequenceNum: 124 });

        await updateNote('n1', '<en-note>New content</en-note>', {
          applicationData: { aiAugmented: 'true' }
        });

        const updateCall = mockUpdateNote.mock.calls[0][0];
        expect(updateCall.content).toBe('<en-note>New content</en-note>');
        expect(updateCall.attributes).toBeDefined();
      });

      it('should handle rate limit errors', async () => {
        mockUpdateNote.mockRejectedValueOnce({
          errorCode: 19,
          rateLimitDuration: 60
        });

        await expect(updateNote('n1', '<en-note>New</en-note>'))
          .rejects.toThrow(/Rate limit/);
      });

      it('should handle version conflicts', async () => {
        mockUpdateNote.mockRejectedValueOnce(new Error('Version conflict'));

        await expect(updateNote('n1', '<en-note>New</en-note>'))
          .rejects.toThrow(/Version conflict/);
      });

      it('should preserve update sequence number', async () => {
        mockUpdateNote.mockResolvedValueOnce({ guid: 'n1', updateSequenceNum: 124 });

        await updateNote('n1', '<en-note>Updated</en-note>');

        const updateCall = mockUpdateNote.mock.calls[0][0];
        expect(updateCall.updateSequenceNum).toBe(123); // From mock
      });
    });

    describe('getNoteApplicationData', () => {
      it('should return note attributes', async () => {
        mockGetNote.mockResolvedValueOnce({
          guid: 'n1',
          attributes: {
            applicationData: {
              aiAugmented: 'true',
              aiAugmentedDate: '2025-10-22'
            }
          }
        });

        const data = await getNoteApplicationData('n1');

        expect(data.aiAugmented).toBe('true');
        expect(data.aiAugmentedDate).toBe('2025-10-22');
      });

      it('should return empty object if no attributes', async () => {
        mockGetNote.mockResolvedValueOnce({
          guid: 'n1',
          attributes: {}
        });

        const data = await getNoteApplicationData('n1');

        expect(data).toEqual({});
      });

      it('should return empty object if attributes undefined', async () => {
        mockGetNote.mockResolvedValueOnce({
          guid: 'n1'
        });

        const data = await getNoteApplicationData('n1');

        expect(data).toEqual({});
      });

      it('should handle authentication error', async () => {
        const { getToken } = await import('../../electron/evernote/oauth-helper.js');
        vi.mocked(getToken).mockResolvedValueOnce(null);

        await expect(getNoteApplicationData('n1')).rejects.toThrow(/Not authenticated/);
      });
    });
  });
});
