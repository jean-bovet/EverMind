import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tagCache } from '../../electron/evernote/tag-cache.js';
import * as client from '../../electron/evernote/client.js';

// Mock the Evernote client
vi.mock('../../electron/evernote/client.js', () => ({
  listTags: vi.fn()
}));

describe('tag-cache', () => {
  beforeEach(() => {
    // Clear cache before each test
    tagCache.clear();
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should fetch and cache tags on first initialization', async () => {
      const mockTags = ['tag1', 'tag2', 'tag3'];
      vi.mocked(client.listTags).mockResolvedValueOnce(mockTags);

      await tagCache.initialize();

      expect(client.listTags).toHaveBeenCalledTimes(1);
      expect(tagCache.getTags()).toEqual(mockTags);
      expect(tagCache.isInitialized()).toBe(true);
    });

    it('should not fetch tags again if already initialized', async () => {
      const mockTags = ['tag1', 'tag2', 'tag3'];
      vi.mocked(client.listTags).mockResolvedValueOnce(mockTags);

      await tagCache.initialize();
      await tagCache.initialize();
      await tagCache.initialize();

      expect(client.listTags).toHaveBeenCalledTimes(1);
      expect(tagCache.getTags()).toEqual(mockTags);
    });

    it('should handle concurrent initialization calls', async () => {
      const mockTags = ['tag1', 'tag2', 'tag3'];
      vi.mocked(client.listTags).mockResolvedValueOnce(mockTags);

      // Start multiple initializations at the same time
      await Promise.all([
        tagCache.initialize(),
        tagCache.initialize(),
        tagCache.initialize()
      ]);

      // Should only call listTags once
      expect(client.listTags).toHaveBeenCalledTimes(1);
      expect(tagCache.getTags()).toEqual(mockTags);
    });

    it('should handle initialization errors gracefully', async () => {
      const error = new Error('Network error');
      vi.mocked(client.listTags).mockRejectedValueOnce(error);

      await expect(tagCache.initialize()).rejects.toThrow('Network error');

      // Cache should still be marked as initialized (with empty array)
      expect(tagCache.isInitialized()).toBe(true);
      expect(tagCache.getTags()).toEqual([]);
    });
  });

  describe('getTags', () => {
    it('should return empty array if not initialized', () => {
      expect(tagCache.getTags()).toEqual([]);
      expect(tagCache.isInitialized()).toBe(false);
    });

    it('should return cached tags after initialization', async () => {
      const mockTags = ['work', 'personal', 'important'];
      vi.mocked(client.listTags).mockResolvedValueOnce(mockTags);

      await tagCache.initialize();

      expect(tagCache.getTags()).toEqual(mockTags);
    });

    it('should return a copy of tags (not reference)', async () => {
      const mockTags = ['tag1', 'tag2'];
      vi.mocked(client.listTags).mockResolvedValueOnce(mockTags);

      await tagCache.initialize();

      const tags = tagCache.getTags();
      tags.push('tag3'); // Modify returned array

      // Original cache should not be modified
      expect(tagCache.getTags()).toEqual(['tag1', 'tag2']);
    });
  });

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      expect(tagCache.isInitialized()).toBe(false);
    });

    it('should return true after successful initialization', async () => {
      vi.mocked(client.listTags).mockResolvedValueOnce(['tag1']);

      await tagCache.initialize();

      expect(tagCache.isInitialized()).toBe(true);
    });

    it('should return true even after initialization error', async () => {
      vi.mocked(client.listTags).mockRejectedValueOnce(new Error('Error'));

      try {
        await tagCache.initialize();
      } catch {
        // Ignore error
      }

      expect(tagCache.isInitialized()).toBe(true);
    });
  });

  describe('refresh', () => {
    it('should fetch fresh tags from Evernote', async () => {
      const initialTags = ['old1', 'old2'];
      const refreshedTags = ['new1', 'new2', 'new3'];

      vi.mocked(client.listTags)
        .mockResolvedValueOnce(initialTags)
        .mockResolvedValueOnce(refreshedTags);

      await tagCache.initialize();
      expect(tagCache.getTags()).toEqual(initialTags);

      await tagCache.refresh();
      expect(tagCache.getTags()).toEqual(refreshedTags);
      expect(client.listTags).toHaveBeenCalledTimes(2);
    });

    it('should work even if not previously initialized', async () => {
      const mockTags = ['tag1', 'tag2'];
      vi.mocked(client.listTags).mockResolvedValueOnce(mockTags);

      await tagCache.refresh();

      expect(tagCache.getTags()).toEqual(mockTags);
      expect(tagCache.isInitialized()).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear cached tags and reset initialization state', async () => {
      const mockTags = ['tag1', 'tag2'];
      vi.mocked(client.listTags).mockResolvedValueOnce(mockTags);

      await tagCache.initialize();
      expect(tagCache.isInitialized()).toBe(true);
      expect(tagCache.getTags()).toEqual(mockTags);

      tagCache.clear();

      expect(tagCache.isInitialized()).toBe(false);
      expect(tagCache.getTags()).toEqual([]);
    });

    it('should allow reinitialization after clear', async () => {
      const firstTags = ['tag1'];
      const secondTags = ['tag2'];

      vi.mocked(client.listTags)
        .mockResolvedValueOnce(firstTags)
        .mockResolvedValueOnce(secondTags);

      await tagCache.initialize();
      expect(tagCache.getTags()).toEqual(firstTags);

      tagCache.clear();

      await tagCache.initialize();
      expect(tagCache.getTags()).toEqual(secondTags);
      expect(client.listTags).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty tag list', async () => {
      vi.mocked(client.listTags).mockResolvedValueOnce([]);

      await tagCache.initialize();

      expect(tagCache.getTags()).toEqual([]);
      expect(tagCache.isInitialized()).toBe(true);
    });

    it('should handle large tag lists', async () => {
      const largeTags = Array.from({ length: 1000 }, (_, i) => `tag${i}`);
      vi.mocked(client.listTags).mockResolvedValueOnce(largeTags);

      await tagCache.initialize();

      expect(tagCache.getTags()).toEqual(largeTags);
      expect(tagCache.getTags().length).toBe(1000);
    });
  });
});
