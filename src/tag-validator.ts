/**
 * Tag validation utilities for Evernote API compatibility
 *
 * Evernote tag requirements:
 * - Length: 1-100 characters
 * - Cannot contain commas (,)
 * - Cannot begin or end with whitespace
 * - Cannot contain control characters or line/paragraph separators
 * - Case-insensitive comparison (tag names are unique by case-insensitive match)
 */

/**
 * Validates if a tag name meets Evernote's requirements
 * @param tag - Tag name to validate
 * @returns true if valid, false otherwise
 */
export function isValidTagName(tag: string): boolean {
  if (!tag || typeof tag !== 'string') {
    return false;
  }

  // Check length (1-100 characters)
  if (tag.length < 1 || tag.length > 100) {
    return false;
  }

  // Check for leading or trailing whitespace
  if (tag !== tag.trim()) {
    return false;
  }

  // Check for commas
  if (tag.includes(',')) {
    return false;
  }

  // Check for control characters, line separators, paragraph separators
  // \p{Cc} = control characters
  // \p{Zl} = line separator
  // \p{Zp} = paragraph separator
  const invalidCharsRegex = /[\p{Cc}\p{Zl}\p{Zp}]/u;
  if (invalidCharsRegex.test(tag)) {
    return false;
  }

  return true;
}

/**
 * Sanitizes a tag name to meet Evernote's requirements
 * @param tag - Tag name to sanitize
 * @returns Sanitized tag name, or null if cannot be sanitized
 */
export function sanitizeTag(tag: string): string | null {
  if (!tag || typeof tag !== 'string') {
    return null;
  }

  // Remove control characters, line separators, paragraph separators
  let sanitized = tag.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, '');

  // Remove commas
  sanitized = sanitized.replace(/,/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Check if result is valid
  if (!sanitized || sanitized.length < 1 || sanitized.length > 100) {
    return null;
  }

  return sanitized;
}

/**
 * Filters tags to only include those that exist in Evernote (case-insensitive)
 * @param tags - Array of tag names to filter
 * @param existingTags - Array of existing tag names from Evernote
 * @returns Object with matched tags and rejected tags with reasons
 */
export function filterExistingTags(
  tags: string[],
  existingTags: string[]
): {
  valid: string[];
  rejected: Array<{ tag: string; reason: string }>;
} {
  const valid: string[] = [];
  const rejected: Array<{ tag: string; reason: string }> = [];

  // Create case-insensitive lookup map
  const existingTagsLower = new Map<string, string>();
  for (const existingTag of existingTags) {
    existingTagsLower.set(existingTag.toLowerCase(), existingTag);
  }

  for (const tag of tags) {
    // Try to sanitize the tag first
    const sanitized = sanitizeTag(tag);

    if (!sanitized) {
      rejected.push({
        tag: tag,
        reason: 'Invalid format (empty, too long, or contains invalid characters)',
      });
      continue;
    }

    // Check if tag exists in Evernote (case-insensitive)
    const matchedTag = existingTagsLower.get(sanitized.toLowerCase());

    if (matchedTag) {
      // Use the exact case from Evernote
      valid.push(matchedTag);
    } else {
      rejected.push({
        tag: sanitized,
        reason: 'Tag does not exist in Evernote',
      });
    }
  }

  return { valid, rejected };
}

/**
 * Sanitizes an array of tags, removing duplicates and invalid tags
 * @param tags - Array of tag names
 * @returns Array of sanitized, unique tag names
 */
export function sanitizeTags(tags: string[]): string[] {
  const sanitized = new Set<string>();

  for (const tag of tags) {
    const cleaned = sanitizeTag(tag);
    if (cleaned) {
      sanitized.add(cleaned);
    }
  }

  return Array.from(sanitized);
}

/**
 * Validates and filters tags before sending to Evernote API
 * This is a final safety check before API calls
 * @param tags - Array of tag names
 * @returns Array of valid tag names
 */
export function validateTagsForAPI(tags: string[]): string[] {
  return tags.filter(tag => isValidTagName(tag));
}
