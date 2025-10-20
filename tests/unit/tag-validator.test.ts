import { describe, it, expect } from 'vitest';
import {
  isValidTagName,
  sanitizeTag,
  filterExistingTags,
  sanitizeTags,
  validateTagsForAPI,
} from '../../src/tag-validator.js';

describe('tag-validator', () => {
  describe('isValidTagName', () => {
    it('should accept valid tag names', () => {
      expect(isValidTagName('valid-tag')).toBe(true);
      expect(isValidTagName('Tag123')).toBe(true);
      expect(isValidTagName('a')).toBe(true);
      expect(isValidTagName('Tag with spaces')).toBe(true);
    });

    it('should reject empty or whitespace-only tags', () => {
      expect(isValidTagName('')).toBe(false);
      expect(isValidTagName('   ')).toBe(false);
    });

    it('should reject tags with leading/trailing whitespace', () => {
      expect(isValidTagName(' leading')).toBe(false);
      expect(isValidTagName('trailing ')).toBe(false);
      expect(isValidTagName(' both ')).toBe(false);
    });

    it('should reject tags with commas', () => {
      expect(isValidTagName('tag,with,commas')).toBe(false);
      expect(isValidTagName('tag, with, commas')).toBe(false);
    });

    it('should reject tags that are too long (>100 chars)', () => {
      const longTag = 'a'.repeat(101);
      expect(isValidTagName(longTag)).toBe(false);
    });

    it('should accept tags exactly 100 chars', () => {
      const maxLengthTag = 'a'.repeat(100);
      expect(isValidTagName(maxLengthTag)).toBe(true);
    });

    it('should reject tags with control characters', () => {
      expect(isValidTagName('tag\nwith\nnewline')).toBe(false);
      expect(isValidTagName('tag\twith\ttab')).toBe(false);
      expect(isValidTagName('tag\u0000null')).toBe(false);
    });

    it('should reject tags with line/paragraph separators', () => {
      expect(isValidTagName('tag\u2028line')).toBe(false);
      expect(isValidTagName('tag\u2029paragraph')).toBe(false);
    });

    it('should reject non-string inputs', () => {
      expect(isValidTagName(null as any)).toBe(false);
      expect(isValidTagName(undefined as any)).toBe(false);
      expect(isValidTagName(123 as any)).toBe(false);
    });
  });

  describe('sanitizeTag', () => {
    it('should trim whitespace', () => {
      expect(sanitizeTag(' tag ')).toBe('tag');
      expect(sanitizeTag('  tag  ')).toBe('tag');
    });

    it('should remove commas', () => {
      expect(sanitizeTag('tag,with,commas')).toBe('tagwithcommas');
      expect(sanitizeTag('tag, with, commas')).toBe('tag with commas');
    });

    it('should remove control characters', () => {
      expect(sanitizeTag('tag\nwith\nnewline')).toBe('tagwithnewline');
      expect(sanitizeTag('tag\twith\ttab')).toBe('tagwithtab');
    });

    it('should return null for empty results', () => {
      expect(sanitizeTag('')).toBe(null);
      expect(sanitizeTag('   ')).toBe(null);
      expect(sanitizeTag(',,,,')).toBe(null);
    });

    it('should return null for tags that are too long', () => {
      const longTag = 'a'.repeat(101);
      expect(sanitizeTag(longTag)).toBe(null);
    });

    it('should return null for non-string inputs', () => {
      expect(sanitizeTag(null as any)).toBe(null);
      expect(sanitizeTag(undefined as any)).toBe(null);
    });

    it('should handle complex cases', () => {
      expect(sanitizeTag(' tag, with, issues\n')).toBe('tag with issues');
      expect(sanitizeTag('\ttag\t')).toBe('tag');
    });
  });

  describe('filterExistingTags', () => {
    const existingTags = ['Finance', 'Work', 'Personal', 'Travel', 'Receipt'];

    it('should return valid tags that exist in Evernote', () => {
      const result = filterExistingTags(['Finance', 'Work'], existingTags);
      expect(result.valid).toEqual(['Finance', 'Work']);
      expect(result.rejected).toHaveLength(0);
    });

    it('should match tags case-insensitively', () => {
      const result = filterExistingTags(['finance', 'WORK', 'PeRsOnAl'], existingTags);
      expect(result.valid).toEqual(['Finance', 'Work', 'Personal']);
      expect(result.rejected).toHaveLength(0);
    });

    it('should reject tags that do not exist in Evernote', () => {
      const result = filterExistingTags(['NewTag', 'AnotherNew'], existingTags);
      expect(result.valid).toHaveLength(0);
      expect(result.rejected).toHaveLength(2);
      expect(result.rejected[0].reason).toBe('Tag does not exist in Evernote');
    });

    it('should sanitize tags before matching', () => {
      const result = filterExistingTags([' Finance ', 'work,'], existingTags);
      expect(result.valid).toEqual(['Finance', 'Work']);
    });

    it('should reject invalid tags with appropriate reasons', () => {
      const result = filterExistingTags(['', '   ', ',,,'], existingTags);
      expect(result.valid).toHaveLength(0);
      expect(result.rejected).toHaveLength(3);
      result.rejected.forEach(r => {
        expect(r.reason).toContain('Invalid format');
      });
    });

    it('should handle mixed valid and invalid tags', () => {
      const result = filterExistingTags(
        ['Finance', 'InvalidTag', ' Work ', '', 'NewTag'],
        existingTags
      );
      expect(result.valid).toEqual(['Finance', 'Work']);
      expect(result.rejected).toHaveLength(3);
    });

    it('should return exact case from Evernote', () => {
      const result = filterExistingTags(['FINANCE', 'work'], existingTags);
      expect(result.valid).toEqual(['Finance', 'Work']);
    });
  });

  describe('sanitizeTags', () => {
    it('should sanitize all tags in array', () => {
      const result = sanitizeTags([' tag1 ', 'tag2,', '\ttag3\n']);
      expect(result).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should remove duplicates', () => {
      const result = sanitizeTags(['tag1', 'tag1', 'TAG1']);
      expect(result).toEqual(['tag1', 'TAG1']);
    });

    it('should filter out invalid tags', () => {
      const result = sanitizeTags(['valid', '', '   ', 'also-valid']);
      expect(result).toEqual(['valid', 'also-valid']);
    });

    it('should handle empty array', () => {
      const result = sanitizeTags([]);
      expect(result).toEqual([]);
    });
  });

  describe('validateTagsForAPI', () => {
    it('should filter out invalid tags before API call', () => {
      const tags = ['valid', ' invalid ', '', 'also-valid', 'tag,with,comma'];
      const result = validateTagsForAPI(tags);
      expect(result).toEqual(['valid', 'also-valid']);
    });

    it('should return empty array for all invalid tags', () => {
      const tags = ['', '   ', ',,,', ' bad '];
      const result = validateTagsForAPI(tags);
      expect(result).toEqual([]);
    });

    it('should pass through all valid tags', () => {
      const tags = ['tag1', 'tag2', 'tag3'];
      const result = validateTagsForAPI(tags);
      expect(result).toEqual(tags);
    });
  });
});
