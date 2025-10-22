/**
 * Pure mapper functions to convert database records to UI file items
 * These are pure functions with no side effects for easy testing
 */

import type { FileRecord } from '../database/queue-db.js';
import type { FileItem } from './processing-scheduler.js';

/**
 * Parse tags from JSON string (safe with error handling)
 * Pure function
 */
export function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];

  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Extract filename from full path (works in both Node.js and browser)
 * Pure function
 */
export function extractFileName(filePath: string): string {
  // Handle both Unix (/) and Windows (\) path separators
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || filePath;
}

/**
 * Convert database FileRecord to UI FileItem
 * Pure function - no side effects
 */
export function mapDbRecordToFileItem(record: FileRecord): FileItem {
  const tags = parseTags(record.tags);

  const fileItem: FileItem = {
    path: record.file_path,
    name: extractFileName(record.file_path),
    status: record.status,
    progress: record.progress,
  };

  // Add optional message based on status
  if (record.error_message) {
    fileItem.error = record.error_message;
    fileItem.message = record.error_message;
  }

  // Add result if we have analysis data
  if (record.title || record.description || tags.length > 0) {
    fileItem.result = {
      title: record.title || '',
      description: record.description || '',
      tags: tags,
      noteUrl: record.note_url || undefined,
    };
  }

  return fileItem;
}

/**
 * Convert array of database FileRecords to UI FileItems
 * Pure function - no side effects
 */
export function mapDbRecordsToFileItems(records: FileRecord[]): FileItem[] {
  return records.map(mapDbRecordToFileItem);
}
