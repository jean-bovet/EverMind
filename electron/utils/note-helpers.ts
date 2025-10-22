/**
 * Note Helpers
 * Utilities for working with Evernote notes and metadata
 */

export interface NoteMetadata {
  guid?: string;
  title?: string;
  created?: number;
  updated?: number;
  tagGuids?: string[];
  attributes?: {
    applicationData?: Record<string, string>;
  };
}

export interface NotePreview {
  guid: string;
  title: string;
  contentPreview: string;
  created: number;
  updated: number;
  tags: string[];
  isAugmented: boolean;
  augmentedDate?: string;
}

/**
 * Check if note is augmented based on attributes
 * @param attributes - Note attributes object
 * @returns true if note has been augmented with AI
 */
export function isNoteAugmented(
  attributes?: { applicationData?: Record<string, string> }
): boolean {
  return attributes?.applicationData?.['aiAugmented'] === 'true';
}

/**
 * Extract augmentation date from note attributes
 * @param attributes - Note attributes object
 * @returns ISO date string if augmented, undefined otherwise
 */
export function getAugmentationDate(
  attributes?: { applicationData?: Record<string, string> }
): string | undefined {
  return attributes?.applicationData?.['aiAugmentedDate'];
}

/**
 * Transform NoteMetadata array to NotePreview array
 * Applies defaults for missing fields and extracts augmentation status
 *
 * @param metadata - Array of note metadata from Evernote API
 * @returns Array of note previews ready for UI display
 */
export function transformNoteMetadata(
  metadata: NoteMetadata[]
): NotePreview[] {
  return metadata.map((meta) => {
    return {
      guid: meta.guid || '',
      title: meta.title || 'Untitled',
      contentPreview: '', // Content preview skipped to avoid rate limits
      created: meta.created || Date.now(),
      updated: meta.updated || Date.now(),
      tags: [], // TODO: Resolve tag names from tagGuids
      isAugmented: isNoteAugmented(meta.attributes),
      augmentedDate: getAugmentationDate(meta.attributes)
    };
  });
}

/**
 * Merge note attributes, handling nested applicationData correctly
 * Preserves existing attributes while applying updates
 *
 * @param existing - Existing note attributes (may be null/undefined)
 * @param updates - Partial attributes to merge
 * @returns Merged attributes object
 *
 * @example
 * const existing = { source: 'mobile', applicationData: { version: '1.0' } };
 * const updates = { applicationData: { aiAugmented: 'true' } };
 * mergeNoteAttributes(existing, updates);
 * // => { source: 'mobile', applicationData: { version: '1.0', aiAugmented: 'true' } }
 */
export function mergeNoteAttributes(
  existing: any,
  updates: any
): any {
  // Handle null/undefined existing
  const existingAttributes = existing || {};

  // Merge top-level attributes
  const merged = {
    ...existingAttributes,
    ...updates
  };

  // Special handling for applicationData - merge nested object
  if (updates.applicationData) {
    merged.applicationData = {
      ...(existingAttributes.applicationData || {}),
      ...updates.applicationData
    };
  }

  return merged;
}
