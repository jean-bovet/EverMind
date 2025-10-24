import { describe, it, expect } from 'vitest';
import {
  getFileStatusLabel,
  countFilesByStatus,
  shouldShowProgressBar,
  extractFilePaths,
  isTerminalStatus,
  isProcessing
} from '../../electron/utils/file-helpers.js';
import type { FileItem, FileStatus } from '../../electron/utils/processing-scheduler.js';

describe('file-helpers', () => {

  describe('countFilesByStatus', () => {
    const mockFiles: FileItem[] = [
      { path: '/file1', name: 'file1', status: 'complete', progress: 100 },
      { path: '/file2', name: 'file2', status: 'complete', progress: 100 },
      { path: '/file3', name: 'file3', status: 'pending', progress: 0 },
      { path: '/file4', name: 'file4', status: 'analyzing', progress: 50 },
      { path: '/file5', name: 'file5', status: 'error', progress: 0 }
    ];

    it('should count completed files', () => {
      expect(countFilesByStatus(mockFiles, 'complete')).toBe(2);
    });

    it('should count pending files', () => {
      expect(countFilesByStatus(mockFiles, 'pending')).toBe(1);
    });

    it('should return 0 for status with no files', () => {
      expect(countFilesByStatus(mockFiles, 'uploading')).toBe(0);
    });

    it('should handle empty array', () => {
      expect(countFilesByStatus([], 'complete')).toBe(0);
    });
  });

  describe('extractFilePaths', () => {
    it('should extract paths from valid files', () => {
      const mockFiles = [
        { name: 'file1.pdf' } as File,
        { name: 'file2.pdf' } as File
      ];
      const getPath = (file: File) => `/path/to/${file.name}`;

      const result = extractFilePaths(mockFiles, getPath);
      expect(result).toEqual(['/path/to/file1.pdf', '/path/to/file2.pdf']);
    });

    it('should filter out empty paths from errors', () => {
      const mockFiles = [
        { name: 'file1.pdf' } as File,
        { name: 'file2.pdf' } as File
      ];
      const getPath = (file: File) => {
        if (file.name === 'file2.pdf') throw new Error('Failed');
        return `/path/to/${file.name}`;
      };

      const result = extractFilePaths(mockFiles, getPath);
      expect(result).toEqual(['/path/to/file1.pdf']);
    });

    it('should handle empty array', () => {
      const result = extractFilePaths([], () => '');
      expect(result).toEqual([]);
    });

    it('should handle all errors gracefully', () => {
      const mockFiles = [{ name: 'file.pdf' } as File];
      const getPath = () => { throw new Error('All fail'); };

      const result = extractFilePaths(mockFiles, getPath);
      expect(result).toEqual([]);
    });
  });

  describe('isTerminalStatus', () => {
    it('should return true for terminal statuses', () => {
      expect(isTerminalStatus('complete')).toBe(true);
      expect(isTerminalStatus('error')).toBe(true);
    });

    it('should return false for non-terminal statuses', () => {
      expect(isTerminalStatus('pending')).toBe(false);
      expect(isTerminalStatus('extracting')).toBe(false);
      expect(isTerminalStatus('analyzing')).toBe(false);
      expect(isTerminalStatus('uploading')).toBe(false);
      expect(isTerminalStatus('rate-limited')).toBe(false);
    });
  });

  describe('isProcessing', () => {
    it('should return true for processing statuses', () => {
      expect(isProcessing('extracting')).toBe(true);
      expect(isProcessing('analyzing')).toBe(true);
      expect(isProcessing('uploading')).toBe(true);
      expect(isProcessing('retrying')).toBe(true);
    });

    it('should return false for non-processing statuses', () => {
      expect(isProcessing('pending')).toBe(false);
      expect(isProcessing('ready-to-upload')).toBe(false);
      expect(isProcessing('rate-limited')).toBe(false);
      expect(isProcessing('complete')).toBe(false);
      expect(isProcessing('error')).toBe(false);
    });
  });

});
