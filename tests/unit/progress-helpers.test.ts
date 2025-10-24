import { describe, it, expect } from 'vitest';
import {
  getStageProgress,
  getStageMessage,
  createProgressData,
  extractErrorMessage,
  formatRateLimitDuration,
  isSupportedFileType,
  getSupportedExtensions,
  type ProcessingStage
} from '../../electron/processing/progress-helpers.js';

describe('progress-helpers', () => {
  describe('createProgressData', () => {
    it('should create basic progress data', () => {
      const data = createProgressData('/path/to/file.pdf', 'extracting');

      expect(data.filePath).toBe('/path/to/file.pdf');
      expect(data.status).toBe('extracting');
      expect(data.progress).toBe(25);
      expect(data.message).toBe('Extracting file content...');
    });

    it('should create progress data with error', () => {
      const data = createProgressData('/path/to/file.pdf', 'error', {
        error: 'Failed to process file'
      });

      expect(data.status).toBe('error');
      expect(data.progress).toBe(0);
      expect(data.error).toBe('Failed to process file');
    });

    it('should create progress data with result', () => {
      const data = createProgressData('/path/to/file.pdf', 'complete', {
        result: {
          title: 'Test Document',
          description: 'A test document',
          tags: ['test', 'document'],
          noteUrl: 'https://www.evernote.com/Home.action#n=abc123'
        }
      });

      expect(data.status).toBe('complete');
      expect(data.progress).toBe(100);
      expect(data.result?.title).toBe('Test Document');
      expect(data.result?.noteUrl).toBe('https://www.evernote.com/Home.action#n=abc123');
    });

    it('should create progress data with rate limit duration', () => {
      const data = createProgressData('/path/to/file.pdf', 'rate-limited', {
        rateLimitDuration: 120
      });

      expect(data.status).toBe('rate-limited');
      expect(data.message).toBe('Rate limited - retry in 120s');
    });

    it('should allow custom message override', () => {
      const data = createProgressData('/path/to/file.pdf', 'analyzing', {
        customMessage: 'Custom processing message'
      });

      expect(data.message).toBe('Custom processing message');
    });

    it('should create progress data with all options', () => {
      const data = createProgressData('/path/to/file.pdf', 'complete', {
        result: {
          title: 'Title',
          description: 'Desc',
          tags: ['tag1']
        },
        customMessage: 'All done!'
      });

      expect(data.filePath).toBe('/path/to/file.pdf');
      expect(data.status).toBe('complete');
      expect(data.progress).toBe(100);
      expect(data.message).toBe('All done!');
      expect(data.result?.title).toBe('Title');
    });
  });

  describe('extractErrorMessage', () => {
    it('should extract message from Error object', () => {
      const error = new Error('Something went wrong');
      expect(extractErrorMessage(error)).toBe('Something went wrong');
    });

    it('should handle string errors', () => {
      expect(extractErrorMessage('Error string')).toBe('Error string');
    });

    it('should extract message from object with message property', () => {
      const error = { message: 'Custom error' };
      expect(extractErrorMessage(error)).toBe('Custom error');
    });

    it('should handle null', () => {
      expect(extractErrorMessage(null)).toBe('Unknown error');
    });

    it('should handle undefined', () => {
      expect(extractErrorMessage(undefined)).toBe('Unknown error');
    });

    it('should handle numbers', () => {
      expect(extractErrorMessage(404)).toBe('Unknown error');
    });

    it('should handle objects without message', () => {
      expect(extractErrorMessage({ code: 500 })).toBe('Unknown error');
    });

    it('should handle TypeError', () => {
      const error = new TypeError('Type mismatch');
      expect(extractErrorMessage(error)).toBe('Type mismatch');
    });

    it('should handle RangeError', () => {
      const error = new RangeError('Out of range');
      expect(extractErrorMessage(error)).toBe('Out of range');
    });
  });

  describe('formatRateLimitDuration', () => {
    it('should format seconds only when less than 60', () => {
      expect(formatRateLimitDuration(30)).toBe('30s');
      expect(formatRateLimitDuration(45)).toBe('45s');
      expect(formatRateLimitDuration(1)).toBe('1s');
      expect(formatRateLimitDuration(59)).toBe('59s');
    });

    it('should format minutes without seconds', () => {
      expect(formatRateLimitDuration(60)).toBe('1m');
      expect(formatRateLimitDuration(120)).toBe('2m');
      expect(formatRateLimitDuration(300)).toBe('5m');
      expect(formatRateLimitDuration(3600)).toBe('60m');
    });

    it('should format minutes with seconds', () => {
      expect(formatRateLimitDuration(90)).toBe('1m 30s');
      expect(formatRateLimitDuration(135)).toBe('2m 15s');
      expect(formatRateLimitDuration(61)).toBe('1m 1s');
      expect(formatRateLimitDuration(905)).toBe('15m 5s');
    });

    it('should handle zero', () => {
      expect(formatRateLimitDuration(0)).toBe('0s');
    });

    it('should handle large durations', () => {
      expect(formatRateLimitDuration(7200)).toBe('120m');
      expect(formatRateLimitDuration(7261)).toBe('121m 1s');
    });
  });

  describe('isSupportedFileType', () => {
    it('should return true for PDF files', () => {
      expect(isSupportedFileType('document.pdf')).toBe(true);
      expect(isSupportedFileType('file.PDF')).toBe(true);
    });

    it('should return true for text files', () => {
      expect(isSupportedFileType('notes.txt')).toBe(true);
      expect(isSupportedFileType('readme.md')).toBe(true);
      expect(isSupportedFileType('doc.markdown')).toBe(true);
    });

    it('should return true for Word documents', () => {
      expect(isSupportedFileType('report.docx')).toBe(true);
      expect(isSupportedFileType('letter.DOCX')).toBe(true);
    });

    it('should return true for image files', () => {
      expect(isSupportedFileType('photo.png')).toBe(true);
      expect(isSupportedFileType('image.jpg')).toBe(true);
      expect(isSupportedFileType('picture.jpeg')).toBe(true);
      expect(isSupportedFileType('animation.gif')).toBe(true);
      expect(isSupportedFileType('bitmap.bmp')).toBe(true);
      expect(isSupportedFileType('scan.tiff')).toBe(true);
    });

    it('should return false for unsupported file types', () => {
      expect(isSupportedFileType('video.mp4')).toBe(false);
      expect(isSupportedFileType('audio.mp3')).toBe(false);
      expect(isSupportedFileType('archive.zip')).toBe(false);
      expect(isSupportedFileType('executable.exe')).toBe(false);
      expect(isSupportedFileType('data.json')).toBe(false);
    });

    it('should handle files without extensions', () => {
      expect(isSupportedFileType('filename')).toBe(false);
    });

    it('should handle files with multiple dots', () => {
      expect(isSupportedFileType('my.file.name.pdf')).toBe(true);
      expect(isSupportedFileType('archive.tar.gz')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isSupportedFileType('FILE.PDF')).toBe(true);
      expect(isSupportedFileType('Image.PNG')).toBe(true);
      expect(isSupportedFileType('Doc.Docx')).toBe(true);
    });

    it('should handle paths with directories', () => {
      expect(isSupportedFileType('/path/to/file.pdf')).toBe(true);
      expect(isSupportedFileType('C:\\Users\\Documents\\file.docx')).toBe(true);
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return array of extensions', () => {
      const extensions = getSupportedExtensions();

      expect(Array.isArray(extensions)).toBe(true);
      expect(extensions.length).toBeGreaterThan(0);
    });

    it('should include common document types', () => {
      const extensions = getSupportedExtensions();

      expect(extensions).toContain('.pdf');
      expect(extensions).toContain('.txt');
      expect(extensions).toContain('.md');
      expect(extensions).toContain('.docx');
    });

    it('should include image types', () => {
      const extensions = getSupportedExtensions();

      expect(extensions).toContain('.png');
      expect(extensions).toContain('.jpg');
      expect(extensions).toContain('.jpeg');
    });

    it('should have extensions with dots', () => {
      const extensions = getSupportedExtensions();

      extensions.forEach(ext => {
        expect(ext.startsWith('.')).toBe(true);
      });
    });

    it('should return same array each time', () => {
      const ext1 = getSupportedExtensions();
      const ext2 = getSupportedExtensions();

      expect(ext1).toEqual(ext2);
    });

    it('should include exactly 11 extensions', () => {
      const extensions = getSupportedExtensions();

      expect(extensions).toHaveLength(11);
    });
  });
});
