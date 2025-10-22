/**
 * Pure concurrency scheduler for file processing
 * No side effects - easily testable
 */

export type FileStatus =
  | 'pending'
  | 'extracting'
  | 'analyzing'
  | 'ready-to-upload'
  | 'uploading'
  | 'rate-limited'
  | 'retrying'
  | 'complete'
  | 'error';

export interface FileItem {
  path: string;
  name: string;
  status: FileStatus;
  progress: number;
  message?: string;
  jsonPath?: string;
  result?: {
    title: string;
    description: string;
    tags: string[];
    noteUrl?: string;
  };
  error?: string;
}

/**
 * Manages concurrent file processing scheduling
 * Pure class - all methods are pure functions
 */
export class ProcessingScheduler {
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Pure function: Given current file list, returns which files should start processing
   * @param files - Current list of all files
   * @returns Files that should be started (not exceeding concurrency limit)
   */
  getFilesToProcess(files: FileItem[]): FileItem[] {
    const pending = files.filter(f => f.status === 'pending');
    const processing = files.filter(f =>
      f.status === 'extracting' || f.status === 'analyzing'
    );

    const available = this.maxConcurrent - processing.length;
    const slots = Math.max(0, available);

    return pending.slice(0, slots);
  }

  /**
   * Pure function: Determines if we should check for more files to process
   * @param files - Current list of all files
   * @returns true if there are pending files and available processing slots
   */
  shouldProcessMore(files: FileItem[]): boolean {
    const pending = files.filter(f => f.status === 'pending');
    const processing = files.filter(f =>
      f.status === 'extracting' || f.status === 'analyzing'
    );

    return pending.length > 0 && processing.length < this.maxConcurrent;
  }

  /**
   * Pure function: Get current processing statistics
   * @param files - Current list of all files
   */
  getStats(files: FileItem[]): {
    total: number;
    pending: number;
    processing: number;
    readyToUpload: number;
    uploading: number;
    complete: number;
    error: number;
  } {
    return {
      total: files.length,
      pending: files.filter(f => f.status === 'pending').length,
      processing: files.filter(f => f.status === 'extracting' || f.status === 'analyzing').length,
      readyToUpload: files.filter(f => f.status === 'ready-to-upload').length,
      uploading: files.filter(f => f.status === 'uploading' || f.status === 'rate-limited' || f.status === 'retrying').length,
      complete: files.filter(f => f.status === 'complete').length,
      error: files.filter(f => f.status === 'error').length,
    };
  }
}
