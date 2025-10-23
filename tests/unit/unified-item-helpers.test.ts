import { describe, it, expect } from 'vitest';
import {
  createNoteItem,
  createFileItem,
  fromFileItem,
  updateItemProgress,
  markItemComplete,
  markItemError,
  markNoteAugmented,
  mergeNotesAndFiles,
  filterByType,
  filterByStatus,
  getStatusCounts,
  type UnifiedItem,
} from '../../electron/utils/unified-item-helpers.js';
import type { NotePreview } from '../../electron/utils/note-helpers.js';
import type { FileItem } from '../../electron/utils/processing-scheduler.js';

describe('unified-item-helpers', () => {

  describe('createNoteItem', () => {
    it('should create a UnifiedItem from a NotePreview', () => {
      const note: NotePreview = {
        guid: 'note-123',
        title: 'Meeting Notes',
        created: 1699900000000,
        updated: 1699910000000,
        tags: ['meeting', 'work'],
        isAugmented: false,
      };

      const item = createNoteItem(note);

      expect(item).toEqual({
        id: 'note-123',
        type: 'note',
        title: 'Meeting Notes',
        status: 'idle',
        noteGuid: 'note-123',
        created: 1699900000000,
        updated: 1699910000000,
        tags: ['meeting', 'work'],
        isAugmented: false,
        augmentedDate: undefined,
        contentPreview: undefined,
      });
    });

    it('should handle augmented notes', () => {
      const note: NotePreview = {
        guid: 'note-456',
        title: 'Augmented Note',
        created: 1699900000000,
        updated: 1699910000000,
        tags: [],
        isAugmented: true,
        augmentedDate: '2024-11-15',
      };

      const item = createNoteItem(note);

      expect(item.isAugmented).toBe(true);
      expect(item.augmentedDate).toBe('2024-11-15');
    });

    it('should handle notes without title', () => {
      const note: NotePreview = {
        guid: 'note-789',
        title: '',
        created: 1699900000000,
        updated: 1699910000000,
        tags: [],
        isAugmented: false,
      };

      const item = createNoteItem(note);

      expect(item.title).toBe('Untitled Note');
    });
  });

  describe('createFileItem', () => {
    it('should create a UnifiedItem from a file path with default status', () => {
      const item = createFileItem('/path/to/document.pdf');

      expect(item).toEqual({
        id: '/path/to/document.pdf',
        type: 'file',
        title: 'document.pdf',
        status: 'idle',
        filePath: '/path/to/document.pdf',
        fileName: 'document.pdf',
        progress: undefined,
        statusMessage: undefined,
      });
    });

    it('should create processing file item with progress', () => {
      const item = createFileItem(
        '/path/to/invoice.pdf',
        'analyzing',
        45,
        'Analyzing with AI...'
      );

      expect(item.status).toBe('processing');
      expect(item.progress).toBe(45);
      expect(item.statusMessage).toBe('Analyzing with AI...');
    });

    it('should create completed file item', () => {
      const item = createFileItem('/path/to/done.pdf', 'complete', 100);

      expect(item.status).toBe('complete');
      expect(item.progress).toBeUndefined();
    });

    it('should create error file item', () => {
      const item = createFileItem('/path/to/failed.pdf', 'error');

      expect(item.status).toBe('error');
    });

    it('should extract filename from path', () => {
      const item = createFileItem('/Users/john/Documents/report.pdf');

      expect(item.fileName).toBe('report.pdf');
      expect(item.title).toBe('report.pdf');
    });
  });

  describe('fromFileItem', () => {
    it('should convert FileItem to UnifiedItem', () => {
      const fileItem: FileItem = {
        path: '/test/file.pdf',
        name: 'file.pdf',
        status: 'analyzing',
        progress: 60,
        message: 'Analyzing content...',
      };

      const item = fromFileItem(fileItem);

      expect(item.type).toBe('file');
      expect(item.status).toBe('processing');
      expect(item.progress).toBe(60);
      expect(item.statusMessage).toBe('Analyzing content...');
    });
  });

  describe('updateItemProgress', () => {
    it('should update progress immutably', () => {
      const original = createFileItem('/test.pdf');
      const updated = updateItemProgress(original, 75, 'Uploading...');

      expect(updated).not.toBe(original);
      expect(original.status).toBe('idle');
      expect(updated.status).toBe('processing');
      expect(updated.progress).toBe(75);
      expect(updated.statusMessage).toBe('Uploading...');
    });

    it('should update note item progress', () => {
      const note: NotePreview = {
        guid: 'note-1',
        title: 'Note',
        created: Date.now(),
        updated: Date.now(),
        tags: [],
        isAugmented: false,
      };
      const item = createNoteItem(note);
      const updated = updateItemProgress(item, 50, 'Augmenting note...');

      expect(updated.status).toBe('processing');
      expect(updated.progress).toBe(50);
    });
  });

  describe('markItemComplete', () => {
    it('should mark item as complete', () => {
      const item = createFileItem('/test.pdf', 'analyzing', 50);
      const completed = markItemComplete(item);

      expect(completed.status).toBe('complete');
      expect(completed.progress).toBe(100);
      expect(completed.statusMessage).toBeUndefined();
    });

    it('should mark complete with result data', () => {
      const item = createFileItem('/test.pdf');
      const completed = markItemComplete(item, {
        noteUrl: 'https://evernote.com/note/123',
        title: 'Analyzed Document'
      });

      expect(completed.noteUrl).toBe('https://evernote.com/note/123');
      expect(completed.title).toBe('Analyzed Document');
    });

    it('should preserve original title if no new title provided', () => {
      const item = createFileItem('/original.pdf');
      const completed = markItemComplete(item, { noteUrl: 'url' });

      expect(completed.title).toBe('original.pdf');
    });
  });

  describe('markItemError', () => {
    it('should mark item as error', () => {
      const item = createFileItem('/test.pdf', 'analyzing', 30);
      const errorItem = markItemError(item, 'File not found');

      expect(errorItem.status).toBe('error');
      expect(errorItem.error).toBe('File not found');
      expect(errorItem.progress).toBeUndefined();
      expect(errorItem.statusMessage).toBeUndefined();
    });
  });

  describe('markNoteAugmented', () => {
    it('should mark note as augmented', () => {
      const note: NotePreview = {
        guid: 'note-1',
        title: 'Note',
        created: Date.now(),
        updated: Date.now(),
        tags: [],
        isAugmented: false,
      };
      const item = createNoteItem(note);
      const augmented = markNoteAugmented(item, '2024-11-15');

      expect(augmented.isAugmented).toBe(true);
      expect(augmented.augmentedDate).toBe('2024-11-15');
      expect(augmented.status).toBe('idle');
    });

    it('should warn when trying to augment non-note item', () => {
      const fileItem = createFileItem('/test.pdf');
      const result = markNoteAugmented(fileItem, '2024-11-15');

      // Should return unchanged
      expect(result).toEqual(fileItem);
    });
  });

  describe('mergeNotesAndFiles', () => {
    it('should merge notes and files into unified list', () => {
      const notes: NotePreview[] = [
        {
          guid: 'note-1',
          title: 'Note 1',
          created: 1000,
          updated: 2000,
          tags: [],
          isAugmented: false,
        },
      ];

      const files: FileItem[] = [
        {
          path: '/file1.pdf',
          name: 'file1.pdf',
          status: 'analyzing',
          progress: 50,
          created: 1500,
        },
      ];

      const merged = mergeNotesAndFiles(notes, files);

      expect(merged.length).toBe(2);
      expect(merged[0].type).toBe('note'); // Idle note first
      expect(merged[1].type).toBe('file'); // Then processing file
    });

    it('should sort idle items first, then processing', () => {
      const notes: NotePreview[] = [
        { guid: 'n1', title: 'N1', created: 3000, updated: 3000, tags: [], isAugmented: false },
        { guid: 'n2', title: 'N2', created: 2000, updated: 2000, tags: [], isAugmented: false },
      ];

      const files: FileItem[] = [
        { path: '/f1.pdf', name: 'f1.pdf', status: 'pending', progress: 0, created: 4000 }, // Newest
        { path: '/f2.pdf', name: 'f2.pdf', status: 'analyzing', progress: 50, created: 2500 },
      ];

      const merged = mergeNotesAndFiles(notes, files);

      // Idle items (pending file + notes) should be first, sorted by date
      expect(merged[0].id).toBe('/f1.pdf'); // 4000 - newest idle
      expect(merged[0].status).toBe('idle');

      // Then newer note (also idle)
      expect(merged[1].id).toBe('n1'); // 3000
      expect(merged[1].status).toBe('idle');

      // Then older note (idle)
      expect(merged[2].id).toBe('n2'); // 2000
      expect(merged[2].status).toBe('idle');

      // Then processing file
      expect(merged[3].id).toBe('/f2.pdf');
      expect(merged[3].status).toBe('processing');
    });

    it('should handle empty arrays', () => {
      expect(mergeNotesAndFiles([], [])).toEqual([]);
      expect(mergeNotesAndFiles([], [{path: '/f.pdf', name: 'f.pdf', status: 'pending', progress: 0, created: Date.now()}]).length).toBe(1);
    });

    it('should sort by complete priority: idle > processing > error > complete', () => {
      const files: FileItem[] = [
        { path: '/complete.pdf', name: 'complete.pdf', status: 'complete', progress: 100, created: 1000 },
        { path: '/error.pdf', name: 'error.pdf', status: 'error', progress: 0, error: 'Failed', created: 2000 },
        { path: '/idle.pdf', name: 'idle.pdf', status: 'pending', progress: 0, created: 3000 },
        { path: '/processing.pdf', name: 'processing.pdf', status: 'analyzing', progress: 50, created: 4000 },
      ];

      const merged = mergeNotesAndFiles([], files);

      expect(merged[0].status).toBe('idle');
      expect(merged[1].status).toBe('processing');
      expect(merged[2].status).toBe('error');
      expect(merged[3].status).toBe('complete');
    });

    it('should sort by date within same status group (newest first)', () => {
      const notes: NotePreview[] = [
        { guid: 'n1', title: 'Old Note', created: 1000, updated: 1000, tags: [], isAugmented: false },
        { guid: 'n2', title: 'New Note', created: 3000, updated: 3000, tags: [], isAugmented: false },
        { guid: 'n3', title: 'Mid Note', created: 2000, updated: 2000, tags: [], isAugmented: false },
      ];

      const merged = mergeNotesAndFiles(notes, []);

      // All are idle status, should be sorted by date (newest first)
      expect(merged[0].id).toBe('n2'); // 3000
      expect(merged[1].id).toBe('n3'); // 2000
      expect(merged[2].id).toBe('n1'); // 1000
    });

    it('should handle newly dropped files appearing at top', () => {
      const notes: NotePreview[] = [
        { guid: 'n1', title: 'Existing Note', created: 2000, updated: 2000, tags: [], isAugmented: false },
      ];

      const files: FileItem[] = [
        { path: '/processing.pdf', name: 'processing.pdf', status: 'analyzing', progress: 50, created: 1500 },
        { path: '/newly-dropped.pdf', name: 'newly-dropped.pdf', status: 'pending', progress: 0, created: 3000 },
      ];

      const merged = mergeNotesAndFiles(notes, files);

      // Newly dropped (idle) should be first
      expect(merged[0].id).toBe('/newly-dropped.pdf');
      expect(merged[0].status).toBe('idle');
      // Then note (also idle, but older)
      expect(merged[1].id).toBe('n1');
      expect(merged[1].status).toBe('idle');
      // Then processing
      expect(merged[2].id).toBe('/processing.pdf');
      expect(merged[2].status).toBe('processing');
    });

    it('should handle mix of all statuses with multiple items per status', () => {
      const files: FileItem[] = [
        { path: '/complete1.pdf', name: 'complete1.pdf', status: 'complete', progress: 100, created: 1000 },
        { path: '/error1.pdf', name: 'error1.pdf', status: 'error', progress: 0, created: 2000 },
        { path: '/idle2.pdf', name: 'idle2.pdf', status: 'pending', progress: 0, created: 3000 },
        { path: '/processing2.pdf', name: 'processing2.pdf', status: 'analyzing', progress: 30, created: 4000 },
        { path: '/idle1.pdf', name: 'idle1.pdf', status: 'pending', progress: 0, created: 5000 },
        { path: '/processing1.pdf', name: 'processing1.pdf', status: 'extracting', progress: 80, created: 6000 },
      ];

      const merged = mergeNotesAndFiles([], files);

      // First 2 should be idle (pending)
      expect(merged[0].status).toBe('idle');
      expect(merged[1].status).toBe('idle');
      // Next 2 should be processing
      expect(merged[2].status).toBe('processing');
      expect(merged[3].status).toBe('processing');
      // Then error
      expect(merged[4].status).toBe('error');
      // Finally complete
      expect(merged[5].status).toBe('complete');
    });

    it('should prioritize newly dropped idle files over older processing files', () => {
      const files: FileItem[] = [
        { path: '/old-processing.pdf', name: 'old-processing.pdf', status: 'uploading', progress: 90, created: 1000 },
        { path: '/new-dropped.pdf', name: 'new-dropped.pdf', status: 'pending', progress: 0, created: 2000 },
      ];

      const merged = mergeNotesAndFiles([], files);

      // Idle should come before processing, even if processing started earlier
      expect(merged[0].id).toBe('/new-dropped.pdf');
      expect(merged[0].status).toBe('idle');
      expect(merged[1].id).toBe('/old-processing.pdf');
      expect(merged[1].status).toBe('processing');
    });

    it('should treat ready-to-upload files as idle (appear at top)', () => {
      const files: FileItem[] = [
        { path: '/processing.pdf', name: 'processing.pdf', status: 'analyzing', progress: 50, created: 4000 },
        { path: '/ready.pdf', name: 'ready.pdf', status: 'ready-to-upload', progress: 100, created: 3000 },
        { path: '/pending.pdf', name: 'pending.pdf', status: 'pending', progress: 0, created: 5000 },
        { path: '/complete.pdf', name: 'complete.pdf', status: 'complete', progress: 100, created: 2000 },
      ];

      const merged = mergeNotesAndFiles([], files);

      // Both pending and ready-to-upload should be idle (at top)
      expect(merged[0].id).toBe('/pending.pdf'); // 5000 - newest idle
      expect(merged[0].status).toBe('idle');
      expect(merged[1].id).toBe('/ready.pdf'); // 3000 - older idle
      expect(merged[1].status).toBe('idle');
      // Then processing
      expect(merged[2].id).toBe('/processing.pdf');
      expect(merged[2].status).toBe('processing');
      // Then complete
      expect(merged[3].id).toBe('/complete.pdf');
      expect(merged[3].status).toBe('complete');
    });
  });

  describe('filterByType', () => {
    const items: UnifiedItem[] = [
      createNoteItem({ guid: 'n1', title: 'Note', created: 1000, updated: 1000, tags: [], isAugmented: false }),
      createFileItem('/f1.pdf'),
    ];

    it('should filter by note type', () => {
      const notes = filterByType(items, 'note');
      expect(notes.length).toBe(1);
      expect(notes[0].type).toBe('note');
    });

    it('should filter by file type', () => {
      const files = filterByType(items, 'file');
      expect(files.length).toBe(1);
      expect(files[0].type).toBe('file');
    });
  });

  describe('filterByStatus', () => {
    const items: UnifiedItem[] = [
      createFileItem('/f1.pdf', 'pending'),
      createFileItem('/f2.pdf', 'analyzing', 50),
      createFileItem('/f3.pdf', 'complete'),
    ];

    it('should filter by idle status', () => {
      const idle = filterByStatus(items, 'idle');
      expect(idle.length).toBe(1);
    });

    it('should filter by processing status', () => {
      const processing = filterByStatus(items, 'processing');
      expect(processing.length).toBe(1);
    });

    it('should filter by complete status', () => {
      const complete = filterByStatus(items, 'complete');
      expect(complete.length).toBe(1);
    });
  });

  describe('getStatusCounts', () => {
    it('should return counts for each status', () => {
      const items: UnifiedItem[] = [
        createFileItem('/f1.pdf', 'pending'),
        createFileItem('/f2.pdf', 'analyzing', 50),
        createFileItem('/f3.pdf', 'complete'),
        createFileItem('/f4.pdf', 'error'),
        createFileItem('/f5.pdf', 'analyzing', 75),
      ];

      const counts = getStatusCounts(items);

      expect(counts).toEqual({
        idle: 1,
        processing: 2,
        complete: 1,
        error: 1,
      });
    });

    it('should handle empty array', () => {
      const counts = getStatusCounts([]);

      expect(counts).toEqual({
        idle: 0,
        processing: 0,
        complete: 0,
        error: 0,
      });
    });
  });

});
