import { vi } from 'vitest';
import type { UploadResult, AnalysisResult } from '../../electron/file-processor.js';

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
 * Create a mock BrowserWindow for testing
 */
export function createMockWindow() {
  return {
    webContents: {
      send: vi.fn()
    }
  } as any;
}

/**
 * Create a mock upload result
 */
export function createMockUploadResult(
  overrides?: Partial<UploadResult>
): UploadResult {
  return {
    success: true,
    noteUrl: 'https://www.evernote.com/shard/s1/nl/123/note-id',
    ...overrides
  };
}

/**
 * Create a mock analysis result
 */
export function createMockAnalysisResult(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    success: true,
    title: 'Test Document',
    description: 'A test document for testing purposes',
    tags: ['test', 'mock'],
    jsonPath: '/tmp/test.pdf.evernote.json',
    ...overrides
  };
}

/**
 * Create a mock file item
 */
export function createMockFile(
  name: string,
  status: FileStatus = 'pending',
  overrides?: Partial<FileItem>
): FileItem {
  return {
    path: `/tmp/${name}`,
    name,
    status,
    progress: 0,
    ...overrides
  };
}

/**
 * Create a mock rate limit error result
 */
export function createRateLimitResult(duration = 60): UploadResult {
  return {
    success: false,
    rateLimitDuration: duration,
    error: new Error(`Rate limit exceeded. Retry after ${duration} seconds`)
  };
}

/**
 * Create a mock failed upload result
 */
export function createFailedUploadResult(message = 'Upload failed'): UploadResult {
  return {
    success: false,
    error: new Error(message)
  };
}
