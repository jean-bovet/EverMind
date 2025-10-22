import { describe, it, expect } from 'vitest';
import {
  parseTags,
  extractFileName,
  mapDbRecordToFileItem,
  mapDbRecordsToFileItems
} from '../../electron/utils/db-to-ui-mapper.js';
import type { FileRecord } from '../../electron/database/queue-db.js';

describe('db-to-ui-mapper', () => {
  describe('parseTags', () => {
    it('should parse valid JSON array', () => {
      const result = parseTags('["tag1", "tag2", "tag3"]');
      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should return empty array for null', () => {
      const result = parseTags(null);
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      const result = parseTags('not valid json');
      expect(result).toEqual([]);
    });

    it('should return empty array for non-array JSON', () => {
      const result = parseTags('{"foo": "bar"}');
      expect(result).toEqual([]);
    });

    it('should handle empty array', () => {
      const result = parseTags('[]');
      expect(result).toEqual([]);
    });
  });

  describe('extractFileName', () => {
    it('should extract filename from unix path', () => {
      const result = extractFileName('/path/to/file.pdf');
      expect(result).toBe('file.pdf');
    });

    it('should handle filename without path', () => {
      const result = extractFileName('test.txt');
      expect(result).toBe('test.txt');
    });

    it('should handle filename with multiple dots', () => {
      const result = extractFileName('/path/to/file.name.with.dots.pdf');
      expect(result).toBe('file.name.with.dots.pdf');
    });
  });

  describe('mapDbRecordToFileItem', () => {
    it('should map complete database record to file item', () => {
      const record: FileRecord = {
        id: 1,
        file_path: '/test/path/document.pdf',
        title: 'Test Document',
        description: 'A test document',
        tags: '["tag1", "tag2"]',
        status: 'complete',
        progress: 100,
        error_message: null,
        created_at: '2024-01-01T00:00:00Z',
        last_attempt_at: '2024-01-01T00:05:00Z',
        retry_after: null,
        uploaded_at: '2024-01-01T00:05:00Z',
        note_url: 'https://evernote.com/note/123'
      };

      const result = mapDbRecordToFileItem(record);

      expect(result).toEqual({
        path: '/test/path/document.pdf',
        name: 'document.pdf',
        status: 'complete',
        progress: 100,
        result: {
          title: 'Test Document',
          description: 'A test document',
          tags: ['tag1', 'tag2'],
          noteUrl: 'https://evernote.com/note/123'
        }
      });
    });

    it('should handle pending file with minimal data', () => {
      const record: FileRecord = {
        id: 2,
        file_path: '/test/pending.pdf',
        title: null,
        description: null,
        tags: null,
        status: 'pending',
        progress: 0,
        error_message: null,
        created_at: '2024-01-01T00:00:00Z',
        last_attempt_at: null,
        retry_after: null,
        uploaded_at: null,
        note_url: null
      };

      const result = mapDbRecordToFileItem(record);

      expect(result).toEqual({
        path: '/test/pending.pdf',
        name: 'pending.pdf',
        status: 'pending',
        progress: 0
      });
    });

    it('should include error message for failed files', () => {
      const record: FileRecord = {
        id: 3,
        file_path: '/test/error.pdf',
        title: null,
        description: null,
        tags: null,
        status: 'error',
        progress: 50,
        error_message: 'Failed to extract content',
        created_at: '2024-01-01T00:00:00Z',
        last_attempt_at: '2024-01-01T00:02:00Z',
        retry_after: null,
        uploaded_at: null,
        note_url: null
      };

      const result = mapDbRecordToFileItem(record);

      expect(result).toEqual({
        path: '/test/error.pdf',
        name: 'error.pdf',
        status: 'error',
        progress: 50,
        error: 'Failed to extract content',
        message: 'Failed to extract content'
      });
    });

    it('should handle file with partial analysis data', () => {
      const record: FileRecord = {
        id: 4,
        file_path: '/test/partial.pdf',
        title: 'Partial Title',
        description: null,
        tags: null,
        status: 'analyzing',
        progress: 75,
        error_message: null,
        created_at: '2024-01-01T00:00:00Z',
        last_attempt_at: '2024-01-01T00:03:00Z',
        retry_after: null,
        uploaded_at: null,
        note_url: null
      };

      const result = mapDbRecordToFileItem(record);

      expect(result).toEqual({
        path: '/test/partial.pdf',
        name: 'partial.pdf',
        status: 'analyzing',
        progress: 75,
        result: {
          title: 'Partial Title',
          description: '',
          tags: [],
          noteUrl: undefined
        }
      });
    });

    it('should handle all statuses correctly', () => {
      const statuses: Array<FileRecord['status']> = [
        'pending',
        'extracting',
        'analyzing',
        'ready-to-upload',
        'uploading',
        'rate-limited',
        'retrying',
        'complete',
        'error'
      ];

      statuses.forEach(status => {
        const record: FileRecord = {
          id: 5,
          file_path: '/test/file.pdf',
          title: null,
          description: null,
          tags: null,
          status,
          progress: 0,
          error_message: null,
          created_at: '2024-01-01T00:00:00Z',
          last_attempt_at: null,
          retry_after: null,
          uploaded_at: null,
          note_url: null
        };

        const result = mapDbRecordToFileItem(record);
        expect(result.status).toBe(status);
      });
    });
  });

  describe('mapDbRecordsToFileItems', () => {
    it('should map empty array', () => {
      const result = mapDbRecordsToFileItems([]);
      expect(result).toEqual([]);
    });

    it('should map multiple records', () => {
      const records: FileRecord[] = [
        {
          id: 1,
          file_path: '/test/file1.pdf',
          title: 'File 1',
          description: 'First file',
          tags: '["tag1"]',
          status: 'complete',
          progress: 100,
          error_message: null,
          created_at: '2024-01-01T00:00:00Z',
          last_attempt_at: '2024-01-01T00:05:00Z',
          retry_after: null,
          uploaded_at: '2024-01-01T00:05:00Z',
          note_url: 'https://evernote.com/note/1'
        },
        {
          id: 2,
          file_path: '/test/file2.pdf',
          title: null,
          description: null,
          tags: null,
          status: 'pending',
          progress: 0,
          error_message: null,
          created_at: '2024-01-01T00:00:00Z',
          last_attempt_at: null,
          retry_after: null,
          uploaded_at: null,
          note_url: null
        },
        {
          id: 3,
          file_path: '/test/file3.pdf',
          title: null,
          description: null,
          tags: null,
          status: 'error',
          progress: 25,
          error_message: 'Test error',
          created_at: '2024-01-01T00:00:00Z',
          last_attempt_at: '2024-01-01T00:01:00Z',
          retry_after: null,
          uploaded_at: null,
          note_url: null
        }
      ];

      const result = mapDbRecordsToFileItems(records);

      expect(result).toHaveLength(3);
      expect(result[0].path).toBe('/test/file1.pdf');
      expect(result[0].status).toBe('complete');
      expect(result[1].path).toBe('/test/file2.pdf');
      expect(result[1].status).toBe('pending');
      expect(result[2].path).toBe('/test/file3.pdf');
      expect(result[2].status).toBe('error');
      expect(result[2].error).toBe('Test error');
    });
  });
});
