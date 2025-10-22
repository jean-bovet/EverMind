import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatDate,
  formatShortDate,
  truncateText,
  pluralize,
  formatCount,
  getAugmentButtonTooltip,
  getAugmentButtonLabel
} from '../../electron/utils/format-helpers.js';

describe('format-helpers', () => {

  describe('formatDate', () => {
    it('should format date with default locale', () => {
      const timestamp = Date.parse('2023-11-14T10:30:00Z');
      const result = formatDate(timestamp);
      expect(result).toBe('Nov 14, 2023');
    });

    it('should format date with custom locale', () => {
      const timestamp = Date.parse('2023-11-14T10:30:00Z');
      const result = formatDate(timestamp, 'fr-FR');
      // French locale formats differently
      expect(result).toContain('14');
      expect(result).toContain('2023');
    });

    it('should handle current date', () => {
      const now = Date.now();
      const result = formatDate(now);
      const date = new Date(now);
      expect(result).toContain(date.getFullYear().toString());
    });

    it('should handle very old dates', () => {
      const timestamp = Date.parse('1970-01-01T00:00:00Z');
      const result = formatDate(timestamp);
      expect(result).toBe('Jan 1, 1970');
    });

    it('should handle future dates', () => {
      const timestamp = Date.parse('2099-12-31T12:00:00Z');
      const result = formatDate(timestamp);
      expect(result).toContain('2099');
      expect(result).toContain('Dec');
    });
  });

  describe('formatShortDate', () => {
    // Mock the current date for consistent testing
    let originalDate: DateConstructor;
    let mockCurrentYear = 2025;

    beforeEach(() => {
      originalDate = global.Date;
      // Mock Date to always return 2025 as current year
      global.Date = class extends originalDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(mockCurrentYear, 0, 1); // Jan 1, 2025
          } else {
            super(...args);
          }
        }
        static now() {
          return new originalDate(mockCurrentYear, 0, 1).getTime();
        }
        getFullYear() {
          if (arguments.length === 0 && this.getTime() === new originalDate(mockCurrentYear, 0, 1).getTime()) {
            return mockCurrentYear;
          }
          return super.getFullYear();
        }
      } as any;
    });

    afterEach(() => {
      global.Date = originalDate;
    });

    it('should omit year for current year dates', () => {
      const timestamp = Date.parse('2025-10-22T10:00:00Z');
      const result = formatShortDate(timestamp);
      expect(result).toBe('Oct 22');
      expect(result).not.toContain('2025');
    });

    it('should include year for past years', () => {
      const timestamp = Date.parse('2024-10-22T10:00:00Z');
      const result = formatShortDate(timestamp);
      expect(result).toBe('Oct 22, 2024');
    });

    it('should include year for future years', () => {
      const timestamp = Date.parse('2026-10-22T10:00:00Z');
      const result = formatShortDate(timestamp);
      expect(result).toBe('Oct 22, 2026');
    });

    it('should handle custom locale', () => {
      const timestamp = Date.parse('2024-10-22T10:00:00Z');
      const result = formatShortDate(timestamp, 'fr-FR');
      expect(result).toContain('22');
      expect(result).toContain('2024');
    });
  });

  describe('truncateText', () => {
    it('should not truncate text shorter than maxLength', () => {
      expect(truncateText('Hello', 10)).toBe('Hello');
    });

    it('should not truncate text equal to maxLength', () => {
      expect(truncateText('Hello', 5)).toBe('Hello');
    });

    it('should truncate text longer than maxLength', () => {
      expect(truncateText('Hello World', 5)).toBe('Hello...');
      expect(truncateText('Hello World', 8)).toBe('Hello Wo...');
    });

    it('should handle empty string', () => {
      expect(truncateText('', 10)).toBe('');
    });

    it('should handle very long text', () => {
      const longText = 'a'.repeat(1000);
      const result = truncateText(longText, 50);
      expect(result.length).toBe(53); // 50 chars + '...'
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle maxLength smaller than ellipsis length', () => {
      const result = truncateText('Hello', 2);
      expect(result).toBe('He');
      expect(result.length).toBe(2);
    });

    it('should handle exact boundary case', () => {
      expect(truncateText('Hello World', 11)).toBe('Hello World');
      expect(truncateText('Hello World', 10)).toBe('Hello Worl...');
    });

    it('should preserve exact length when maxLength < 3', () => {
      expect(truncateText('Hello', 1)).toBe('H');
      expect(truncateText('Hello', 0)).toBe('');
    });
  });

  describe('pluralize', () => {
    it('should return singular for count of 1', () => {
      expect(pluralize(1, 'file')).toBe('file');
    });

    it('should return plural for count of 0', () => {
      expect(pluralize(0, 'file')).toBe('files');
    });

    it('should return plural for count > 1', () => {
      expect(pluralize(2, 'file')).toBe('files');
      expect(pluralize(100, 'file')).toBe('files');
    });

    it('should use custom plural form', () => {
      expect(pluralize(0, 'person', 'people')).toBe('people');
      expect(pluralize(1, 'person', 'people')).toBe('person');
      expect(pluralize(2, 'person', 'people')).toBe('people');
    });

    it('should handle edge cases with custom plurals', () => {
      expect(pluralize(1, 'child', 'children')).toBe('child');
      expect(pluralize(5, 'child', 'children')).toBe('children');
    });

    it('should default to adding "s" when no custom plural', () => {
      expect(pluralize(2, 'cat')).toBe('cats');
      expect(pluralize(0, 'dog')).toBe('dogs');
    });

    it('should handle negative counts as plural', () => {
      expect(pluralize(-1, 'item')).toBe('items');
      expect(pluralize(-5, 'item')).toBe('items');
    });
  });

  describe('formatCount', () => {
    it('should format singular count', () => {
      expect(formatCount(1, 'file')).toBe('1 file');
    });

    it('should format plural count', () => {
      expect(formatCount(0, 'file')).toBe('0 files');
      expect(formatCount(2, 'file')).toBe('2 files');
      expect(formatCount(100, 'file')).toBe('100 files');
    });

    it('should use custom plural form', () => {
      expect(formatCount(0, 'person', 'people')).toBe('0 people');
      expect(formatCount(1, 'person', 'people')).toBe('1 person');
      expect(formatCount(5, 'person', 'people')).toBe('5 people');
    });

    it('should handle model example from StatusBar', () => {
      expect(formatCount(1, 'model')).toBe('1 model');
      expect(formatCount(3, 'model')).toBe('3 models');
    });

    it('should handle file example from FileQueue', () => {
      expect(formatCount(1, 'file')).toBe('1 file');
      expect(formatCount(42, 'file')).toBe('42 files');
    });
  });

  describe('getAugmentButtonTooltip', () => {
    it('should return already augmented message when augmented', () => {
      const result = getAugmentButtonTooltip(true, false);
      expect(result).toBe('This note has already been augmented');
    });

    it('should prioritize augmented state over augmenting state', () => {
      const result = getAugmentButtonTooltip(true, true);
      expect(result).toBe('This note has already been augmented');
    });

    it('should return augmenting message when currently augmenting', () => {
      const result = getAugmentButtonTooltip(false, true);
      expect(result).toBe('Augmenting...');
    });

    it('should return default message when neither augmented nor augmenting', () => {
      const result = getAugmentButtonTooltip(false, false);
      expect(result).toBe('Augment this note with AI analysis');
    });
  });

  describe('getAugmentButtonLabel', () => {
    it('should return augmenting label when in progress', () => {
      const result = getAugmentButtonLabel(true);
      expect(result).toBe('🔄 Augmenting...');
    });

    it('should return default label when not augmenting', () => {
      const result = getAugmentButtonLabel(false);
      expect(result).toBe('🤖 Augment with AI');
    });
  });

});
