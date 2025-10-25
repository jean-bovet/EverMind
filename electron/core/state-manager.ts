/**
 * State Manager - Atomic Database Updates + Event Emission
 *
 * Ensures that database state and event emissions are always synchronized.
 * Provides a single source of truth for file state updates.
 */

import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import type { ProgressReporter, FileProgressData } from './progress-reporter.js';
import type { EventBus } from './event-bus.js';
import type { FileStatus } from '../database/queue-db.js';
import {
  addFile as dbAddFile,
  updateFileStatus as dbUpdateFileStatus,
  updateFileProgress as dbUpdateFileProgress,
  updateFileResult as dbUpdateFileResult,
  deleteFile as dbDeleteFile,
  setFileError as dbSetFileError,
  getFile
} from '../database/queue-db.js';

export interface FileStatusUpdate {
  filePath: string;
  status: FileStatus;
  progress?: number;
  message?: string;
}

export interface FileResultUpdate {
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  noteUrl?: string;
}

/**
 * StateManager coordinates database updates with event emission
 * to ensure UI and database are always in sync.
 */
export class FileStateManager {
  constructor(
    private progressReporter: ProgressReporter,
    private eventBus?: EventBus
  ) {}

  /**
   * Add a new file to the queue
   */
  addFile(filePath: string): void {
    // Update database
    dbAddFile(filePath);

    // Emit progress event
    this.progressReporter.reportFileProgress({
      filePath,
      status: 'pending',
      progress: 0,
      message: 'Added to queue'
    });

    // Emit state update event to event bus
    this.eventBus?.emit({
      type: 'state-updated',
      payload: {
        filePath,
        status: 'pending',
        progress: 0
      }
    });
  }

  /**
   * Update file status with optional progress and message
   */
  updateStatus(update: FileStatusUpdate): void {
    const { filePath, status, progress, message } = update;

    // Update database
    dbUpdateFileStatus(filePath, status);

    // If progress is provided, update it as well
    if (progress !== undefined) {
      dbUpdateFileProgress(filePath, progress);
    }

    // Get current file state for complete data
    const fileRecord = getFile(filePath);

    // Emit progress event with complete file data
    this.progressReporter.reportFileProgress({
      filePath,
      status,
      progress: progress ?? fileRecord?.progress ?? 0,
      message,
      result: fileRecord?.title ? {
        title: fileRecord.title,
        description: fileRecord.description || undefined,
        tags: fileRecord.tags ? JSON.parse(fileRecord.tags) : undefined,
        noteUrl: fileRecord.note_url || undefined
      } : undefined
    });

    // Emit state update to event bus
    this.eventBus?.emit({
      type: 'state-updated',
      payload: {
        filePath,
        status,
        progress: progress ?? fileRecord?.progress ?? 0
      }
    });
  }

  /**
   * Update file progress only (no status change)
   */
  updateProgress(filePath: string, progress: number, message?: string): void {
    // Update database
    dbUpdateFileProgress(filePath, progress);

    // Get current file state
    const fileRecord = getFile(filePath);
    if (!fileRecord) {
      console.warn(`Cannot update progress for unknown file: ${filePath}`);
      return;
    }

    // Emit progress event
    this.progressReporter.reportFileProgress({
      filePath,
      status: fileRecord.status,
      progress,
      message,
      result: fileRecord.title ? {
        title: fileRecord.title,
        description: fileRecord.description || undefined,
        tags: fileRecord.tags ? JSON.parse(fileRecord.tags) : undefined,
        noteUrl: fileRecord.note_url || undefined
      } : undefined
    });
  }

  /**
   * Update file result (after AI analysis)
   */
  updateResult(update: FileResultUpdate): void {
    const { filePath, title, description, tags, noteUrl } = update;

    // Update database
    dbUpdateFileResult(filePath, title, description, tags, noteUrl);

    // Get updated file state
    const fileRecord = getFile(filePath);
    if (!fileRecord) {
      console.warn(`Cannot update result for unknown file: ${filePath}`);
      return;
    }

    // Emit progress event with result
    this.progressReporter.reportFileProgress({
      filePath,
      status: fileRecord.status,
      progress: fileRecord.progress,
      result: {
        title,
        description,
        tags,
        noteUrl
      }
    });
  }

  /**
   * Set file error
   */
  setError(filePath: string, errorMessage: string): void {
    // Update database
    dbSetFileError(filePath, errorMessage);

    // Emit error event
    this.progressReporter.reportFileProgress({
      filePath,
      status: 'error',
      progress: 0,
      error: errorMessage
    });

    // Emit state update
    this.eventBus?.emit({
      type: 'state-updated',
      payload: {
        filePath,
        status: 'error',
        progress: 0
      }
    });
  }

  /**
   * Delete file from queue (after successful upload)
   */
  deleteFile(filePath: string): void {
    // Update database
    dbDeleteFile(filePath);

    // Emit removal event
    this.progressReporter.reportFileRemoved(filePath);

    // Emit to event bus
    this.eventBus?.emit({
      type: 'file-removed',
      payload: { filePath }
    });
  }

  /**
   * Combined update: status + progress + message
   * Convenience method for common use case
   */
  updateStatusAndProgress(
    filePath: string,
    status: FileStatus,
    progress: number,
    message?: string
  ): void {
    this.updateStatus({ filePath, status, progress, message });
  }
}

/**
 * Create a null state manager that does nothing
 * Useful for testing or scenarios where state management is not needed
 */
export class NullFileStateManager extends FileStateManager {
  constructor() {
    super({
      reportFileProgress: () => {},
      reportFileRemoved: () => {},
      reportAugmentProgress: () => {},
      reportBatchProgress: () => {}
    });
  }

  addFile(_filePath: string): void {
    // Do nothing
  }

  updateStatus(_update: FileStatusUpdate): void {
    // Do nothing
  }

  updateProgress(_filePath: string, _progress: number, _message?: string): void {
    // Do nothing
  }

  updateResult(_update: FileResultUpdate): void {
    // Do nothing
  }

  setError(_filePath: string, _errorMessage: string): void {
    // Do nothing
  }

  deleteFile(_filePath: string): void {
    // Do nothing
  }
}
