/**
 * Unified Item Helpers
 *
 * Provides a unified data model for both:
 * - Files being processed (OCR, AI analysis, upload)
 * - Existing notes from Evernote (can be augmented)
 *
 * This enables a single list view showing both types of items
 * with consistent state management.
 */

import type { FileItem, FileStatus } from './processing-scheduler.js';
import type { NotePreview } from './note-helpers.js';

export type UnifiedItemType = 'note' | 'file';
export type ItemStatus = 'idle' | 'processing' | 'complete' | 'error';

export interface UnifiedItem {
  // Common identification
  id: string;                    // noteGuid or filePath
  type: UnifiedItemType;         // 'note' or 'file'
  title: string;
  status: ItemStatus;

  // Processing state (when status='processing')
  progress?: number;             // 0-100
  statusMessage?: string;        // "Analyzing with AI...", "Uploading..."

  // Note-specific fields (type='note')
  noteGuid?: string;
  created?: number;              // timestamp
  updated?: number;              // timestamp
  tags?: string[];
  isAugmented?: boolean;
  augmentedDate?: string;
  contentPreview?: string;

  // File-specific fields (type='file')
  filePath?: string;
  fileName?: string;

  // Error handling
  error?: string;

  // Result data (after completion)
  noteUrl?: string;
}

/**
 * Create a UnifiedItem from a NotePreview (Evernote note)
 */
export function createNoteItem(note: NotePreview): UnifiedItem {
  return {
    id: note.guid,
    type: 'note',
    title: note.title || 'Untitled Note',
    status: 'idle',
    noteGuid: note.guid,
    created: note.created,
    updated: note.updated,
    tags: note.tags || [],
    isAugmented: note.isAugmented,
    augmentedDate: note.augmentedDate,
    contentPreview: note.contentPreview,
  };
}

/**
 * Create a UnifiedItem from a file path (new file being processed)
 */
export function createFileItem(
  filePath: string,
  status: FileStatus = 'pending',
  progress: number = 0,
  message?: string
): UnifiedItem {
  const fileName = filePath.split('/').pop() || filePath;

  // Map FileStatus to ItemStatus
  const itemStatus: ItemStatus =
    status === 'pending' ? 'idle' :
    status === 'complete' ? 'complete' :
    status === 'error' ? 'error' :
    'processing';

  return {
    id: filePath,
    type: 'file',
    title: fileName,
    status: itemStatus,
    filePath,
    fileName,
    progress: itemStatus === 'processing' ? progress : undefined,
    statusMessage: itemStatus === 'processing' ? message : undefined,
  };
}

/**
 * Create a UnifiedItem from a FileItem (from processing queue)
 */
export function fromFileItem(fileItem: FileItem): UnifiedItem {
  return createFileItem(
    fileItem.path,
    fileItem.status,
    fileItem.progress,
    fileItem.message
  );
}

/**
 * Update item progress (immutable)
 */
export function updateItemProgress(
  item: UnifiedItem,
  progress: number,
  message?: string
): UnifiedItem {
  return {
    ...item,
    status: 'processing',
    progress,
    statusMessage: message,
  };
}

/**
 * Mark item as complete (immutable)
 */
export function markItemComplete(
  item: UnifiedItem,
  result?: { noteUrl?: string; title?: string }
): UnifiedItem {
  return {
    ...item,
    status: 'complete',
    progress: 100,
    statusMessage: undefined,
    noteUrl: result?.noteUrl,
    title: result?.title || item.title,
  };
}

/**
 * Mark item as error (immutable)
 */
export function markItemError(
  item: UnifiedItem,
  error: string
): UnifiedItem {
  return {
    ...item,
    status: 'error',
    progress: undefined,
    statusMessage: undefined,
    error,
  };
}

/**
 * Update note augmentation status (immutable)
 */
export function markNoteAugmented(
  item: UnifiedItem,
  augmentedDate: string
): UnifiedItem {
  if (item.type !== 'note') {
    console.warn('Cannot mark non-note item as augmented');
    return item;
  }

  return {
    ...item,
    isAugmented: true,
    augmentedDate,
    status: 'idle', // Return to idle state after augmentation
    progress: undefined,
    statusMessage: undefined,
  };
}

/**
 * Merge notes and files into a unified list
 * Processing items appear first, then idle items by date
 */
export function mergeNotesAndFiles(
  notes: NotePreview[],
  files: FileItem[]
): UnifiedItem[] {
  const noteItems = notes.map(createNoteItem);
  const fileItems = files.map(fromFileItem);

  const allItems = [...fileItems, ...noteItems];

  // Sort: processing first, then by date (newest first)
  return allItems.sort((a, b) => {
    // Processing items always come first
    if (a.status === 'processing' && b.status !== 'processing') return -1;
    if (a.status !== 'processing' && b.status === 'processing') return 1;

    // Error items come after processing
    if (a.status === 'error' && b.status === 'idle') return -1;
    if (a.status === 'idle' && b.status === 'error') return 1;

    // Within same status, sort by date (newest first)
    const aDate = a.updated || a.created || 0;
    const bDate = b.updated || b.created || 0;
    return bDate - aDate;
  });
}

/**
 * Filter items by type
 */
export function filterByType(
  items: UnifiedItem[],
  type: UnifiedItemType
): UnifiedItem[] {
  return items.filter(item => item.type === type);
}

/**
 * Filter items by status
 */
export function filterByStatus(
  items: UnifiedItem[],
  status: ItemStatus
): UnifiedItem[] {
  return items.filter(item => item.status === status);
}

/**
 * Get counts by status
 */
export function getStatusCounts(items: UnifiedItem[]): Record<ItemStatus, number> {
  return {
    idle: items.filter(i => i.status === 'idle').length,
    processing: items.filter(i => i.status === 'processing').length,
    complete: items.filter(i => i.status === 'complete').length,
    error: items.filter(i => i.status === 'error').length,
  };
}
