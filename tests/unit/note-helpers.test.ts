import { describe, it, expect } from 'vitest';
import {
  isNoteAugmented,
  getAugmentationDate,
  transformNoteMetadata,
  mergeNoteAttributes,
  type NoteMetadata
} from '../../electron/utils/note-helpers.js';

describe('note-helpers', () => {

  describe('isNoteAugmented', () => {
    it('should return true when note is augmented', () => {
      const attributes = {
        applicationData: {
          aiAugmented: 'true',
          aiAugmentedDate: '2025-10-22'
        }
      };
      expect(isNoteAugmented(attributes)).toBe(true);
    });

    it('should return false when note is not augmented', () => {
      const attributes = {
        applicationData: {
          aiAugmented: 'false'
        }
      };
      expect(isNoteAugmented(attributes)).toBe(false);
    });

    it('should return false when applicationData is missing', () => {
      const attributes = {};
      expect(isNoteAugmented(attributes)).toBe(false);
    });

    it('should return false when attributes are undefined', () => {
      expect(isNoteAugmented(undefined)).toBe(false);
    });

    it('should return false when aiAugmented is missing', () => {
      const attributes = {
        applicationData: {
          otherKey: 'value'
        }
      };
      expect(isNoteAugmented(attributes)).toBe(false);
    });

    it('should return false when aiAugmented is an empty string', () => {
      const attributes = {
        applicationData: {
          aiAugmented: ''
        }
      };
      expect(isNoteAugmented(attributes)).toBe(false);
    });
  });

  describe('getAugmentationDate', () => {
    it('should return augmentation date when present', () => {
      const attributes = {
        applicationData: {
          aiAugmented: 'true',
          aiAugmentedDate: '2025-10-22T15:30:00.000Z'
        }
      };
      expect(getAugmentationDate(attributes)).toBe('2025-10-22T15:30:00.000Z');
    });

    it('should return undefined when date is missing', () => {
      const attributes = {
        applicationData: {
          aiAugmented: 'true'
        }
      };
      expect(getAugmentationDate(attributes)).toBeUndefined();
    });

    it('should return undefined when applicationData is missing', () => {
      const attributes = {};
      expect(getAugmentationDate(attributes)).toBeUndefined();
    });

    it('should return undefined when attributes are undefined', () => {
      expect(getAugmentationDate(undefined)).toBeUndefined();
    });
  });

  describe('transformNoteMetadata', () => {
    it('should transform complete note metadata', () => {
      const metadata: NoteMetadata[] = [{
        guid: 'note-123',
        title: 'Test Note',
        created: 1700000000000,
        updated: 1700000001000,
        tagGuids: ['tag1', 'tag2'],
        attributes: {
          applicationData: {
            aiAugmented: 'true',
            aiAugmentedDate: '2025-10-22'
          }
        }
      }];

      const result = transformNoteMetadata(metadata);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        guid: 'note-123',
        title: 'Test Note',
        contentPreview: '',
        created: 1700000000000,
        updated: 1700000001000,
        tags: [],
        isAugmented: true,
        augmentedDate: '2025-10-22'
      });
    });

    it('should apply default title for untitled notes', () => {
      const metadata: NoteMetadata[] = [{
        guid: 'note-123'
      }];

      const result = transformNoteMetadata(metadata);

      expect(result[0]!.title).toBe('Untitled');
    });

    it('should apply current timestamp for missing dates', () => {
      const beforeTime = Date.now();
      const metadata: NoteMetadata[] = [{
        guid: 'note-123'
      }];

      const result = transformNoteMetadata(metadata);
      const afterTime = Date.now();

      expect(result[0]!.created).toBeGreaterThanOrEqual(beforeTime);
      expect(result[0]!.created).toBeLessThanOrEqual(afterTime);
      expect(result[0]!.updated).toBeGreaterThanOrEqual(beforeTime);
      expect(result[0]!.updated).toBeLessThanOrEqual(afterTime);
    });

    it('should handle empty guid', () => {
      const metadata: NoteMetadata[] = [{
        title: 'Test Note'
      }];

      const result = transformNoteMetadata(metadata);

      expect(result[0]!.guid).toBe('');
    });

    it('should handle empty metadata array', () => {
      const result = transformNoteMetadata([]);

      expect(result).toHaveLength(0);
    });

    it('should handle multiple notes', () => {
      const metadata: NoteMetadata[] = [
        { guid: 'note-1', title: 'Note 1' },
        { guid: 'note-2', title: 'Note 2' },
        { guid: 'note-3', title: 'Note 3' }
      ];

      const result = transformNoteMetadata(metadata);

      expect(result).toHaveLength(3);
      expect(result[0]!.guid).toBe('note-1');
      expect(result[1]!.guid).toBe('note-2');
      expect(result[2]!.guid).toBe('note-3');
    });

    it('should detect non-augmented notes', () => {
      const metadata: NoteMetadata[] = [{
        guid: 'note-123',
        title: 'Test Note'
      }];

      const result = transformNoteMetadata(metadata);

      expect(result[0]!.isAugmented).toBe(false);
      expect(result[0]!.augmentedDate).toBeUndefined();
    });

    it('should always set empty contentPreview', () => {
      const metadata: NoteMetadata[] = [{
        guid: 'note-123',
        title: 'Test Note'
      }];

      const result = transformNoteMetadata(metadata);

      expect(result[0]!.contentPreview).toBe('');
    });

    it('should always set empty tags array', () => {
      const metadata: NoteMetadata[] = [{
        guid: 'note-123',
        tagGuids: ['tag1', 'tag2', 'tag3']
      }];

      const result = transformNoteMetadata(metadata);

      expect(result[0]!.tags).toEqual([]);
    });
  });

  describe('mergeNoteAttributes', () => {
    it('should merge top-level attributes', () => {
      const existing = {
        source: 'mobile',
        author: 'user@example.com'
      };

      const updates = {
        reminderOrder: 1
      };

      const result = mergeNoteAttributes(existing, updates);

      expect(result).toEqual({
        source: 'mobile',
        author: 'user@example.com',
        reminderOrder: 1
      });
    });

    it('should merge nested applicationData', () => {
      const existing = {
        applicationData: {
          version: '1.0',
          customKey: 'value'
        }
      };

      const updates = {
        applicationData: {
          aiAugmented: 'true',
          aiAugmentedDate: '2025-10-22'
        }
      };

      const result = mergeNoteAttributes(existing, updates);

      expect(result.applicationData).toEqual({
        version: '1.0',
        customKey: 'value',
        aiAugmented: 'true',
        aiAugmentedDate: '2025-10-22'
      });
    });

    it('should override existing top-level attributes', () => {
      const existing = {
        source: 'mobile',
        reminderOrder: 1
      };

      const updates = {
        reminderOrder: 2
      };

      const result = mergeNoteAttributes(existing, updates);

      expect(result.reminderOrder).toBe(2);
    });

    it('should handle null existing attributes', () => {
      const updates = {
        applicationData: {
          aiAugmented: 'true'
        }
      };

      const result = mergeNoteAttributes(null, updates);

      expect(result.applicationData).toEqual({
        aiAugmented: 'true'
      });
    });

    it('should handle undefined existing attributes', () => {
      const updates = {
        source: 'web'
      };

      const result = mergeNoteAttributes(undefined, updates);

      expect(result.source).toBe('web');
    });

    it('should handle empty existing attributes', () => {
      const existing = {};

      const updates = {
        applicationData: {
          aiAugmented: 'true'
        }
      };

      const result = mergeNoteAttributes(existing, updates);

      expect(result.applicationData).toEqual({
        aiAugmented: 'true'
      });
    });

    it('should create applicationData when missing in existing', () => {
      const existing = {
        source: 'mobile'
      };

      const updates = {
        applicationData: {
          aiAugmented: 'true'
        }
      };

      const result = mergeNoteAttributes(existing, updates);

      expect(result).toEqual({
        source: 'mobile',
        applicationData: {
          aiAugmented: 'true'
        }
      });
    });

    it('should handle updates without applicationData', () => {
      const existing = {
        applicationData: {
          version: '1.0'
        }
      };

      const updates = {
        source: 'web'
      };

      const result = mergeNoteAttributes(existing, updates);

      expect(result).toEqual({
        applicationData: {
          version: '1.0'
        },
        source: 'web'
      });
    });

    it('should not mutate original objects', () => {
      const existing = {
        source: 'mobile',
        applicationData: {
          version: '1.0'
        }
      };

      const updates = {
        applicationData: {
          aiAugmented: 'true'
        }
      };

      const existingCopy = JSON.parse(JSON.stringify(existing));
      const updatesCopy = JSON.parse(JSON.stringify(updates));

      mergeNoteAttributes(existing, updates);

      // Original objects should not be modified
      expect(existing).toEqual(existingCopy);
      expect(updates).toEqual(updatesCopy);
    });

    it('should handle complex nested merge scenario', () => {
      const existing = {
        source: 'mobile',
        author: 'user@example.com',
        applicationData: {
          version: '1.0',
          feature1: 'enabled',
          metadata: {
            key: 'value'
          }
        }
      };

      const updates = {
        reminderOrder: 1,
        applicationData: {
          aiAugmented: 'true',
          aiAugmentedDate: '2025-10-22',
          feature1: 'disabled' // Override existing
        }
      };

      const result = mergeNoteAttributes(existing, updates);

      expect(result).toEqual({
        source: 'mobile',
        author: 'user@example.com',
        reminderOrder: 1,
        applicationData: {
          version: '1.0',
          feature1: 'disabled', // Updated
          metadata: {
            key: 'value'
          },
          aiAugmented: 'true',
          aiAugmentedDate: '2025-10-22'
        }
      });
    });
  });

});
