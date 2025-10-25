import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildAugmentedContent,
  extractAugmentationStatus,
  augmentNote
} from '../../electron/evernote/note-augmenter.js';
import { MockProgressReporter } from '../../electron/core/progress-reporter.js';

// Mock dependencies
vi.mock('../../electron/evernote/client.js', () => ({
  getNoteWithContent: vi.fn(),
  updateNote: vi.fn()
}));

vi.mock('../../electron/processing/file-extractor.js', () => ({
  extractFileContent: vi.fn()
}));

vi.mock('../../electron/ai/ai-analyzer.js', () => ({
  analyzeContent: vi.fn()
}));

vi.mock('../../electron/database/queue-db.js', () => ({
  getCachedNoteAnalysis: vi.fn().mockReturnValue(null), // No cache by default
  saveNoteAnalysisCache: vi.fn(),
  clearNoteAnalysisCache: vi.fn()
}));

describe('note-augmenter', () => {

  describe('buildAugmentedContent', () => {
    // Pure function - NO MOCKS
    it('should build augmented ENML from AI results', () => {
      const originalEnml = '<?xml version="1.0"?><en-note><div>Original</div></en-note>';
      const aiResult = {
        title: 'AI Title',
        description: 'AI description here',
        tags: ['tag1', 'tag2']
      };

      const augmented = buildAugmentedContent(originalEnml, aiResult);

      expect(augmented).toContain('Original');
      expect(augmented).toContain('AI Summary');
      expect(augmented).toContain('AI description here');
      // Tags are not shown in augmented content (they're added to note metadata)
      expect(augmented).not.toContain('tag1, tag2');
      expect(augmented).toContain('<hr/>');
    });

    it('should include AI Summary section', () => {
      const originalEnml = '<en-note>Test</en-note>';
      const aiResult = { title: 'T', description: 'D', tags: [] };

      const augmented = buildAugmentedContent(originalEnml, aiResult);

      // New format only has "AI Summary" header, no separate section labels
      expect(augmented).toContain('AI Summary');
      expect(augmented).toContain('D'); // Description
      expect(augmented).not.toContain('Summary:');
      expect(augmented).not.toContain('Suggested Tags:');
    });

    it('should include timestamp', () => {
      const originalEnml = '<en-note>Test</en-note>';
      const aiResult = { title: 'T', description: 'D', tags: [] };

      const augmented = buildAugmentedContent(originalEnml, aiResult);

      // Should contain date in some format
      expect(augmented).toMatch(/\d{4}/); // Year
    });

    it('should maintain valid ENML structure', () => {
      const originalEnml = '<?xml version="1.0"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note>Test</en-note>';
      const aiResult = { title: 'T', description: 'D', tags: ['tag1'] };

      const augmented = buildAugmentedContent(originalEnml, aiResult);

      expect(augmented).toContain('<?xml version="1.0"');
      expect(augmented).toContain('<!DOCTYPE en-note');
      expect(augmented).toMatch(/<en-note>.*<\/en-note>/s);
    });

    it('should escape XML characters in AI results', () => {
      const originalEnml = '<en-note>Test</en-note>';
      const aiResult = {
        title: 'Title with <tags> & "quotes"',
        description: "Description with 'apostrophes' and <xml> & \"quotes\"",
        tags: ['tag>1', 'tag&2']
      };

      const augmented = buildAugmentedContent(originalEnml, aiResult);

      // Description should contain escaped versions
      expect(augmented).toContain('&apos;apostrophes&apos;');
      expect(augmented).toContain('&lt;xml&gt;');
      expect(augmented).toContain('&amp;');
      expect(augmented).toContain('&quot;quotes&quot;');

      // Should not contain raw special chars in content
      expect(augmented).not.toContain("'apostrophes'");
    });
  });

  describe('extractAugmentationStatus', () => {
    // Pure function - NO MOCKS
    it('should detect augmented notes', () => {
      const attributes = {
        aiAugmented: 'true',
        aiAugmentedDate: '2025-10-22T15:30:00Z'
      };

      const status = extractAugmentationStatus(attributes);

      expect(status.isAugmented).toBe(true);
      expect(status.augmentedDate).toBe('2025-10-22T15:30:00Z');
    });

    it('should detect non-augmented notes', () => {
      const status = extractAugmentationStatus({});

      expect(status.isAugmented).toBe(false);
      expect(status.augmentedDate).toBeUndefined();
    });

    it('should handle false aiAugmented flag', () => {
      const attributes = {
        aiAugmented: 'false'
      };

      const status = extractAugmentationStatus(attributes);

      expect(status.isAugmented).toBe(false);
    });

    it('should handle missing aiAugmentedDate', () => {
      const attributes = {
        aiAugmented: 'true'
      };

      const status = extractAugmentationStatus(attributes);

      expect(status.isAugmented).toBe(true);
      expect(status.augmentedDate).toBeUndefined();
    });

    it('should handle arbitrary attribute values', () => {
      const attributes = {
        aiAugmented: 'yes',
        aiAugmentedDate: '2025-10-22'
      };

      const status = extractAugmentationStatus(attributes);

      // Should be false since we check for exact string 'true'
      expect(status.isAugmented).toBe(false);
      expect(status.augmentedDate).toBe('2025-10-22');
    });
  });

  describe('augmentNote', () => {
    // Orchestration - MOCK external dependencies
    let mockGetNoteWithContent: any;
    let mockUpdateNote: any;
    let mockAnalyzeContent: any;
    let mockExtractFileContent: any;
    let mockReporter: MockProgressReporter;

    beforeEach(async () => {
      // Get mocked functions
      const evernoteClient = await import('../../electron/evernote/client.js');
      const aiAnalyzer = await import('../../electron/ai/ai-analyzer.js');
      const fileExtractor = await import('../../electron/processing/file-extractor.js');

      mockGetNoteWithContent = vi.mocked(evernoteClient.getNoteWithContent);
      mockUpdateNote = vi.mocked(evernoteClient.updateNote);
      mockAnalyzeContent = vi.mocked(aiAnalyzer.analyzeContent);
      mockExtractFileContent = vi.mocked(fileExtractor.extractFileContent);

      // Reset all mocks
      vi.clearAllMocks();

      // Create mock progress reporter
      mockReporter = new MockProgressReporter();
    });

    it('should complete full augmentation flow', async () => {
      // Mock getNoteWithContent
      mockGetNoteWithContent.mockResolvedValueOnce({
        guid: 'n1',
        title: 'Original Title',
        content: '<en-note><div>Original content</div></en-note>',
        resources: []
      } as any);

      // Mock AI analysis
      mockAnalyzeContent.mockResolvedValueOnce({
        title: 'AI Generated Title',
        description: 'AI description',
        tags: ['ai-tag1', 'ai-tag2']
      });

      // Mock updateNote
      mockUpdateNote.mockResolvedValueOnce({
        guid: 'n1',
        title: 'Original Title'
      } as any);

      const result = await augmentNote('n1', mockReporter);

      expect(result.success).toBe(true);
      expect(result.noteUrl).toBeDefined();
      expect(mockGetNoteWithContent).toHaveBeenCalledWith('n1');
      expect(mockAnalyzeContent).toHaveBeenCalled();
      expect(mockUpdateNote).toHaveBeenCalled();
    });

    it('should extract text from note content', async () => {
      mockGetNoteWithContent.mockResolvedValueOnce({
        guid: 'n1',
        content: '<en-note><div>Test content</div></en-note>',
        resources: []
      } as any);

      mockAnalyzeContent.mockResolvedValueOnce({
        title: 'T', description: 'D', tags: []
      });

      mockUpdateNote.mockResolvedValueOnce({ guid: 'n1' } as any);

      await augmentNote('n1', mockReporter);

      // AI should have been called with extracted text
      const aiCall = mockAnalyzeContent.mock.calls[0];
      expect(aiCall[0]).toContain('Test content');
    });

    it('should handle note with PDF attachment', async () => {
      mockGetNoteWithContent.mockResolvedValueOnce({
        guid: 'n1',
        content: '<en-note>Note content</en-note>',
        resources: [
          {
            mime: 'application/pdf',
            data: { body: Buffer.from('fake-pdf-data') },
            attributes: { fileName: 'document.pdf' }
          }
        ]
      } as any);

      mockExtractFileContent.mockResolvedValueOnce({
        text: 'Extracted PDF text',
        fileType: 'pdf',
        fileName: 'document.pdf'
      });

      mockAnalyzeContent.mockResolvedValueOnce({
        title: 'Document', description: 'D', tags: []
      });

      mockUpdateNote.mockResolvedValueOnce({ guid: 'n1' } as any);

      await augmentNote('n1', mockReporter);

      // Should have called file extraction
      expect(mockExtractFileContent).toHaveBeenCalled();

      // AI should have been called with combined text
      const aiCall = mockAnalyzeContent.mock.calls[0];
      expect(aiCall[0]).toContain('Note content');
      expect(aiCall[0]).toContain('Extracted PDF text');
      expect(aiCall[0]).toContain('[Attachment: document.pdf]');
    });

    it('should handle note with image attachment', async () => {
      mockGetNoteWithContent.mockResolvedValueOnce({
        guid: 'n1',
        content: '<en-note>Note</en-note>',
        resources: [
          {
            mime: 'image/png',
            data: { body: Buffer.from('fake-image-data') },
            attributes: { fileName: 'screenshot.png' }
          }
        ]
      } as any);

      mockExtractFileContent.mockResolvedValueOnce({
        text: 'OCR extracted text',
        fileType: 'image',
        fileName: 'screenshot.png'
      });

      mockAnalyzeContent.mockResolvedValueOnce({
        title: 'Screenshot', description: 'D', tags: []
      });

      mockUpdateNote.mockResolvedValueOnce({ guid: 'n1' } as any);

      await augmentNote('n1', mockReporter);

      expect(mockExtractFileContent).toHaveBeenCalled();
    });

    it('should skip unsupported attachment types', async () => {
      mockGetNoteWithContent.mockResolvedValueOnce({
        guid: 'n1',
        content: '<en-note>Note</en-note>',
        resources: [
          {
            mime: 'application/zip',
            data: { body: Buffer.from('fake-zip-data') },
            attributes: { fileName: 'archive.zip' }
          }
        ]
      } as any);

      mockAnalyzeContent.mockResolvedValueOnce({
        title: 'T', description: 'D', tags: []
      });

      mockUpdateNote.mockResolvedValueOnce({ guid: 'n1' } as any);

      await augmentNote('n1', mockReporter);

      // Should NOT have called file extraction for zip
      expect(mockExtractFileContent).not.toHaveBeenCalled();
    });

    it('should continue if attachment extraction fails', async () => {
      mockGetNoteWithContent.mockResolvedValueOnce({
        guid: 'n1',
        content: '<en-note>Note</en-note>',
        resources: [
          {
            mime: 'application/pdf',
            data: { body: Buffer.from('fake-pdf-data') },
            attributes: { fileName: 'corrupted.pdf' }
          }
        ]
      } as any);

      mockExtractFileContent.mockRejectedValueOnce(new Error('Extraction failed'));

      mockAnalyzeContent.mockResolvedValueOnce({
        title: 'T', description: 'D', tags: []
      });

      mockUpdateNote.mockResolvedValueOnce({ guid: 'n1' } as any);

      const result = await augmentNote('n1', mockReporter);

      // Should still succeed despite extraction failure
      expect(result.success).toBe(true);
      expect(mockAnalyzeContent).toHaveBeenCalled();
    });

    it('should update note with augmentation metadata', async () => {
      mockGetNoteWithContent.mockResolvedValueOnce({
        guid: 'n1',
        content: '<en-note>Test</en-note>',
        resources: []
      } as any);

      mockAnalyzeContent.mockResolvedValueOnce({
        title: 'T', description: 'D', tags: []
      });

      mockUpdateNote.mockResolvedValueOnce({ guid: 'n1' } as any);

      await augmentNote('n1', mockReporter);

      // Check updateNote was called with correct attributes
      const updateCall = mockUpdateNote.mock.calls[0];
      expect(updateCall[2]).toEqual({
        applicationData: {
          aiAugmented: 'true',
          aiAugmentedDate: expect.any(String)
        }
      });
    });

    it('should handle errors gracefully', async () => {
      mockGetNoteWithContent.mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await augmentNote('n1', mockReporter);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle note with no content', async () => {
      mockGetNoteWithContent.mockResolvedValueOnce({
        guid: 'n1',
        content: undefined
      } as any);

      const result = await augmentNote('n1', mockReporter);

      expect(result.success).toBe(false);
      expect(result.error).toContain('no content');
    });

    it('should send progress events if reporter provided', async () => {
      mockGetNoteWithContent.mockResolvedValueOnce({
        guid: 'n1',
        content: '<en-note>Test</en-note>',
        resources: []
      } as any);

      mockAnalyzeContent.mockResolvedValueOnce({
        title: 'T', description: 'D', tags: []
      });

      mockUpdateNote.mockResolvedValueOnce({ guid: 'n1' } as any);

      await augmentNote('n1', mockReporter);

      // Should have sent multiple progress events
      expect(mockReporter.augmentProgressReports.length).toBeGreaterThan(0);

      // Check for different status values
      const statuses = mockReporter.augmentProgressReports.map(r => r.status);
      expect(statuses).toContain('fetching');
      expect(statuses).toContain('extracting');
      expect(statuses).toContain('analyzing');
      expect(statuses).toContain('building');
      expect(statuses).toContain('uploading');
      expect(statuses).toContain('complete');
    });

    it('should send error event on failure', async () => {
      mockGetNoteWithContent.mockRejectedValueOnce(new Error('Test error'));

      await augmentNote('n1', mockReporter);

      // Should have sent error event
      const errorEvent = mockReporter.augmentProgressReports.find(r => r.status === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.error).toContain('Test error');
    });

    it('should include note URL in completion', async () => {
      mockGetNoteWithContent.mockResolvedValueOnce({
        guid: 'n1',
        content: '<en-note>Test</en-note>',
        resources: []
      } as any);

      mockAnalyzeContent.mockResolvedValueOnce({
        title: 'T', description: 'D', tags: []
      });

      mockUpdateNote.mockResolvedValueOnce({ guid: 'n1' } as any);

      const result = await augmentNote('n1', mockReporter);

      expect(result.noteUrl).toContain('Home.action#n=n1');
    });
  });
});
