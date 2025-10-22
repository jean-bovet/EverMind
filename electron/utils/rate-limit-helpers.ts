/**
 * Rate Limit Helpers
 * Utilities for detecting and handling Evernote API rate limits
 */

/**
 * Detect if error is an Evernote rate limit error (code 19)
 * @param error - Error from Evernote API
 * @returns true if error is a rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
  const errorStr = error instanceof Error ? error.message : String(error);
  return /"errorCode"\s*:\s*19/.test(errorStr);
}

/**
 * Extract rate limit duration from error
 * @param error - Error from Evernote API
 * @returns Duration in seconds, or null if not a rate limit error
 */
export function extractRateLimitDuration(error: unknown): number | null {
  const errorStr = error instanceof Error ? error.message : String(error);

  const rateLimitMatch = errorStr.match(/"errorCode"\s*:\s*19.*?"rateLimitDuration"\s*:\s*(\d+)/);
  if (rateLimitMatch && rateLimitMatch[1]) {
    return parseInt(rateLimitMatch[1], 10);
  }

  return null;
}

/**
 * Format duration in seconds to human-readable string
 * Examples:
 * - 30 → "30 seconds"
 * - 60 → "1 minute"
 * - 90 → "1 minute and 30 seconds"
 * - 3661 → "61 minutes and 1 second"
 *
 * @param seconds - Duration in seconds (must be >= 0)
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number): string {
  // Handle edge cases
  if (seconds < 0) {
    return '0 seconds';
  }

  if (seconds === 0) {
    return '0 seconds';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  // Only seconds
  if (minutes === 0) {
    return `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
  }

  // Only minutes (exact)
  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  // Minutes and seconds
  const minuteStr = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  const secondStr = `${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
  return `${minuteStr} and ${secondStr}`;
}

/**
 * Parse rate limit error and return user-friendly message
 * @param error - Error from Evernote API
 * @returns User-friendly error message, or null if not a rate limit error
 *
 * @example
 * parseRateLimitError(error)
 * // => "Rate limit exceeded. Please wait 15 minutes and 4 seconds before trying again."
 */
export function parseRateLimitError(error: unknown): string | null {
  const duration = extractRateLimitDuration(error);

  if (duration === null) {
    return null;
  }

  const formattedDuration = formatDuration(duration);
  return `Rate limit exceeded. Please wait ${formattedDuration} before trying again.`;
}
