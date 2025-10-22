import { describe, it, expect } from 'vitest';
import {
  enmlToPlainText,
  enmlToHtml,
  appendToEnml,
  createAIAnalysisEnml
} from '../../electron/enml-parser.js';

describe('enml-parser', () => {

  describe('enmlToPlainText', () => {
    it('should extract text from basic ENML', () => {
      const enml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>Hello World</en-note>`;

      expect(enmlToPlainText(enml)).toBe('Hello World');
    });

    it('should remove XML tags', () => {
      const enml = `<en-note><div>Text with <strong>bold</strong></div></en-note>`;
      expect(enmlToPlainText(enml)).toBe('Text with bold');
    });

    it('should handle en-media tags for images', () => {
      const enml = `<en-note>Before<en-media type="image/png" hash="abc"/>After</en-note>`;
      const text = enmlToPlainText(enml);

      expect(text).toContain('Before');
      expect(text).toContain('[Image]');
      expect(text).toContain('After');
    });

    it('should handle en-media tags for PDFs', () => {
      const enml = `<en-note>Document<en-media type="application/pdf" hash="xyz"/></en-note>`;
      const text = enmlToPlainText(enml);

      expect(text).toContain('Document');
      expect(text).toContain('[PDF]');
    });

    it('should handle en-media tags for other attachments', () => {
      const enml = `<en-note>File<en-media type="application/zip" hash="123"/></en-note>`;
      const text = enmlToPlainText(enml);

      expect(text).toContain('File');
      expect(text).toContain('[Attachment]');
    });

    it('should preserve line breaks from div tags', () => {
      const enml = `<en-note><div>Line 1</div><div>Line 2</div></en-note>`;
      const text = enmlToPlainText(enml);

      expect(text).toContain('Line 1');
      expect(text).toContain('Line 2');
      // Should have newlines between them
      expect(text.split('\n').length).toBeGreaterThan(1);
    });

    it('should preserve line breaks from p tags', () => {
      const enml = `<en-note><p>Paragraph 1</p><p>Paragraph 2</p></en-note>`;
      const text = enmlToPlainText(enml);

      expect(text).toContain('Paragraph 1');
      expect(text).toContain('Paragraph 2');
    });

    it('should preserve line breaks from br tags', () => {
      const enml = `<en-note>Line 1<br/>Line 2<br />Line 3</en-note>`;
      const text = enmlToPlainText(enml);

      expect(text).toContain('Line 1');
      expect(text).toContain('Line 2');
      expect(text).toContain('Line 3');
    });

    it('should handle empty ENML', () => {
      const enml = `<en-note></en-note>`;
      expect(enmlToPlainText(enml)).toBe('');
    });

    it('should handle empty string', () => {
      expect(enmlToPlainText('')).toBe('');
    });

    it('should unescape XML entities', () => {
      const enml = `<en-note>&lt;div&gt; &amp; &quot;test&quot; &apos;quote&apos;</en-note>`;
      const text = enmlToPlainText(enml);

      expect(text).toContain('<div>');
      expect(text).toContain('&');
      expect(text).toContain('"test"');
      expect(text).toContain("'quote'");
    });

    it('should collapse multiple spaces', () => {
      const enml = `<en-note>Text    with     many      spaces</en-note>`;
      const text = enmlToPlainText(enml);

      expect(text).not.toMatch(/  +/); // No multiple spaces
      expect(text).toBe('Text with many spaces');
    });

    it('should handle lists', () => {
      const enml = `<en-note><ul><li>Item 1</li><li>Item 2</li></ul></en-note>`;
      const text = enmlToPlainText(enml);

      expect(text).toContain('Item 1');
      expect(text).toContain('Item 2');
    });

    it('should handle nested tags', () => {
      const enml = `<en-note><div><strong><em>Nested text</em></strong></div></en-note>`;
      const text = enmlToPlainText(enml);

      expect(text).toBe('Nested text');
    });

    it('should handle complex real-world ENML', () => {
      const enml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>
  <div><strong>Meeting Notes</strong></div>
  <div>Date: 2025-10-22</div>
  <br/>
  <div>Attendees:</div>
  <ul>
    <li>John Doe</li>
    <li>Jane Smith</li>
  </ul>
  <br/>
  <div>Discussion points:</div>
  <div>1. Project timeline &amp; budget</div>
  <div>2. Resource allocation</div>
  <br/>
  <en-media type="application/pdf" hash="abc123"/>
</en-note>`;

      const text = enmlToPlainText(enml);

      expect(text).toContain('Meeting Notes');
      expect(text).toContain('Date: 2025-10-22');
      expect(text).toContain('John Doe');
      expect(text).toContain('Jane Smith');
      expect(text).toContain('Project timeline & budget');
      expect(text).toContain('[PDF]');
    });
  });

  describe('enmlToHtml', () => {
    it('should convert ENML to safe HTML', () => {
      const enml = `<en-note><div><strong>Bold</strong> text</div></en-note>`;
      const html = enmlToHtml(enml);

      expect(html).toContain('<strong>Bold</strong>');
      expect(html).toContain('text');
      expect(html).toContain('<div');
    });

    it('should replace en-note with div', () => {
      const enml = `<en-note>Content</en-note>`;
      const html = enmlToHtml(enml);

      expect(html).not.toContain('<en-note');
      expect(html).toContain('<div class="en-note">');
      expect(html).toContain('</div>');
    });

    it('should handle image media tags', () => {
      const enml = `<en-note><en-media type="image/png" hash="xyz"/></en-note>`;
      const html = enmlToHtml(enml);

      expect(html).toContain('[📷 Image]');
      expect(html).toContain('media-placeholder');
    });

    it('should handle PDF media tags', () => {
      const enml = `<en-note><en-media type="application/pdf" hash="abc"/></en-note>`;
      const html = enmlToHtml(enml);

      expect(html).toContain('[📄 PDF Attachment]');
      expect(html).toContain('media-placeholder');
    });

    it('should handle audio media tags', () => {
      const enml = `<en-note><en-media type="audio/mp3" hash="123"/></en-note>`;
      const html = enmlToHtml(enml);

      expect(html).toContain('[🔊 Audio]');
    });

    it('should handle video media tags', () => {
      const enml = `<en-note><en-media type="video/mp4" hash="456"/></en-note>`;
      const html = enmlToHtml(enml);

      expect(html).toContain('[🎥 Video]');
    });

    it('should handle generic attachment tags', () => {
      const enml = `<en-note><en-media type="application/zip" hash="789"/></en-note>`;
      const html = enmlToHtml(enml);

      expect(html).toContain('[📎 Attachment]');
    });

    it('should preserve lists', () => {
      const enml = `<en-note><ul><li>Item 1</li><li>Item 2</li></ul></en-note>`;
      const html = enmlToHtml(enml);

      expect(html).toContain('<ul>');
      expect(html).toContain('<li>Item 1</li>');
      expect(html).toContain('<li>Item 2</li>');
      expect(html).toContain('</ul>');
    });

    it('should preserve formatting tags', () => {
      const enml = `<en-note><p><strong>Bold</strong> and <em>italic</em></p></en-note>`;
      const html = enmlToHtml(enml);

      expect(html).toContain('<strong>Bold</strong>');
      expect(html).toContain('<em>italic</em>');
      expect(html).toContain('<p>');
    });

    it('should handle empty ENML', () => {
      const enml = `<en-note></en-note>`;
      const html = enmlToHtml(enml);
      // Empty en-note should convert to empty div
      expect(html).toContain('<div class="en-note">');
      expect(html).toContain('</div>');
    });

    it('should remove XML declaration and DOCTYPE', () => {
      const enml = `<?xml version="1.0"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>Content</en-note>`;
      const html = enmlToHtml(enml);

      expect(html).not.toContain('<?xml');
      expect(html).not.toContain('<!DOCTYPE');
      expect(html).toContain('Content');
    });
  });

  describe('appendToEnml', () => {
    it('should append content to existing ENML', () => {
      const original = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note><div>Original content</div></en-note>`;

      const additional = `<div><strong>AI Analysis</strong></div>`;

      const result = appendToEnml(original, additional);

      expect(result).toContain('Original content');
      expect(result).toContain('AI Analysis');
      expect(result).toContain('<hr/>');
    });

    it('should maintain valid ENML structure', () => {
      const original = `<en-note><div>Test</div></en-note>`;
      const additional = `<div>More</div>`;
      const result = appendToEnml(original, additional);

      // Should still have en-note wrapper
      expect(result).toMatch(/<en-note>.*<\/en-note>/s);

      // Should have proper doctype
      expect(result).toContain('<!DOCTYPE en-note');

      // Should have XML declaration
      expect(result).toContain('<?xml version="1.0"');
    });

    it('should preserve original XML declaration', () => {
      const original = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>Test</en-note>`;
      const additional = `<div>New</div>`;
      const result = appendToEnml(original, additional);

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });

    it('should add XML declaration if missing', () => {
      const original = `<en-note><div>Test</div></en-note>`;
      const additional = `<div>More</div>`;
      const result = appendToEnml(original, additional);

      expect(result).toMatch(/^<\?xml version/);
    });

    it('should handle ENML with media', () => {
      const original = `<en-note><en-media type="image/png" hash="abc"/></en-note>`;
      const additional = `<div>AI says: This is an image</div>`;
      const result = appendToEnml(original, additional);

      expect(result).toContain('en-media');
      expect(result).toContain('AI says');
      expect(result).toContain('<hr/>');
    });

    it('should handle ENML with complex structure', () => {
      const original = `<?xml version="1.0"?>
<en-note>
  <div><strong>Title</strong></div>
  <ul>
    <li>Item 1</li>
    <li>Item 2</li>
  </ul>
  <en-media type="application/pdf" hash="xyz"/>
</en-note>`;
      const additional = `<div>Additional analysis</div>`;
      const result = appendToEnml(original, additional);

      expect(result).toContain('Title');
      expect(result).toContain('Item 1');
      expect(result).toContain('en-media');
      expect(result).toContain('Additional analysis');
      expect(result).toContain('<hr/>');
    });

    it('should throw error for empty original ENML', () => {
      expect(() => appendToEnml('', '<div>New</div>'))
        .toThrow('Original ENML cannot be empty');
    });

    it('should throw error for invalid ENML without closing tag', () => {
      const invalid = `<en-note>Content`;
      expect(() => appendToEnml(invalid, '<div>New</div>'))
        .toThrow('Invalid ENML: missing closing </en-note> tag');
    });

    it('should place new content before closing tag', () => {
      const original = `<en-note><div>First</div></en-note>`;
      const additional = `<div>Last</div>`;
      const result = appendToEnml(original, additional);

      // New content should come after original but before </en-note>
      const firstIndex = result.indexOf('First');
      const lastIndex = result.indexOf('Last');
      const closingIndex = result.indexOf('</en-note>');

      expect(firstIndex).toBeLessThan(lastIndex);
      expect(lastIndex).toBeLessThan(closingIndex);
    });
  });

  describe('createAIAnalysisEnml', () => {
    it('should create formatted AI analysis ENML', () => {
      const aiAnalysis = {
        title: 'Test Title',
        description: 'Test description here',
        tags: ['tag1', 'tag2', 'tag3']
      };

      const enml = createAIAnalysisEnml(aiAnalysis, '2025-10-22T15:30:00.000Z');

      expect(enml).toContain('AI Analysis');
      expect(enml).toContain('Test Title');
      expect(enml).toContain('Test description here');
      expect(enml).toContain('tag1, tag2, tag3');
    });

    it('should include timestamp in human-readable format', () => {
      const aiAnalysis = {
        title: 'Title',
        description: 'Description',
        tags: []
      };

      const enml = createAIAnalysisEnml(aiAnalysis, '2025-10-22T15:30:00.000Z');

      // Should contain formatted date (October 22, 2025)
      expect(enml).toMatch(/October|Oct/);
      expect(enml).toContain('2025');
      expect(enml).toContain('22');
    });

    it('should escape XML special characters', () => {
      const aiAnalysis = {
        title: 'Title with <tags> & "quotes"',
        description: "Description with 'apostrophes'",
        tags: ['tag>1', 'tag&2']
      };

      const enml = createAIAnalysisEnml(aiAnalysis);

      // Should not contain unescaped characters
      expect(enml).not.toMatch(/<tags>/);
      expect(enml).toContain('&lt;tags&gt;');
      expect(enml).toContain('&amp;');
      expect(enml).toContain('&quot;');
      expect(enml).toContain('&apos;');
    });

    it('should use current date if timestamp not provided', () => {
      const aiAnalysis = {
        title: 'Title',
        description: 'Description',
        tags: []
      };

      const enml = createAIAnalysisEnml(aiAnalysis);

      // Should contain a date
      expect(enml).toMatch(/\d{4}/); // Year
    });

    it('should include section labels', () => {
      const aiAnalysis = {
        title: 'Title',
        description: 'Description',
        tags: ['tag1']
      };

      const enml = createAIAnalysisEnml(aiAnalysis);

      expect(enml).toContain('Summary:');
      expect(enml).toContain('Description:');
      expect(enml).toContain('Suggested Tags:');
    });

    it('should use strong tags for emphasis', () => {
      const aiAnalysis = {
        title: 'Title',
        description: 'Description',
        tags: []
      };

      const enml = createAIAnalysisEnml(aiAnalysis);

      expect(enml).toContain('<strong>');
      expect(enml).toContain('</strong>');
    });

    it('should handle empty tags array', () => {
      const aiAnalysis = {
        title: 'Title',
        description: 'Description',
        tags: []
      };

      const enml = createAIAnalysisEnml(aiAnalysis);

      expect(enml).toContain('Suggested Tags:');
      // Should not throw error
    });

    it('should handle special characters in all fields', () => {
      const aiAnalysis = {
        title: 'A & B < C > D',
        description: '"Quoted" & <tagged>',
        tags: ["isn't", 'a&b', 'c<d']
      };

      const enml = createAIAnalysisEnml(aiAnalysis);

      // All special chars should be escaped in the content
      expect(enml).toContain('A &amp; B &lt; C &gt; D'); // Title escaped
      expect(enml).toContain('&quot;Quoted&quot; &amp; &lt;tagged&gt;'); // Description escaped
      expect(enml).toContain("isn&apos;t"); // Tag escaped
      expect(enml).toContain('a&amp;b'); // Tag escaped
      expect(enml).toContain('c&lt;d'); // Tag escaped

      // The original unescaped strings should NOT appear in the content area
      // (Only in HTML tags like <strong>, <div>, etc.)
      const contentPart = enml.split('<strong>Summary:</strong>')[1];
      expect(contentPart).not.toContain('A & B < C > D'); // Should be escaped
      expect(contentPart).not.toContain('<tagged>'); // Should be escaped
    });
  });
});
