/**
 * Format Helpers
 * Utilities for formatting dates, text, and pluralization
 */

/**
 * Format timestamp to localized date string
 * @param timestamp - Unix timestamp in milliseconds
 * @param locale - Locale string (defaults to 'en-US')
 * @returns Formatted date string (e.g., "Oct 22, 2025")
 *
 * @example
 * formatDate(1700000000000) // => "Nov 14, 2023"
 * formatDate(1700000000000, 'fr-FR') // => "14 nov. 2023"
 */
export function formatDate(timestamp: number, locale: string = 'en-US'): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format timestamp to short date (omits year if current year)
 * @param timestamp - Unix timestamp in milliseconds
 * @param locale - Locale string (defaults to 'en-US')
 * @returns Short date string (e.g., "Oct 22" or "Oct 22, 2024")
 *
 * @example
 * // If current year is 2025:
 * formatShortDate(Date.parse('2025-10-22')) // => "Oct 22"
 * formatShortDate(Date.parse('2024-10-22')) // => "Oct 22, 2024"
 */
export function formatShortDate(timestamp: number, locale: string = 'en-US'): string {
  const date = new Date(timestamp);
  const currentYear = new Date().getFullYear();
  const dateYear = date.getFullYear();

  if (dateYear === currentYear) {
    // Same year - omit year
    return date.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric'
    });
  } else {
    // Different year - include year
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

/**
 * Truncate text with ellipsis if it exceeds max length
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation (must be > 3 for ellipsis)
 * @returns Truncated text with "..." if needed
 *
 * @example
 * truncateText('Hello world', 5) // => "He..."
 * truncateText('Hi', 10) // => "Hi"
 * truncateText('', 10) // => ""
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Ensure we don't create invalid truncations for very small maxLength
  if (maxLength < 3) {
    return text.substring(0, maxLength);
  }

  return text.substring(0, maxLength) + '...';
}

/**
 * Pluralize a word based on count
 * @param count - Number of items
 * @param singular - Singular form of word
 * @param plural - Plural form (optional, defaults to singular + 's')
 * @returns Appropriate word form
 *
 * @example
 * pluralize(1, 'file') // => 'file'
 * pluralize(2, 'file') // => 'files'
 * pluralize(0, 'person', 'people') // => 'people'
 * pluralize(1, 'person', 'people') // => 'person'
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string
): string {
  if (count === 1) {
    return singular;
  }
  return plural !== undefined ? plural : singular + 's';
}

/**
 * Format count with pluralized word
 * @param count - Number of items
 * @param singular - Singular form of word
 * @param plural - Plural form (optional, defaults to singular + 's')
 * @returns Formatted string with count and word
 *
 * @example
 * formatCount(1, 'file') // => '1 file'
 * formatCount(5, 'file') // => '5 files'
 * formatCount(0, 'person', 'people') // => '0 people'
 */
export function formatCount(
  count: number,
  singular: string,
  plural?: string
): string {
  const word = pluralize(count, singular, plural);
  return `${count} ${word}`;
}

/**
 * Get button tooltip text based on augmentation state
 * @param isAugmented - Whether note is already augmented
 * @param isAugmenting - Whether augmentation is in progress
 * @returns Appropriate tooltip text
 *
 * @example
 * getAugmentButtonTooltip(true, false) // => 'This note has already been augmented'
 * getAugmentButtonTooltip(false, true) // => 'Augmenting...'
 * getAugmentButtonTooltip(false, false) // => 'Augment this note with AI analysis'
 */
export function getAugmentButtonTooltip(
  isAugmented: boolean,
  isAugmenting: boolean
): string {
  if (isAugmented) {
    return 'This note has already been augmented';
  }
  if (isAugmenting) {
    return 'Augmenting...';
  }
  return 'Augment this note with AI analysis';
}

/**
 * Get button label based on augmentation state
 * @param isAugmenting - Whether augmentation is in progress
 * @returns Button label text
 *
 * @example
 * getAugmentButtonLabel(true) // => '🔄 Augmenting...'
 * getAugmentButtonLabel(false) // => '🤖 Augment with AI'
 */
export function getAugmentButtonLabel(isAugmenting: boolean): string {
  return isAugmenting ? '🔄 Augmenting...' : '🤖 Augment with AI';
}
