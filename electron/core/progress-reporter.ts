/**
 * Progress Reporter Abstraction
 *
 * Decouples business logic from Electron IPC by providing an interface
 * for reporting progress. This allows business logic to be tested without
 * Electron and makes the code more modular.
 */

import type { BrowserWindow } from 'electron';

// Re-export types from preload for convenience
export interface FileProgressData {
  filePath: string;
  status: 'pending' | 'extracting' | 'analyzing' | 'ready-to-upload' | 'uploading' | 'rate-limited' | 'retrying' | 'complete' | 'error';
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

export interface AugmentProgressData {
  noteGuid: string;
  status: 'fetching' | 'extracting' | 'analyzing' | 'building' | 'uploading' | 'complete' | 'error';
  progress: number;
  message?: string;
  error?: string;
  noteUrl?: string;
}

export interface BatchProgressData {
  totalFiles: number;
  processed: number;
  currentFile?: string;
  status: 'scanning' | 'processing' | 'uploading' | 'complete';
}

/**
 * Interface for reporting progress events.
 * Business logic depends on this interface, not on Electron IPC.
 */
export interface ProgressReporter {
  /**
   * Report file processing progress
   */
  reportFileProgress(data: FileProgressData): void;

  /**
   * Report file removed from queue
   */
  reportFileRemoved(filePath: string): void;

  /**
   * Report note augmentation progress
   */
  reportAugmentProgress(data: AugmentProgressData): void;

  /**
   * Report batch processing progress
   */
  reportBatchProgress(data: BatchProgressData): void;
}

/**
 * Production implementation that sends events via Electron IPC
 */
export class IPCProgressReporter implements ProgressReporter {
  constructor(private mainWindow: BrowserWindow | null) {}

  reportFileProgress(data: FileProgressData): void {
    this.mainWindow?.webContents.send('file-progress', data);
  }

  reportFileRemoved(filePath: string): void {
    this.mainWindow?.webContents.send('file-removed-from-queue', { filePath });
  }

  reportAugmentProgress(data: AugmentProgressData): void {
    this.mainWindow?.webContents.send('augment-progress', data);
  }

  reportBatchProgress(data: BatchProgressData): void {
    this.mainWindow?.webContents.send('batch-progress', data);
  }

  /**
   * Update the main window reference (useful when window is recreated)
   */
  setMainWindow(mainWindow: BrowserWindow | null): void {
    this.mainWindow = mainWindow;
  }
}

/**
 * Mock implementation for testing.
 * Captures all reported events for verification in tests.
 */
export class MockProgressReporter implements ProgressReporter {
  public fileProgressReports: FileProgressData[] = [];
  public fileRemovedReports: string[] = [];
  public augmentProgressReports: AugmentProgressData[] = [];
  public batchProgressReports: BatchProgressData[] = [];

  reportFileProgress(data: FileProgressData): void {
    this.fileProgressReports.push(data);
  }

  reportFileRemoved(filePath: string): void {
    this.fileRemovedReports.push(filePath);
  }

  reportAugmentProgress(data: AugmentProgressData): void {
    this.augmentProgressReports.push(data);
  }

  reportBatchProgress(data: BatchProgressData): void {
    this.batchProgressReports.push(data);
  }

  /**
   * Reset all captured reports (useful between tests)
   */
  reset(): void {
    this.fileProgressReports = [];
    this.fileRemovedReports = [];
    this.augmentProgressReports = [];
    this.batchProgressReports = [];
  }

  /**
   * Get the last file progress report
   */
  getLastFileProgress(): FileProgressData | undefined {
    return this.fileProgressReports[this.fileProgressReports.length - 1];
  }

  /**
   * Get all progress reports for a specific file
   */
  getFileProgressFor(filePath: string): FileProgressData[] {
    return this.fileProgressReports.filter(r => r.filePath === filePath);
  }
}

/**
 * Null implementation that does nothing.
 * Useful for scenarios where progress reporting is not needed.
 */
export class NullProgressReporter implements ProgressReporter {
  reportFileProgress(_data: FileProgressData): void {
    // Do nothing
  }

  reportFileRemoved(_filePath: string): void {
    // Do nothing
  }

  reportAugmentProgress(_data: AugmentProgressData): void {
    // Do nothing
  }

  reportBatchProgress(_data: BatchProgressData): void {
    // Do nothing
  }
}
