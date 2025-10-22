/**
 * File Helpers
 * Utilities for working with file items and file operations
 */

import type { FileStatus, FileItem } from './processing-scheduler.js';

/**
 * Get display label for file status
 * Maps status enum to user-friendly emoji + text
 *
 * @param status - File processing status
 * @returns Display label with emoji
 *
 * @example
 * getFileStatusLabel('pending') // => '⏳ Pending'
 * getFileStatusLabel('complete') // => '✅ Complete'
 */
export function getFileStatusLabel(status: FileStatus): string {
  const labels: Record<FileStatus, string> = {
    'pending': '⏳ Pending',
    'extracting': '📄 Extracting...',
    'analyzing': '🤖 Analyzing...',
    'ready-to-upload': '⏸️ Ready to upload',
    'uploading': '⬆️ Uploading...',
    'rate-limited': '⏱️ Rate limited',
    'retrying': '🔄 Retrying',
    'complete': '✅ Complete',
    'error': '❌ Error'
  };

  return labels[status];
}

/**
 * Count files by status
 * @param files - Array of file items
 * @param status - Status to count
 * @returns Number of files with the given status
 *
 * @example
 * countFilesByStatus(files, 'complete') // => 5
 */
export function countFilesByStatus(
  files: FileItem[],
  status: FileStatus
): number {
  return files.filter(f => f.status === status).length;
}

/**
 * Check if file status should show progress bar
 * Progress bars are shown for active processing states
 *
 * @param status - File status
 * @returns true if progress bar should be displayed
 *
 * @example
 * shouldShowProgressBar('analyzing') // => true
 * shouldShowProgressBar('complete') // => false
 */
export function shouldShowProgressBar(status: FileStatus): boolean {
  const activeStatuses: FileStatus[] = ['extracting', 'analyzing', 'uploading'];
  return activeStatuses.includes(status);
}

/**
 * Extract file paths from File objects
 * Safely handles errors and filters out invalid paths
 *
 * @param files - Array of File objects from drag event
 * @param getPathFn - Function to get path from file
 * @returns Array of valid file paths
 *
 * @example
 * const paths = extractFilePaths(files, (file) => file.path);
 * // => ['/path/to/file1.pdf', '/path/to/file2.pdf']
 */
export function extractFilePaths(
  files: File[],
  getPathFn: (file: File) => string
): string[] {
  return files
    .map(file => {
      try {
        return getPathFn(file);
      } catch (error) {
        console.error('Error getting file path:', error);
        return '';
      }
    })
    .filter(path => path !== '');
}

/**
 * Check if file is in a terminal state (complete or error)
 * @param status - File status
 * @returns true if file is in terminal state
 *
 * @example
 * isTerminalStatus('complete') // => true
 * isTerminalStatus('uploading') // => false
 */
export function isTerminalStatus(status: FileStatus): boolean {
  return status === 'complete' || status === 'error';
}

/**
 * Check if file is actively processing
 * @param status - File status
 * @returns true if file is being processed
 *
 * @example
 * isProcessing('analyzing') // => true
 * isProcessing('pending') // => false
 */
export function isProcessing(status: FileStatus): boolean {
  const processingStatuses: FileStatus[] = ['extracting', 'analyzing', 'uploading', 'retrying'];
  return processingStatuses.includes(status);
}
