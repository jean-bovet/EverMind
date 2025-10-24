import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContentAnalysisWorkflow } from '../../electron/ai/content-analysis-workflow.js';
import * as tagCacheModule from '../../electron/evernote/tag-cache.js';
import * as aiAnalyzer from '../../electron/ai/ai-analyzer.js';
import * as tagValidator from '../../electron/evernote/tag-validator.js';
import * as queueDb from '../../electron/database/queue-db.js';

// Mock all dependencies
vi.mock('../../electron/evernote/tag-cache.js', () => ({
  tagCache: {
    getTags: vi.fn()
  }
}));

vi.mock('../../electron/ai/ai-analyzer.js', () => ({
  analyzeContent: vi.fn()
}));

vi.mock('../../electron/evernote/tag-validator.js', () => ({
  filterExistingTags: vi.fn()
}));

vi.mock('../../electron/database/queue-db.js', () => ({
  getCachedNoteAnalysis: vi.fn(),
  saveNoteAnalysisCache: vi.fn()
}));

describe('ContentAnalysisWorkflow', () => {
  let workflow: ContentAnalysisWorkflow;

  beforeEach(() => {
    workflow = new ContentAnalysisWorkflow();
    vi.clearAllMocks();
  });

  describe('analyze - basic functionality', () => {
    it('should analyze file content and return filtered tags', async () => {
      const mockTags = ['work', 'personal', 'important'];
      const mockAIResult = {
        title: 'Test Document',
        description: 'A test document',
        tags: ['work', 'personal', 'unknown']
      };
      const mockFilteredTags = { valid: ['work', 'personal'], rejected: [] };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(mockTags);
      vi.mocked(aiAnalyzer.analyzeContent).mockResolvedValueOnce(mockAIResult);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue(mockFilteredTags);

      const result = await workflow.analyze(
        'Test content',
        'test.txt',
        'file',
        '/path/to/test.txt'
      );

      expect(result.title).toBe('Test Document');
      expect(result.description).toBe('A test document');
      expect(result.tags).toEqual(['work', 'personal']);
      expect(result.contentHash).toBeDefined();
      expect(result.fromCache).toBe(false);

      // Verify tag cache was used (not fetched)
      expect(tagCacheModule.tagCache.getTags).toHaveBeenCalledTimes(1);

      // Verify AI analyzer was called with cached tags
      expect(aiAnalyzer.analyzeContent).toHaveBeenCalledWith(
        'Test content',
        'test.txt',
        'file',
        mockTags,
        false,
        null
      );

      // Verify tags were filtered
      expect(tagValidator.filterExistingTags).toHaveBeenCalledWith(
        ['work', 'personal', 'unknown'],
        mockTags
      );
    });

    it('should calculate content hash consistently', async () => {
      const mockTags = ['tag1'];
      const mockAIResult = { title: 'T', description: 'D', tags: [] };
      const mockFilteredTags = { valid: [], rejected: [] };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(mockTags);
      vi.mocked(aiAnalyzer.analyzeContent).mockResolvedValue(mockAIResult);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue(mockFilteredTags);

      const result1 = await workflow.analyze('same content', 'test.txt', 'file', '/path/to/file1');
      const result2 = await workflow.analyze('same content', 'test.txt', 'file', '/path/to/file2');

      // Same content should produce same hash
      expect(result1.contentHash).toBe(result2.contentHash);

      const result3 = await workflow.analyze('different content', 'test.txt', 'file', '/path/to/file3');

      // Different content should produce different hash
      expect(result1.contentHash).not.toBe(result3.contentHash);
    });
  });

  describe('analyze - caching for notes', () => {
    it('should use cached analysis when available and valid (note)', async () => {
      const mockCached = {
        note_guid: 'note123',
        ai_title: 'Cached Title',
        ai_description: 'Cached Description',
        ai_tags: JSON.stringify(['cached-tag1', 'cached-tag2']),
        analyzed_at: new Date().toISOString(),
        content_hash: 'abc123',
        expires_at: Date.now() + 3600000 // 1 hour in future
      };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(['cached-tag1', 'cached-tag2']);
      vi.mocked(queueDb.getCachedNoteAnalysis).mockReturnValue(mockCached);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue({
        valid: ['cached-tag1', 'cached-tag2'],
        rejected: []
      });

      const result = await workflow.analyze(
        'Note content',
        'My Note',
        'note',
        'note123',
        { useCache: true }
      );

      expect(result.title).toBe('Cached Title');
      expect(result.description).toBe('Cached Description');
      expect(result.tags).toEqual(['cached-tag1', 'cached-tag2']);
      expect(result.fromCache).toBe(true);

      // Should not call AI analyzer
      expect(aiAnalyzer.analyzeContent).not.toHaveBeenCalled();

      // Should call tag filter to validate cached tags
      expect(tagValidator.filterExistingTags).toHaveBeenCalledWith(
        ['cached-tag1', 'cached-tag2'],
        ['cached-tag1', 'cached-tag2']
      );
    });

    it('should return only filtered tags from cache (bug regression test)', async () => {
      // This test reproduces the bug where cached results contain unfiltered tags
      // Scenario: AI suggested tags including invalid ones, but cache stored raw AI result
      const mockCached = {
        note_guid: 'note456',
        ai_title: 'Cached Title',
        ai_description: 'Cached Description',
        ai_tags: JSON.stringify(['work', 'personal', 'invalid-tag', 'another-invalid']), // UNFILTERED tags
        analyzed_at: new Date().toISOString(),
        content_hash: 'def456',
        expires_at: Date.now() + 3600000
      };

      // Only 'work' and 'personal' actually exist in Evernote
      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(['work', 'personal']);
      vi.mocked(queueDb.getCachedNoteAnalysis).mockReturnValue(mockCached);

      // Mock filterExistingTags to return only valid tags
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue({
        valid: ['work', 'personal'],
        rejected: [
          { tag: 'invalid-tag', reason: 'Tag does not exist in Evernote' },
          { tag: 'another-invalid', reason: 'Tag does not exist in Evernote' }
        ]
      });

      const result = await workflow.analyze(
        'Note content',
        'My Note',
        'note',
        'note456',
        { useCache: true }
      );

      // FIXED: Now returns only valid tags that exist in Evernote
      expect(result.tags).toEqual(['work', 'personal']);
      expect(result.tags).not.toContain('invalid-tag');
      expect(result.tags).not.toContain('another-invalid');

      // Verify filterExistingTags was called to filter cached tags
      expect(tagValidator.filterExistingTags).toHaveBeenCalledWith(
        ['work', 'personal', 'invalid-tag', 'another-invalid'],
        ['work', 'personal']
      );
    });

    it('should run fresh analysis when cache is expired (note)', async () => {
      const mockExpiredCached = {
        note_guid: 'note123',
        ai_title: 'Old Title',
        ai_description: 'Old Description',
        ai_tags: JSON.stringify(['old-tag']),
        analyzed_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        content_hash: 'old-hash',
        expires_at: Date.now() - 1000 // Expired 1 second ago
      };

      const mockTags = ['new-tag'];
      const mockAIResult = {
        title: 'Fresh Title',
        description: 'Fresh Description',
        tags: ['new-tag']
      };
      const mockFilteredTags = { valid: ['new-tag'], rejected: [] };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(mockTags);
      vi.mocked(queueDb.getCachedNoteAnalysis).mockReturnValue(mockExpiredCached);
      vi.mocked(aiAnalyzer.analyzeContent).mockResolvedValueOnce(mockAIResult);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue(mockFilteredTags);

      const result = await workflow.analyze(
        'Note content',
        'My Note',
        'note',
        'note123',
        { useCache: true }
      );

      expect(result.title).toBe('Fresh Title');
      expect(result.fromCache).toBe(false);

      // Should call AI analyzer
      expect(aiAnalyzer.analyzeContent).toHaveBeenCalled();

      // Should save fresh analysis to cache
      expect(queueDb.saveNoteAnalysisCache).toHaveBeenCalled();
    });

    it('should not use cache for file type', async () => {
      const mockCached = {
        note_guid: 'file123',
        ai_title: 'Cached',
        ai_description: 'Cached',
        ai_tags: '[]',
        analyzed_at: new Date().toISOString(),
        content_hash: 'abc123',
        expires_at: Date.now() + 3600000
      };

      const mockTags = ['tag1'];
      const mockAIResult = { title: 'Fresh', description: 'Fresh', tags: [] };
      const mockFilteredTags = { valid: [], rejected: [] };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(mockTags);
      vi.mocked(queueDb.getCachedNoteAnalysis).mockReturnValue(mockCached);
      vi.mocked(aiAnalyzer.analyzeContent).mockResolvedValueOnce(mockAIResult);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue(mockFilteredTags);

      const result = await workflow.analyze(
        'File content',
        'test.txt',
        'file',
        '/path/to/file',
        { useCache: true }
      );

      // Should run fresh analysis (files don't use cache)
      expect(result.fromCache).toBe(false);
      expect(aiAnalyzer.analyzeContent).toHaveBeenCalled();
    });

    it('should save to cache after fresh analysis (note)', async () => {
      const mockTags = ['work'];
      const mockAIResult = {
        title: 'New Note',
        description: 'Description',
        tags: ['work']
      };
      const mockFilteredTags = { valid: ['work'], rejected: [] };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(mockTags);
      vi.mocked(queueDb.getCachedNoteAnalysis).mockReturnValue(null);
      vi.mocked(aiAnalyzer.analyzeContent).mockResolvedValueOnce(mockAIResult);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue(mockFilteredTags);

      await workflow.analyze(
        'Note content',
        'My Note',
        'note',
        'note456',
        { useCache: false }
      );

      expect(queueDb.saveNoteAnalysisCache).toHaveBeenCalledWith(
        'note456',
        mockAIResult,
        expect.any(String) // content hash
      );
    });
  });

  describe('analyze - options', () => {
    it('should pass debug option to AI analyzer', async () => {
      const mockTags = ['tag1'];
      const mockAIResult = { title: 'T', description: 'D', tags: [] };
      const mockFilteredTags = { valid: [], rejected: [] };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(mockTags);
      vi.mocked(aiAnalyzer.analyzeContent).mockResolvedValueOnce(mockAIResult);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue(mockFilteredTags);

      await workflow.analyze(
        'Content',
        'file.txt',
        'file',
        '/path/to/file',
        { debug: true, sourceFilePath: '/path/to/file' }
      );

      expect(aiAnalyzer.analyzeContent).toHaveBeenCalledWith(
        'Content',
        'file.txt',
        'file',
        mockTags,
        true, // debug enabled
        '/path/to/file' // source path provided
      );
    });

    it('should default debug to false when not specified', async () => {
      const mockTags = ['tag1'];
      const mockAIResult = { title: 'T', description: 'D', tags: [] };
      const mockFilteredTags = { valid: [], rejected: [] };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(mockTags);
      vi.mocked(aiAnalyzer.analyzeContent).mockResolvedValueOnce(mockAIResult);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue(mockFilteredTags);

      await workflow.analyze('Content', 'file.txt', 'file', '/path/to/file');

      expect(aiAnalyzer.analyzeContent).toHaveBeenCalledWith(
        'Content',
        'file.txt',
        'file',
        mockTags,
        false, // debug defaults to false
        null // no source path
      );
    });
  });

  describe('analyze - tag filtering', () => {
    it('should filter out tags that do not exist in Evernote', async () => {
      const mockTags = ['work', 'personal'];
      const mockAIResult = {
        title: 'Document',
        description: 'Desc',
        tags: ['work', 'invalid-tag', 'another-invalid', 'personal']
      };
      const mockFilteredTags = {
        valid: ['work', 'personal'],
        rejected: [
          { tag: 'invalid-tag', reason: 'Tag does not exist in Evernote' },
          { tag: 'another-invalid', reason: 'Tag does not exist in Evernote' }
        ]
      };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(mockTags);
      vi.mocked(aiAnalyzer.analyzeContent).mockResolvedValueOnce(mockAIResult);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue(mockFilteredTags);

      const result = await workflow.analyze('Content', 'file.txt', 'file', '/path');

      expect(result.tags).toEqual(['work', 'personal']);
      expect(result.tags).not.toContain('invalid-tag');
    });

    it('should handle case when no tags are valid', async () => {
      const mockTags = ['tag1', 'tag2'];
      const mockAIResult = {
        title: 'Document',
        description: 'Desc',
        tags: ['invalid1', 'invalid2', 'invalid3']
      };
      const mockFilteredTags = {
        valid: [],
        rejected: [
          { tag: 'invalid1', reason: 'Tag does not exist in Evernote' },
          { tag: 'invalid2', reason: 'Tag does not exist in Evernote' },
          { tag: 'invalid3', reason: 'Tag does not exist in Evernote' }
        ]
      };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(mockTags);
      vi.mocked(aiAnalyzer.analyzeContent).mockResolvedValueOnce(mockAIResult);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue(mockFilteredTags);

      const result = await workflow.analyze('Content', 'file.txt', 'file', '/path');

      expect(result.tags).toEqual([]);
    });

    it('should handle case when AI returns no tags', async () => {
      const mockTags = ['tag1'];
      const mockAIResult = {
        title: 'Document',
        description: 'Desc',
        tags: []
      };
      const mockFilteredTags = { valid: [], rejected: [] };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(mockTags);
      vi.mocked(aiAnalyzer.analyzeContent).mockResolvedValueOnce(mockAIResult);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue(mockFilteredTags);

      const result = await workflow.analyze('Content', 'file.txt', 'file', '/path');

      expect(result.tags).toEqual([]);
    });
  });

  describe('analyze - edge cases', () => {
    it('should handle empty content', async () => {
      const mockTags = ['tag1'];
      const mockAIResult = { title: 'Empty', description: 'Empty file', tags: [] };
      const mockFilteredTags = { valid: [], rejected: [] };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(mockTags);
      vi.mocked(aiAnalyzer.analyzeContent).mockResolvedValueOnce(mockAIResult);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue(mockFilteredTags);

      const result = await workflow.analyze('', 'empty.txt', 'file', '/path');

      expect(result.title).toBe('Empty');
      expect(result.contentHash).toBeDefined();
    });

    it('should handle very long content', async () => {
      const longContent = 'x'.repeat(100000);
      const mockTags = ['tag1'];
      const mockAIResult = { title: 'Long', description: 'Long content', tags: [] };
      const mockFilteredTags = { valid: [], rejected: [] };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue(mockTags);
      vi.mocked(aiAnalyzer.analyzeContent).mockResolvedValueOnce(mockAIResult);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue(mockFilteredTags);

      const result = await workflow.analyze(longContent, 'large.txt', 'file', '/path');

      expect(result.contentHash).toBeDefined();
      expect(result.contentHash.length).toBe(32); // MD5 hash is 32 chars
    });

    it('should handle empty tag cache', async () => {
      const mockAIResult = {
        title: 'Document',
        description: 'Desc',
        tags: ['tag1', 'tag2']
      };
      const mockFilteredTags = { valid: [], rejected: [] };

      vi.mocked(tagCacheModule.tagCache.getTags).mockReturnValue([]);
      vi.mocked(aiAnalyzer.analyzeContent).mockResolvedValueOnce(mockAIResult);
      vi.mocked(tagValidator.filterExistingTags).mockReturnValue(mockFilteredTags);

      const result = await workflow.analyze('Content', 'file.txt', 'file', '/path');

      // Should still work, just no tags will be valid
      expect(result.tags).toEqual([]);
    });
  });
});
