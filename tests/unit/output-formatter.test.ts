import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  colors,
  box,
  getTerminalWidth,
  horizontalLine,
  stepHeader,
  formatTextPreview,
  formatAIResults,
  success,
  info,
  warning,
  error,
  createSpinner,
} from '../../src/output-formatter.js';

describe('output-formatter', () => {
  describe('colors', () => {
    it('should have all required color functions', () => {
      expect(colors).toHaveProperty('success');
      expect(colors).toHaveProperty('info');
      expect(colors).toHaveProperty('warning');
      expect(colors).toHaveProperty('error');
      expect(colors).toHaveProperty('highlight');
      expect(colors).toHaveProperty('muted');
      expect(colors).toHaveProperty('accent');
    });

    it('should color text with success color', () => {
      const result = colors.success('test');
      expect(result).toContain('test');
    });
  });

  describe('box', () => {
    it('should have all box drawing characters', () => {
      expect(box).toHaveProperty('topLeft');
      expect(box).toHaveProperty('topRight');
      expect(box).toHaveProperty('bottomLeft');
      expect(box).toHaveProperty('bottomRight');
      expect(box).toHaveProperty('horizontal');
      expect(box).toHaveProperty('vertical');
    });
  });

  describe('getTerminalWidth', () => {
    it('should return a positive number', () => {
      const width = getTerminalWidth();
      expect(width).toBeGreaterThan(0);
      expect(typeof width).toBe('number');
    });

    it('should return default width if stdout.columns is not available', () => {
      const originalColumns = process.stdout.columns;
      // @ts-ignore - testing edge case
      delete process.stdout.columns;

      const width = getTerminalWidth();
      expect(width).toBe(80);

      // Restore
      process.stdout.columns = originalColumns;
    });
  });

  describe('horizontalLine', () => {
    it('should create a line of default character', () => {
      const line = horizontalLine(10);
      expect(line).toBe('─'.repeat(10));
      expect(line.length).toBe(10);
    });

    it('should create a line of custom character', () => {
      const line = horizontalLine(5, '=');
      expect(line).toBe('='.repeat(5));
      expect(line.length).toBe(5);
    });

    it('should use terminal width if width is null', () => {
      const line = horizontalLine(null);
      expect(line.length).toBeGreaterThan(0);
    });
  });

  describe('stepHeader', () => {
    it('should create a step header with number and description', () => {
      const header = stepHeader(1, 'Test Step');
      expect(header).toContain('Step 1');
      expect(header).toContain('Test Step');
      expect(header).toContain(box.topLeft);
      expect(header).toContain(box.topRight);
    });

    it('should handle different step numbers', () => {
      const header1 = stepHeader(1, 'First');
      const header2 = stepHeader(99, 'Ninety-Nine');

      expect(header1).toContain('Step 1');
      expect(header2).toContain('Step 99');
    });
  });

  describe('formatTextPreview', () => {
    it('should format short text without truncation', () => {
      const text = 'This is a short text';
      const preview = formatTextPreview(text, 'text', 500);

      expect(preview).toContain(text);
      expect(preview).toContain(`${text.length} chars`);
      expect(preview).not.toContain('more characters');
    });

    it('should truncate long text and show remaining characters', () => {
      const longText = 'A'.repeat(1000);
      const preview = formatTextPreview(longText, 'text', 500);

      expect(preview).toContain('500/1000 chars');
      expect(preview).toContain('500 more characters');
    });

    it('should handle empty text', () => {
      const preview = formatTextPreview('', 'text', 500);
      expect(preview).toContain('0 chars');
    });

    it('should handle text with newlines', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      const preview = formatTextPreview(text, 'text', 500);

      expect(preview).toContain('Line 1');
      expect(preview).toContain('Line 2');
      expect(preview).toContain('Line 3');
    });

    it('should limit preview to 10 lines', () => {
      const text = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n');
      const preview = formatTextPreview(text, 'text', 5000);

      // Count how many lines appear
      const lines = preview.split('\n').filter(l => l.includes('Line'));
      expect(lines.length).toBeLessThanOrEqual(10);
    });
  });

  describe('formatAIResults', () => {
    it('should format AI results with title, description, and tags', () => {
      const title = 'Test Document Title';
      const description = 'This is a test description of the document.';
      const tags = ['tag1', 'tag2', 'tag3'];

      const result = formatAIResults(title, description, tags);

      expect(result).toContain(title);
      expect(result).toContain(description);
      expect(result).toContain('tag1');
      expect(result).toContain('tag2');
      expect(result).toContain('tag3');
      expect(result).toContain('Title:');
      expect(result).toContain('Description:');
      expect(result).toContain('Tags:');
    });

    it('should handle empty tags array', () => {
      const result = formatAIResults('Title', 'Description', []);
      expect(result).toContain('Title');
      expect(result).toContain('Description');
      expect(result).toContain('Tags:');
    });

    it('should handle long title with word wrapping', () => {
      const longTitle = 'This is a very long title that should wrap across multiple lines when displayed in the terminal';
      const result = formatAIResults(longTitle, 'Short desc', ['tag']);

      expect(result).toContain('This is a very long title');
    });

    it('should handle long description with word wrapping', () => {
      const longDesc = 'This is a very long description that contains many words and should wrap across multiple lines when displayed in the terminal window to ensure readability.';
      const result = formatAIResults('Short title', longDesc, ['tag']);

      expect(result).toContain('This is a very long description');
    });

    it('should handle many tags', () => {
      const manyTags = Array.from({ length: 20 }, (_, i) => `tag${i + 1}`);
      const result = formatAIResults('Title', 'Description', manyTags);

      expect(result).toContain('tag1');
      expect(result).toContain('tag20');
    });
  });

  describe('message functions', () => {
    it('success should prefix with checkmark', () => {
      const msg = success('Operation completed');
      expect(msg).toContain('✓');
      expect(msg).toContain('Operation completed');
    });

    it('info should prefix with info icon', () => {
      const msg = info('Information message');
      expect(msg).toContain('ℹ');
      expect(msg).toContain('Information message');
    });

    it('warning should prefix with warning icon', () => {
      const msg = warning('Warning message');
      expect(msg).toContain('⚠');
      expect(msg).toContain('Warning message');
    });

    it('error should prefix with X icon', () => {
      const msg = error('Error message');
      expect(msg).toContain('✖');
      expect(msg).toContain('Error message');
    });
  });

  describe('createSpinner', () => {
    it('should create a spinner with text', () => {
      const spinner = createSpinner('Loading...');
      expect(spinner).toBeDefined();
      expect(spinner).toHaveProperty('start');
      expect(spinner).toHaveProperty('stop');
      expect(spinner).toHaveProperty('succeed');
      expect(spinner).toHaveProperty('fail');
    });

    it('should have correct spinner properties', () => {
      const spinner = createSpinner('Test');
      expect(spinner.text).toBe('Test');
    });
  });
});
