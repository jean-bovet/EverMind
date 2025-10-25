/**
 * Unit tests for ProgressReporter abstraction
 *
 * These tests demonstrate how the ProgressReporter interface
 * enables testing without Electron dependencies.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockProgressReporter,
  NullProgressReporter,
  type FileProgressData
} from '../../../electron/core/progress-reporter.js';

describe('MockProgressReporter', () => {
  let reporter: MockProgressReporter;

  beforeEach(() => {
    reporter = new MockProgressReporter();
  });

  it('should capture file progress reports', () => {
    const progressData: FileProgressData = {
      filePath: '/test/file.pdf',
      status: 'analyzing',
      progress: 50,
      message: 'Analyzing content...'
    };

    reporter.reportFileProgress(progressData);

    expect(reporter.fileProgressReports).toHaveLength(1);
    expect(reporter.fileProgressReports[0]).toEqual(progressData);
  });

  it('should capture multiple progress updates', () => {
    reporter.reportFileProgress({
      filePath: '/test/file.pdf',
      status: 'extracting',
      progress: 25
    });

    reporter.reportFileProgress({
      filePath: '/test/file.pdf',
      status: 'analyzing',
      progress: 50
    });

    reporter.reportFileProgress({
      filePath: '/test/file.pdf',
      status: 'complete',
      progress: 100
    });

    expect(reporter.fileProgressReports).toHaveLength(3);
    expect(reporter.getLastFileProgress()?.status).toBe('complete');
  });

  it('should capture file removed events', () => {
    reporter.reportFileRemoved('/test/file.pdf');
    reporter.reportFileRemoved('/test/file2.pdf');

    expect(reporter.fileRemovedReports).toHaveLength(2);
    expect(reporter.fileRemovedReports).toContain('/test/file.pdf');
    expect(reporter.fileRemovedReports).toContain('/test/file2.pdf');
  });

  it('should capture augment progress events', () => {
    reporter.reportAugmentProgress({
      noteGuid: 'note-123',
      status: 'analyzing',
      progress: 60,
      message: 'Analyzing note content...'
    });

    expect(reporter.augmentProgressReports).toHaveLength(1);
    expect(reporter.augmentProgressReports[0].noteGuid).toBe('note-123');
  });

  it('should filter progress by file path', () => {
    reporter.reportFileProgress({
      filePath: '/test/file1.pdf',
      status: 'analyzing',
      progress: 50
    });

    reporter.reportFileProgress({
      filePath: '/test/file2.pdf',
      status: 'extracting',
      progress: 25
    });

    reporter.reportFileProgress({
      filePath: '/test/file1.pdf',
      status: 'complete',
      progress: 100
    });

    const file1Progress = reporter.getFileProgressFor('/test/file1.pdf');
    expect(file1Progress).toHaveLength(2);
    expect(file1Progress[0].progress).toBe(50);
    expect(file1Progress[1].progress).toBe(100);
  });

  it('should reset all captured reports', () => {
    reporter.reportFileProgress({
      filePath: '/test/file.pdf',
      status: 'analyzing',
      progress: 50
    });
    reporter.reportFileRemoved('/test/file.pdf');

    reporter.reset();

    expect(reporter.fileProgressReports).toHaveLength(0);
    expect(reporter.fileRemovedReports).toHaveLength(0);
  });

  it('should return undefined for getLastFileProgress when empty', () => {
    expect(reporter.getLastFileProgress()).toBeUndefined();
  });
});

describe('NullProgressReporter', () => {
  it('should not throw when reporting progress', () => {
    const reporter = new NullProgressReporter();

    expect(() => {
      reporter.reportFileProgress({
        filePath: '/test/file.pdf',
        status: 'analyzing',
        progress: 50
      });
      reporter.reportFileRemoved('/test/file.pdf');
      reporter.reportAugmentProgress({
        noteGuid: 'note-123',
        status: 'analyzing',
        progress: 60
      });
    }).not.toThrow();
  });
});

/**
 * Example: How to test business logic with MockProgressReporter
 */
describe('Example: Testing business logic', () => {
  it('should report progress during file processing', async () => {
    const reporter = new MockProgressReporter();

    // Simulate business logic that reports progress
    async function processFile(filePath: string, reporter: MockProgressReporter) {
      reporter.reportFileProgress({
        filePath,
        status: 'extracting',
        progress: 25,
        message: 'Extracting content...'
      });

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));

      reporter.reportFileProgress({
        filePath,
        status: 'analyzing',
        progress: 50,
        message: 'Analyzing with AI...'
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      reporter.reportFileProgress({
        filePath,
        status: 'complete',
        progress: 100,
        message: 'Processing complete'
      });
    }

    // Test the business logic
    await processFile('/test/file.pdf', reporter);

    // Verify progress was reported correctly
    expect(reporter.fileProgressReports).toHaveLength(3);
    expect(reporter.fileProgressReports[0].status).toBe('extracting');
    expect(reporter.fileProgressReports[1].status).toBe('analyzing');
    expect(reporter.fileProgressReports[2].status).toBe('complete');
    expect(reporter.getLastFileProgress()?.progress).toBe(100);
  });
});
