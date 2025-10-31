/**
 * Progress Helpers
 * Pure utility functions for file processing progress calculation and formatting
 */

export type ProcessingStage =
  | 'pending'
  | 'extracting'
  | 'analyzing'
  | 'saving'
  | 'uploading'
  | 'ready-to-upload'
  | 'complete'
  | 'error'
  | 'rate-limited'
  | 'retrying';

export interface ProgressData {
  filePath: string;
  status: ProcessingStage;
  progress: number;
  message?: string;
  error?: string;
  result?: {
    title?: string;
    description?: string;
    tags?: string[];
    noteUrl?: string;
  };
}

/**
 * Get progress percentage for a given stage
 * @param stage - The current processing stage
 * @returns Progress percentage (0-100)
 */
export function getStageProgress(stage: ProcessingStage): number {
  const progressMap: Record<ProcessingStage, number> = {
    'pending': 0,
    'extracting': 25,
    'analyzing': 50,
    'saving': 90,
    'uploading': 10,
    'ready-to-upload': 100,
    'complete': 100,
    'error': 0,
    'rate-limited': 10,
    'retrying': 10
  };

  return progressMap[stage];
}

/**
 * Get user-friendly message for a given stage
 * @param stage - The current processing stage
 * @param rateLimitDuration - Optional rate limit duration in seconds
 * @returns User-friendly status message
 */
export function getStageMessage(stage: ProcessingStage, rateLimitDuration?: number): string {
  const messageMap: Record<ProcessingStage, string> = {
    'pending': 'Waiting to process...',
    'extracting': 'Extracting file content...',
    'analyzing': 'Analyzing with AI...',
    'saving': 'Saving analysis...',
    'uploading': 'Uploading to Evernote...',
    'ready-to-upload': 'Analysis complete, ready to upload',
    'complete': 'Uploaded successfully',
    'error': 'Processing failed',
    'rate-limited': rateLimitDuration
      ? `Rate limited - retry in ${rateLimitDuration}s`
      : 'Rate limited',
    'retrying': 'Retrying upload...'
  };

  return messageMap[stage];
}

/**
 * Create progress data object for IPC communication
 * @param filePath - Absolute file path
 * @param stage - Current processing stage
 * @param options - Optional data to include
 * @returns Complete progress data object
 */
export function createProgressData(
  filePath: string,
  stage: ProcessingStage,
  options?: {
    rateLimitDuration?: number;
    error?: string;
    result?: ProgressData['result'];
    customMessage?: string;
  }
): ProgressData {
  const data: ProgressData = {
    filePath,
    status: stage,
    progress: getStageProgress(stage),
    message: options?.customMessage || getStageMessage(stage, options?.rateLimitDuration)
  };

  if (options?.error) {
    data.error = options.error;
  }

  if (options?.result) {
    data.result = options.result;
  }

  return data;
}

/**
 * Extract error message from unknown error type
 * @param error - Error of unknown type
 * @returns Extracted error message
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }

  return 'Unknown error';
}

/**
 * Format rate limit duration into human-readable string
 * @param seconds - Duration in seconds
 * @returns Formatted duration string (e.g., "2m 30s" or "45s")
 */
export function formatRateLimitDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Check if a file extension is supported for processing
 * @param filename - Name of the file (with extension)
 * @returns True if file type is supported
 */
export function isSupportedFileType(filename: string): boolean {
  const SUPPORTED_EXTENSIONS = [
    '.pdf', '.txt', '.md', '.markdown', '.docx',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'
  ];

  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
  return ext ? SUPPORTED_EXTENSIONS.includes(ext) : false;
}

/**
 * Get list of supported file extensions
 * @returns Array of supported extensions (with dots)
 */
export function getSupportedExtensions(): string[] {
  return [
    '.pdf', '.txt', '.md', '.markdown', '.docx',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'
  ];
}
