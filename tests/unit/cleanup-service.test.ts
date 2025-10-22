import { describe, it, expect, beforeEach, vi } from 'vitest';
import { verifyAndRemoveUploadedNotes } from '../../electron/database/cleanup-service.js';

// Mock the dependencies
vi.mock('../../electron/evernote/client.js', () => ({
  checkNoteExists: vi.fn()
}));

vi.mock('../../electron/database/queue-db.js', () => ({
  getCompletedFilesWithGuids: vi.fn(),
  deleteFile: vi.fn()
}));

// Import mocked modules after mocking
import { checkNoteExists } from '../../electron/evernote/client.js';
import { getCompletedFilesWithGuids, deleteFile } from '../../electron/database/queue-db.js';

describe('cleanup-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('verifyAndRemoveUploadedNotes', () => {
    it('should verify and remove uploaded notes successfully', async () => {
      // Mock completed files
      vi.mocked(getCompletedFilesWithGuids).mockReturnValue([
        {
          id: 1,
          file_path: '/test/file1.pdf',
          note_guid: 'guid-1',
          note_url: 'https://evernote.com/note/1',
          status: 'complete',
          progress: 100,
          title: 'Test Note 1',
          description: 'Description 1',
          tags: '["tag1"]',
          error_message: null,
          created_at: '2025-01-01T00:00:00Z',
          last_attempt_at: null,
          retry_after: null,
          uploaded_at: '2025-01-01T01:00:00Z'
        },
        {
          id: 2,
          file_path: '/test/file2.pdf',
          note_guid: 'guid-2',
          note_url: 'https://evernote.com/note/2',
          status: 'complete',
          progress: 100,
          title: 'Test Note 2',
          description: 'Description 2',
          tags: '["tag2"]',
          error_message: null,
          created_at: '2025-01-01T00:00:00Z',
          last_attempt_at: null,
          retry_after: null,
          uploaded_at: '2025-01-01T01:00:00Z'
        }
      ]);

      // Mock both notes exist
      vi.mocked(checkNoteExists).mockResolvedValue(true);

      const result = await verifyAndRemoveUploadedNotes(10, 0);

      expect(result.checked).toBe(2);
      expect(result.verified).toBe(2);
      expect(result.removed).toBe(2);
      expect(result.failed).toBe(0);

      // Verify checkNoteExists was called for each note
      expect(checkNoteExists).toHaveBeenCalledTimes(2);
      expect(checkNoteExists).toHaveBeenCalledWith('guid-1');
      expect(checkNoteExists).toHaveBeenCalledWith('guid-2');

      // Verify deleteFile was called for each verified note
      expect(deleteFile).toHaveBeenCalledTimes(2);
      expect(deleteFile).toHaveBeenCalledWith('/test/file1.pdf');
      expect(deleteFile).toHaveBeenCalledWith('/test/file2.pdf');
    });

    it('should handle notes that don\'t exist in Evernote', async () => {
      vi.mocked(getCompletedFilesWithGuids).mockReturnValue([
        {
          id: 1,
          file_path: '/test/file1.pdf',
          note_guid: 'guid-1',
          note_url: 'url1',
          status: 'complete',
          progress: 100,
          title: 'Note 1',
          description: 'Desc 1',
          tags: '[]',
          error_message: null,
          created_at: '2025-01-01T00:00:00Z',
          last_attempt_at: null,
          retry_after: null,
          uploaded_at: '2025-01-01T01:00:00Z'
        }
      ]);

      // Note doesn't exist in Evernote
      vi.mocked(checkNoteExists).mockResolvedValue(false);

      const result = await verifyAndRemoveUploadedNotes();

      expect(result.checked).toBe(1);
      expect(result.verified).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.failed).toBe(1);

      // Should not delete the file since note doesn't exist
      expect(deleteFile).not.toHaveBeenCalled();
    });

    it('should handle verification errors gracefully', async () => {
      vi.mocked(getCompletedFilesWithGuids).mockReturnValue([
        {
          id: 1,
          file_path: '/test/file1.pdf',
          note_guid: 'guid-1',
          note_url: 'url1',
          status: 'complete',
          progress: 100,
          title: 'Note 1',
          description: 'Desc 1',
          tags: '[]',
          error_message: null,
          created_at: '2025-01-01T00:00:00Z',
          last_attempt_at: null,
          retry_after: null,
          uploaded_at: '2025-01-01T01:00:00Z'
        }
      ]);

      // checkNoteExists throws an error
      vi.mocked(checkNoteExists).mockRejectedValue(new Error('Network timeout'));

      const result = await verifyAndRemoveUploadedNotes();

      expect(result.checked).toBe(1);
      expect(result.verified).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.failed).toBe(1);

      // Should not delete the file on error
      expect(deleteFile).not.toHaveBeenCalled();
    });

    it('should return empty result when no completed files', async () => {
      vi.mocked(getCompletedFilesWithGuids).mockReturnValue([]);

      const result = await verifyAndRemoveUploadedNotes();

      expect(result.checked).toBe(0);
      expect(result.verified).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.failed).toBe(0);

      expect(checkNoteExists).not.toHaveBeenCalled();
      expect(deleteFile).not.toHaveBeenCalled();
    });

    it('should handle files without GUIDs gracefully', async () => {
      vi.mocked(getCompletedFilesWithGuids).mockReturnValue([
        {
          id: 1,
          file_path: '/test/file1.pdf',
          note_guid: null, // No GUID
          note_url: 'url1',
          status: 'complete',
          progress: 100,
          title: 'Note 1',
          description: 'Desc 1',
          tags: '[]',
          error_message: null,
          created_at: '2025-01-01T00:00:00Z',
          last_attempt_at: null,
          retry_after: null,
          uploaded_at: '2025-01-01T01:00:00Z'
        }
      ]);

      const result = await verifyAndRemoveUploadedNotes();

      expect(result.checked).toBe(0);
      expect(result.verified).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.failed).toBe(1);

      // Should skip verification for files without GUID
      expect(checkNoteExists).not.toHaveBeenCalled();
      expect(deleteFile).not.toHaveBeenCalled();
    });

    it('should process files in batches', async () => {
      // Create 15 files
      const files = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        file_path: `/test/file${i + 1}.pdf`,
        note_guid: `guid-${i + 1}`,
        note_url: `url${i + 1}`,
        status: 'complete' as const,
        progress: 100,
        title: `Note ${i + 1}`,
        description: `Desc ${i + 1}`,
        tags: '[]',
        error_message: null,
        created_at: '2025-01-01T00:00:00Z',
        last_attempt_at: null,
        retry_after: null,
        uploaded_at: '2025-01-01T01:00:00Z'
      }));

      vi.mocked(getCompletedFilesWithGuids).mockReturnValue(files);
      vi.mocked(checkNoteExists).mockResolvedValue(true);

      // Process in batches of 5 with no delay
      const result = await verifyAndRemoveUploadedNotes(5, 0);

      expect(result.checked).toBe(15);
      expect(result.verified).toBe(15);
      expect(result.removed).toBe(15);
      expect(result.failed).toBe(0);

      // All notes should be checked and deleted
      expect(checkNoteExists).toHaveBeenCalledTimes(15);
      expect(deleteFile).toHaveBeenCalledTimes(15);
    });

    it('should handle mixed verification results', async () => {
      vi.mocked(getCompletedFilesWithGuids).mockReturnValue([
        {
          id: 1,
          file_path: '/test/file1.pdf',
          note_guid: 'guid-1',
          note_url: 'url1',
          status: 'complete',
          progress: 100,
          title: 'Note 1',
          description: 'Desc 1',
          tags: '[]',
          error_message: null,
          created_at: '2025-01-01T00:00:00Z',
          last_attempt_at: null,
          retry_after: null,
          uploaded_at: '2025-01-01T01:00:00Z'
        },
        {
          id: 2,
          file_path: '/test/file2.pdf',
          note_guid: 'guid-2',
          note_url: 'url2',
          status: 'complete',
          progress: 100,
          title: 'Note 2',
          description: 'Desc 2',
          tags: '[]',
          error_message: null,
          created_at: '2025-01-01T00:00:00Z',
          last_attempt_at: null,
          retry_after: null,
          uploaded_at: '2025-01-01T01:00:00Z'
        },
        {
          id: 3,
          file_path: '/test/file3.pdf',
          note_guid: 'guid-3',
          note_url: 'url3',
          status: 'complete',
          progress: 100,
          title: 'Note 3',
          description: 'Desc 3',
          tags: '[]',
          error_message: null,
          created_at: '2025-01-01T00:00:00Z',
          last_attempt_at: null,
          retry_after: null,
          uploaded_at: '2025-01-01T01:00:00Z'
        }
      ]);

      // First note exists, second doesn't, third throws error
      vi.mocked(checkNoteExists)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await verifyAndRemoveUploadedNotes();

      expect(result.checked).toBe(3);
      expect(result.verified).toBe(1);
      expect(result.removed).toBe(1);
      expect(result.failed).toBe(2);

      // Only the first file should be deleted
      expect(deleteFile).toHaveBeenCalledTimes(1);
      expect(deleteFile).toHaveBeenCalledWith('/test/file1.pdf');
    });
  });
});
