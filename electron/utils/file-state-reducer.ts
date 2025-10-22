/**
 * Pure state reducer functions for file processing
 * All functions are pure - no side effects, easily testable
 */

import type { FileItem, FileStatus } from './processing-scheduler.js';

export interface FileProgressData {
  filePath: string;
  status: FileStatus;
  progress: number;
  message?: string;
  error?: string;
  jsonPath?: string;
  result?: {
    title?: string;
    description?: string;
    tags?: string[];
    noteUrl?: string;
  };
}

/**
 * Pure function: Update file list based on IPC progress message
 * @param files - Current file list
 * @param message - IPC progress message
 * @returns New file list with updated file (immutable)
 */
export function updateFileFromIPCMessage(
  files: FileItem[],
  message: FileProgressData
): FileItem[] {
  const fileIndex = files.findIndex(f => f.path === message.filePath);

  if (fileIndex === -1) {
    // File not found - return unchanged
    return files;
  }

  return files.map((file, index) => {
    if (index !== fileIndex) {
      return file;
    }

    // Update file with new status and data
    const updated: FileItem = {
      ...file,
      status: message.status,
      progress: message.progress,
      message: message.message
    };

    // Merge result data (keep existing data if not provided)
    if (message.result) {
      updated.result = {
        ...file.result,
        ...message.result
      } as typeof file.result;
    }

    if (message.error) {
      updated.error = message.error;
    }

    if (message.jsonPath) {
      updated.jsonPath = message.jsonPath;
    }

    return updated;
  });
}

/**
 * Pure function: Add new files to the list
 * @param files - Current file list
 * @param newFilePaths - Paths of files to add
 * @returns New file list with added files
 */
export function addFiles(
  files: FileItem[],
  newFilePaths: string[]
): FileItem[] {
  const newFiles: FileItem[] = newFilePaths.map(filePath => ({
    path: filePath,
    name: filePath.split('/').pop() || filePath,
    status: 'pending',
    progress: 0
  }));

  return [...files, ...newFiles];
}

/**
 * Pure function: Remove completed files from the list
 * @param files - Current file list
 * @returns New file list without completed files
 */
export function removeCompletedFiles(files: FileItem[]): FileItem[] {
  return files.filter(f => f.status !== 'complete');
}

/**
 * Pure function: Clear all files
 * @returns Empty file list
 */
export function clearAllFiles(): FileItem[] {
  return [];
}

/**
 * Pure function: Update a specific file's status (fallback for when IPC fails)
 * @param files - Current file list
 * @param filePath - Path of file to update
 * @param status - New status
 * @param error - Optional error message
 * @returns New file list with updated file
 */
export function updateFileStatus(
  files: FileItem[],
  filePath: string,
  status: FileStatus,
  error?: string
): FileItem[] {
  return files.map(file =>
    file.path === filePath
      ? { ...file, status, error }
      : file
  );
}
