import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UploadWorker } from '../../electron/processing/upload-worker.js';
import type { UploadResult } from '../../electron/processing/file-processor.js';
import {
  createMockWindow,
  createMockUploadResult,
  createRateLimitResult,
  createFailedUploadResult
} from '../utils/mock-factories.js';
import { waitForQueueEmpty, sleep, waitForCalls } from '../utils/test-helpers.js';

// Mock the database module to return empty array (no files ready to upload from DB)
vi.mock('../../electron/database/queue-db.js', () => ({
  getReadyToUploadFiles: vi.fn(() => []),
  updateFileStatus: vi.fn(),
  deleteFile: vi.fn(),
}));

describe('UploadWorker', () => {
  let worker: UploadWorker;
  let mockWindow: any;
  let mockUploadFn: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWindow = createMockWindow();
    mockUploadFn = vi.fn();
  });

  afterEach(() => {
    if (worker) {
      worker.stop();
    }
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Queue Management', () => {
    it('should add files to queue', () => {
      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.addToQueue('/path/file2.json', '/path/file2.pdf');

      expect(worker.getQueueLength()).toBe(2);
    });

    it('should not add duplicate files to queue', () => {
      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.addToQueue('/path/file1.json', '/path/file1.pdf');

      expect(worker.getQueueLength()).toBe(1);
    });

    it('should remove files after successful upload', async () => {
      mockUploadFn.mockResolvedValue(createMockUploadResult());
      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      // Wait for upload to complete
      await vi.advanceTimersByTimeAsync(2000);

      expect(worker.getQueueLength()).toBe(0);
      expect(mockUploadFn).toHaveBeenCalledTimes(1);
    });

    it('should maintain queue order (FIFO)', async () => {
      const uploadedFiles: string[] = [];
      mockUploadFn.mockImplementation(async (jsonPath: string) => {
        uploadedFiles.push(jsonPath);
        return createMockUploadResult();
      });

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.addToQueue('/path/file2.json', '/path/file2.pdf');
      worker.addToQueue('/path/file3.json', '/path/file3.pdf');

      worker.start();
      // Wait for all files to process
      await vi.advanceTimersByTimeAsync(5000);

      expect(uploadedFiles).toEqual([
        '/path/file1.json',
        '/path/file2.json',
        '/path/file3.json'
      ]);
    });

    it('should handle empty queue gracefully', async () => {
      worker = new UploadWorker(mockWindow, mockUploadFn);
      worker.start();

      // Advance timers - worker should just wait
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockUploadFn).not.toHaveBeenCalled();
      expect(worker.getQueueLength()).toBe(0);
    });
  });

  describe('Processing Loop', () => {
    it('should start processing when queue has items', async () => {
      mockUploadFn.mockResolvedValue(createMockUploadResult());
      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      await vi.advanceTimersByTimeAsync(2000);

      expect(mockUploadFn).toHaveBeenCalled();
    });

    it('should stop when stop() is called', async () => {
      mockUploadFn.mockResolvedValue(createMockUploadResult());

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');

      // Stop before starting to prevent any processing
      worker.stop();

      // Try to advance timers
      await vi.advanceTimersByTimeAsync(5000);

      // Should not have processed anything
      expect(mockUploadFn).not.toHaveBeenCalled();
    });

    it('should wait when queue is empty', async () => {
      worker = new UploadWorker(mockWindow, mockUploadFn);
      worker.start();

      // Advance by poll interval
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockUploadFn).not.toHaveBeenCalled();
    });

    it('should process files sequentially (one at a time)', async () => {
      let concurrentCalls = 0;
      let maxConcurrent = 0;

      mockUploadFn.mockImplementation(async () => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        concurrentCalls--;
        return createMockUploadResult();
      });

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.addToQueue('/path/file2.json', '/path/file2.pdf');
      worker.addToQueue('/path/file3.json', '/path/file3.pdf');

      worker.start();
      await vi.advanceTimersByTimeAsync(5000);

      expect(maxConcurrent).toBe(1);
      expect(mockUploadFn).toHaveBeenCalledTimes(3);
    });

    it('should continue processing after errors', async () => {
      mockUploadFn
        .mockRejectedValueOnce(new Error('Critical error'))
        .mockResolvedValueOnce(createMockUploadResult());

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.addToQueue('/path/file2.json', '/path/file2.pdf');

      worker.start();
      await vi.advanceTimersByTimeAsync(5000);

      // Should have processed both files
      expect(mockUploadFn).toHaveBeenCalledTimes(2);
      expect(worker.getQueueLength()).toBe(0);
    });
  });

  describe('Rate Limit Handling', () => {
    it('should wait specified duration on rate limit', async () => {
      mockUploadFn
        .mockResolvedValueOnce(createRateLimitResult(5)) // 5 seconds
        .mockResolvedValueOnce(createMockUploadResult());

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      // First attempt
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockUploadFn).toHaveBeenCalledTimes(1);

      // Should not retry yet (need to wait 5s + 2s buffer = 7s)
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockUploadFn).toHaveBeenCalledTimes(1);

      // After waiting full duration, should retry
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockUploadFn).toHaveBeenCalledTimes(2);

      // File should be removed from queue
      expect(worker.getQueueLength()).toBe(0);
    });

    it('should retry after rate limit expires', async () => {
      mockUploadFn
        .mockResolvedValueOnce(createRateLimitResult(2))
        .mockResolvedValueOnce(createMockUploadResult());

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      // Wait for initial attempt + rate limit duration + buffer
      await vi.advanceTimersByTimeAsync(6000);

      expect(mockUploadFn).toHaveBeenCalledTimes(2);
      expect(worker.getQueueLength()).toBe(0);
    });

    it('should keep file in queue during rate limit', async () => {
      mockUploadFn.mockResolvedValue(createRateLimitResult(5));

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      // First attempt
      await vi.advanceTimersByTimeAsync(1000);

      // File should still be in queue
      expect(worker.getQueueLength()).toBe(1);
    });

    it('should add buffer time to rate limit duration', async () => {
      mockUploadFn
        .mockResolvedValueOnce(createRateLimitResult(5))
        .mockResolvedValueOnce(createMockUploadResult());

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      // First attempt
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockUploadFn).toHaveBeenCalledTimes(1);

      // Wait 5 seconds (should not retry yet, needs buffer)
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockUploadFn).toHaveBeenCalledTimes(1);

      // Wait buffer time (2 seconds)
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockUploadFn).toHaveBeenCalledTimes(2);
    });

    it('should send rate-limited status via IPC', async () => {
      mockUploadFn.mockResolvedValue(createRateLimitResult(60));

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'file-progress',
        expect.objectContaining({
          filePath: '/path/file1.pdf',
          status: 'rate-limited',
          message: expect.stringContaining('60')
        })
      );
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed uploads with delay', async () => {
      mockUploadFn
        .mockResolvedValueOnce(createFailedUploadResult('Network error'))
        .mockResolvedValueOnce(createMockUploadResult());

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      // Wait for initial attempt + retry delay
      await vi.advanceTimersByTimeAsync(7000);

      expect(mockUploadFn).toHaveBeenCalledTimes(2);
      expect(worker.getQueueLength()).toBe(0);
    });

    it('should use exponential backoff for retries', async () => {
      mockUploadFn
        .mockResolvedValueOnce(createFailedUploadResult())
        .mockResolvedValueOnce(createFailedUploadResult())
        .mockResolvedValueOnce(createMockUploadResult());

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      // First attempt
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockUploadFn).toHaveBeenCalledTimes(1);

      // First retry after 5s
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockUploadFn).toHaveBeenCalledTimes(2);

      // Second retry after 10s (2 * 5s)
      await vi.advanceTimersByTimeAsync(10000);
      expect(mockUploadFn).toHaveBeenCalledTimes(3);
    });

    it('should give up after max retries', async () => {
      mockUploadFn.mockResolvedValue(createFailedUploadResult());

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      // Wait for all retry attempts
      await vi.advanceTimersByTimeAsync(30000);

      // Should try initial + retries until retryCount >= MAX (3)
      // Initial (retryCount=0), retry 1 (retryCount=1), retry 2 (retryCount=2), then retryCount=3 triggers stop
      expect(mockUploadFn).toHaveBeenCalledTimes(3);

      // File should be removed from queue after max retries
      expect(worker.getQueueLength()).toBe(0);
    });

    it('should send retry status updates via IPC', async () => {
      mockUploadFn
        .mockResolvedValueOnce(createFailedUploadResult('Connection timeout'))
        .mockResolvedValueOnce(createMockUploadResult());

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      await vi.advanceTimersByTimeAsync(1000);

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'file-progress',
        expect.objectContaining({
          filePath: '/path/file1.pdf',
          status: 'retrying',
          error: 'Connection timeout'
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should mark file as error on critical failure', async () => {
      mockUploadFn.mockRejectedValue(new Error('Critical error'));

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      await vi.advanceTimersByTimeAsync(2000);

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'file-progress',
        expect.objectContaining({
          filePath: '/path/file1.pdf',
          status: 'error',
          error: 'Critical error'
        })
      );
    });

    it('should remove file from queue on critical error', async () => {
      mockUploadFn.mockRejectedValue(new Error('Critical error'));

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      await vi.advanceTimersByTimeAsync(2000);

      expect(worker.getQueueLength()).toBe(0);
    });

    it('should continue processing other files after error', async () => {
      mockUploadFn
        .mockRejectedValueOnce(new Error('Critical error'))
        .mockResolvedValueOnce(createMockUploadResult());

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.addToQueue('/path/file2.json', '/path/file2.pdf');

      worker.start();
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockUploadFn).toHaveBeenCalledTimes(2);
      expect(worker.getQueueLength()).toBe(0);
    });

    it('should send error status via IPC', async () => {
      mockUploadFn.mockRejectedValue(new Error('File not found'));

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      await vi.advanceTimersByTimeAsync(2000);

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'file-progress',
        expect.objectContaining({
          status: 'error',
          error: 'File not found'
        })
      );
    });

    it('should handle max retries with proper error message', async () => {
      mockUploadFn.mockResolvedValue(createFailedUploadResult('Upload failed'));

      worker = new UploadWorker(mockWindow, mockUploadFn);

      worker.addToQueue('/path/file1.json', '/path/file1.pdf');
      worker.start();

      await vi.advanceTimersByTimeAsync(30000);

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'file-progress',
        expect.objectContaining({
          status: 'error',
          error: expect.stringMatching(/after.*retries/i)
        })
      );
    });
  });
});
