/**
 * ENML Parser - Utilities for converting and manipulating Evernote Markup Language (ENML)
 *
 * ENML is an XML-based format used by Evernote for note content.
 * It's similar to HTML but with some Evernote-specific tags like <en-media>.
 */

/**
 * Convert ENML to plain text by stripping tags and extracting text content
 * @param enml - ENML content string
 * @returns Plain text content
 */
export function enmlToPlainText(enml: string): string {
  if (!enml || enml.trim() === '') {
    return '';
  }

  // Remove DOCTYPE and XML declaration
  let text = enml.replace(/<\?xml[^?]*\?>/g, '');
  text = text.replace(/<!DOCTYPE[^>]*>/g, '');

  // Replace <en-media> tags with placeholder text based on type
  text = text.replace(/<en-media[^>]*type="([^"]*)"[^>]*\/>/g, (_match, type) => {
    if (type.startsWith('image/')) {
      return ' [Image] ';
    } else if (type === 'application/pdf') {
      return ' [PDF] ';
    } else {
      return ' [Attachment] ';
    }
  });

  // Convert common block elements to line breaks
  text = text.replace(/<\/div>/g, '\n');
  text = text.replace(/<\/p>/g, '\n');
  text = text.replace(/<br\s*\/?>/g, '\n');
  text = text.replace(/<\/li>/g, '\n');

  // Remove all remaining HTML/XML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Unescape XML entities
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&apos;/g, "'");
  text = text.replace(/&amp;/g, '&'); // Must be last to avoid double-unescaping

  // Collapse multiple whitespace and newlines
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // Max 2 consecutive newlines
  text = text.replace(/[ \t]+/g, ' '); // Collapse spaces and tabs
  text = text.replace(/^\s+/gm, ''); // Remove leading whitespace on each line

  return text.trim();
}

/**
 * Convert ENML to HTML for preview display
 * @param enml - ENML content string
 * @returns HTML string safe for display
 */
export function enmlToHtml(enml: string): string {
  if (!enml || enml.trim() === '') {
    return '';
  }

  // Remove DOCTYPE and XML declaration
  let html = enml.replace(/<\?xml[^?]*\?>/g, '');
  html = html.replace(/<!DOCTYPE[^>]*>/g, '');

  // Replace <en-note> with <div>
  html = html.replace(/<en-note[^>]*>/g, '<div class="en-note">');
  html = html.replace(/<\/en-note>/g, '</div>');

  // Replace <en-media> tags with placeholders
  html = html.replace(/<en-media[^>]*type="([^"]*)"[^>]*\/>/g, (_match, type) => {
    if (type.startsWith('image/')) {
      return '<div class="media-placeholder">[📷 Image]</div>';
    } else if (type === 'application/pdf') {
      return '<div class="media-placeholder">[📄 PDF Attachment]</div>';
    } else if (type.startsWith('audio/')) {
      return '<div class="media-placeholder">[🔊 Audio]</div>';
    } else if (type.startsWith('video/')) {
      return '<div class="media-placeholder">[🎥 Video]</div>';
    } else {
      return '<div class="media-placeholder">[📎 Attachment]</div>';
    }
  });

  // Preserve common formatting tags (they're already HTML-compatible)
  // No changes needed for: <div>, <p>, <strong>, <em>, <ul>, <ol>, <li>, <br>, etc.

  return html.trim();
}

/**
 * Append additional content to existing ENML, maintaining valid structure
 * @param originalEnml - Original ENML content
 * @param additionalContent - New content to append (should be valid ENML fragments)
 * @returns Updated ENML with appended content
 */
export function appendToEnml(originalEnml: string, additionalContent: string): string {
  // Ensure we have valid input
  if (!originalEnml || originalEnml.trim() === '') {
    throw new Error('Original ENML cannot be empty');
  }

  // Extract XML declaration and DOCTYPE if present
  const xmlDeclarationMatch = originalEnml.match(/<\?xml[^?]*\?>/);
  const xmlDeclaration = xmlDeclarationMatch
    ? xmlDeclarationMatch[0]
    : '<?xml version="1.0" encoding="UTF-8"?>';

  const doctypeMatch = originalEnml.match(/<!DOCTYPE[^>]*>/);
  const doctype = doctypeMatch
    ? doctypeMatch[0]
    : '<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">';

  // Remove XML declaration and DOCTYPE from original content
  let content = originalEnml.replace(/<\?xml[^?]*\?>/g, '');
  content = content.replace(/<!DOCTYPE[^>]*>/g, '');

  // Find the closing </en-note> tag
  const closingTagMatch = content.match(/<\/en-note>\s*$/);
  if (!closingTagMatch) {
    throw new Error('Invalid ENML: missing closing </en-note> tag');
  }

  // Insert new content before the closing tag
  const insertPosition = closingTagMatch.index!;
  const beforeClosing = content.substring(0, insertPosition);
  const afterClosing = content.substring(insertPosition);

  // Build the augmented content
  const augmentedContent = `${beforeClosing}
  <hr/>
  ${additionalContent}
${afterClosing}`;

  // Reconstruct full ENML with declarations
  return `${xmlDeclaration}
${doctype}
${augmentedContent}`;
}

/**
 * Create ENML content for AI analysis results
 * @param aiAnalysis - AI analysis results
 * @param timestamp - Timestamp of analysis
 * @returns ENML fragment to append
 */
export function createAIAnalysisEnml(
  aiAnalysis: { title: string; description: string; tags: string[] },
  timestamp: string = new Date().toISOString()
): string {
  // Format timestamp for display
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Escape XML special characters in the content
  const escapeXml = (text: string): string => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const escapedTitle = escapeXml(aiAnalysis.title);
  const escapedDescription = escapeXml(aiAnalysis.description);
  const escapedTags = aiAnalysis.tags.map(escapeXml).join(', ');

  return `  <div>
    <strong>🤖 AI Analysis (${dateStr})</strong>
  </div>
  <div>
    <strong>Summary:</strong> ${escapedTitle}
  </div>
  <div>
    <strong>Description:</strong> ${escapedDescription}
  </div>
  <div>
    <strong>Suggested Tags:</strong> ${escapedTags}
  </div>`;
}
