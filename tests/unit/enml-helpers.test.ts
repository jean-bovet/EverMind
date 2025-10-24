import { describe, it, expect } from 'vitest';
import {
  createNoteContent,
  createResource,
  createMD5Hash,
  getMimeType,
  escapeXml
} from '../../electron/evernote/enml-helpers.js';

describe('enml-helpers', () => {
  describe('escapeXml', () => {
    it('should escape ampersand', () => {
      expect(escapeXml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape less than', () => {
      expect(escapeXml('5 < 10')).toBe('5 &lt; 10');
    });

    it('should escape greater than', () => {
      expect(escapeXml('10 > 5')).toBe('10 &gt; 5');
    });

    it('should escape double quotes', () => {
      expect(escapeXml('Say "hello"')).toBe('Say &quot;hello&quot;');
    });

    it('should escape single quotes', () => {
      expect(escapeXml("It's working")).toBe('It&apos;s working');
    });

    it('should escape multiple special characters', () => {
      const input = '<div class="test">A & B</div>';
      const expected = '&lt;div class=&quot;test&quot;&gt;A &amp; B&lt;/div&gt;';
      expect(escapeXml(input)).toBe(expected);
    });

    it('should handle empty string', () => {
      expect(escapeXml('')).toBe('');
    });

    it('should handle string with no special characters', () => {
      expect(escapeXml('Hello World')).toBe('Hello World');
    });

    it('should escape in correct order (ampersand first)', () => {
      // Ensure & is escaped first to avoid double-escaping
      expect(escapeXml('&lt;')).toBe('&amp;lt;');
    });
  });

  describe('getMimeType', () => {
    it('should return correct MIME type for PDF', () => {
      expect(getMimeType('document.pdf')).toBe('application/pdf');
      expect(getMimeType('file.PDF')).toBe('application/pdf');
    });

    it('should return correct MIME type for text files', () => {
      expect(getMimeType('notes.txt')).toBe('text/plain');
      expect(getMimeType('readme.md')).toBe('text/plain');
    });

    it('should return correct MIME type for DOCX', () => {
      expect(getMimeType('report.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('should return correct MIME type for images', () => {
      expect(getMimeType('photo.png')).toBe('image/png');
      expect(getMimeType('photo.jpg')).toBe('image/jpeg');
      expect(getMimeType('photo.jpeg')).toBe('image/jpeg');
      expect(getMimeType('animation.gif')).toBe('image/gif');
      expect(getMimeType('bitmap.bmp')).toBe('image/bmp');
      expect(getMimeType('scan.tiff')).toBe('image/tiff');
    });

    it('should handle uppercase extensions', () => {
      expect(getMimeType('FILE.PDF')).toBe('application/pdf');
      expect(getMimeType('IMAGE.PNG')).toBe('image/png');
    });

    it('should handle mixed case extensions', () => {
      expect(getMimeType('file.PdF')).toBe('application/pdf');
    });

    it('should return default MIME type for unknown extensions', () => {
      expect(getMimeType('file.xyz')).toBe('application/octet-stream');
      expect(getMimeType('file.unknown')).toBe('application/octet-stream');
    });

    it('should return default MIME type for files without extension', () => {
      expect(getMimeType('filename')).toBe('application/octet-stream');
    });

    it('should handle files with multiple dots', () => {
      expect(getMimeType('my.file.name.pdf')).toBe('application/pdf');
    });

    it('should handle paths with directories', () => {
      expect(getMimeType('/path/to/file.pdf')).toBe('application/pdf');
      expect(getMimeType('C:\\Users\\Documents\\file.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
  });

  describe('createMD5Hash', () => {
    it('should create MD5 hash for buffer', () => {
      const buffer = Buffer.from('Hello World');
      const hash = createMD5Hash(buffer);

      expect(hash).toBe('b10a8db164e0754105b7a99be72e3fe5');
      expect(hash).toHaveLength(32); // MD5 is 32 hex characters
    });

    it('should create different hashes for different content', () => {
      const buffer1 = Buffer.from('Content 1');
      const buffer2 = Buffer.from('Content 2');

      const hash1 = createMD5Hash(buffer1);
      const hash2 = createMD5Hash(buffer2);

      expect(hash1).not.toBe(hash2);
    });

    it('should create same hash for same content', () => {
      const buffer1 = Buffer.from('Same content');
      const buffer2 = Buffer.from('Same content');

      const hash1 = createMD5Hash(buffer1);
      const hash2 = createMD5Hash(buffer2);

      expect(hash1).toBe(hash2);
    });

    it('should handle empty buffer', () => {
      const buffer = Buffer.from('');
      const hash = createMD5Hash(buffer);

      expect(hash).toBe('d41d8cd98f00b204e9800998ecf8427e'); // MD5 of empty string
      expect(hash).toHaveLength(32);
    });

    it('should handle binary data', () => {
      const buffer = Buffer.from([0x00, 0xFF, 0x7F, 0x80]);
      const hash = createMD5Hash(buffer);

      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[0-9a-f]{32}$/); // Valid hex
    });

    it('should be deterministic', () => {
      const buffer = Buffer.from('Test data for hashing');

      const hash1 = createMD5Hash(buffer);
      const hash2 = createMD5Hash(buffer);
      const hash3 = createMD5Hash(buffer);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });
  });

  describe('createNoteContent', () => {
    it('should create valid ENML with description and file', () => {
      const description = 'This is a test document';
      const fileName = 'test.pdf';
      const fileHash = 'abc123';

      const result = createNoteContent(description, fileName, fileHash);

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('<!DOCTYPE en-note');
      expect(result).toContain('<en-note>');
      expect(result).toContain('</en-note>');
      expect(result).toContain('<strong>Description:</strong>');
      expect(result).toContain('This is a test document');
      expect(result).toContain('<strong>Attached File:</strong>');
      expect(result).toContain('test.pdf');
    });

    it('should include en-media tag with correct attributes', () => {
      const fileHash = 'abc123def456';
      const result = createNoteContent('Description', 'file.pdf', fileHash);

      expect(result).toContain('<en-media');
      expect(result).toContain(`type="application/pdf"`);
      expect(result).toContain(`hash="${fileHash}"`);
    });

    it('should escape XML in description', () => {
      const description = 'Price: $100 & up, <50% off>';
      const result = createNoteContent(description, 'file.pdf', 'hash');

      expect(result).toContain('Price: $100 &amp; up, &lt;50% off&gt;');
      expect(result).not.toContain('Price: $100 & up');
    });

    it('should escape XML in file name', () => {
      const fileName = 'A&B <report>.pdf';
      const result = createNoteContent('Description', fileName, 'hash');

      expect(result).toContain('A&amp;B &lt;report&gt;.pdf');
      expect(result).not.toContain('A&B <report>');
    });

    it('should use correct MIME type based on file extension', () => {
      const pdfResult = createNoteContent('Desc', 'file.pdf', 'hash');
      expect(pdfResult).toContain('type="application/pdf"');

      const pngResult = createNoteContent('Desc', 'image.png', 'hash');
      expect(pngResult).toContain('type="image/png"');

      const docxResult = createNoteContent('Desc', 'doc.docx', 'hash');
      expect(docxResult).toContain('type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"');
    });

    it('should handle empty description', () => {
      const result = createNoteContent('', 'file.pdf', 'hash');

      expect(result).toContain('<div></div>'); // Empty div after Description
      expect(result).toContain('<en-note>');
    });

    it('should handle long descriptions', () => {
      const longDescription = 'A'.repeat(10000);
      const result = createNoteContent(longDescription, 'file.pdf', 'hash');

      expect(result).toContain(longDescription);
      expect(result).toContain('<en-note>');
      expect(result).toContain('</en-note>');
    });

    it('should handle special characters in all fields', () => {
      const description = '"Quote" & <tag>';
      const fileName = "file's <name>.pdf";
      const result = createNoteContent(description, fileName, 'hash');

      expect(result).toContain('&quot;Quote&quot; &amp; &lt;tag&gt;');
      expect(result).toContain('file&apos;s &lt;name&gt;.pdf');
    });

    it('should maintain ENML structure', () => {
      const result = createNoteContent('Test', 'file.pdf', 'hash');

      // Check structure order
      const xmlIndex = result.indexOf('<?xml');
      const doctypeIndex = result.indexOf('<!DOCTYPE');
      const noteOpenIndex = result.indexOf('<en-note>');
      const noteCloseIndex = result.indexOf('</en-note>');

      expect(xmlIndex).toBeLessThan(doctypeIndex);
      expect(doctypeIndex).toBeLessThan(noteOpenIndex);
      expect(noteOpenIndex).toBeLessThan(noteCloseIndex);
    });
  });

  describe('createResource', () => {
    it('should create resource with correct data', () => {
      const fileData = Buffer.from('Test file content');
      const fileName = 'test.pdf';
      const fileHash = 'abc123';

      const resource = createResource(fileData, fileName, fileHash);

      expect(resource.mime).toBe('application/pdf');
      expect(resource.data?.size).toBe(fileData.length);
      expect(resource.data?.bodyHash).toBe(fileHash);
      expect(resource.data?.body).toBe(fileData);
      expect(resource.attributes?.fileName).toBe(fileName);
    });

    it('should set correct MIME type for different file types', () => {
      const buffer = Buffer.from('data');
      const hash = 'hash';

      expect(createResource(buffer, 'file.pdf', hash).mime).toBe('application/pdf');
      expect(createResource(buffer, 'image.png', hash).mime).toBe('image/png');
      expect(createResource(buffer, 'doc.txt', hash).mime).toBe('text/plain');
    });

    it('should handle empty file', () => {
      const emptyBuffer = Buffer.from('');
      const resource = createResource(emptyBuffer, 'empty.txt', 'hash');

      expect(resource.data?.size).toBe(0);
      expect(resource.data?.body).toEqual(emptyBuffer);
    });

    it('should handle large files', () => {
      const largeBuffer = Buffer.alloc(1024 * 1024); // 1MB
      const resource = createResource(largeBuffer, 'large.pdf', 'hash');

      expect(resource.data?.size).toBe(1024 * 1024);
      expect(resource.data?.body).toBe(largeBuffer);
    });

    it('should handle binary data', () => {
      const binaryBuffer = Buffer.from([0x00, 0xFF, 0x7F, 0x80, 0xAB]);
      const resource = createResource(binaryBuffer, 'binary.dat', 'hash');

      expect(resource.data?.size).toBe(5);
      expect(resource.data?.body).toEqual(binaryBuffer);
    });

    it('should preserve file name exactly', () => {
      const fileName = 'My File (1) [copy].pdf';
      const resource = createResource(Buffer.from('data'), fileName, 'hash');

      expect(resource.attributes?.fileName).toBe(fileName);
    });

    it('should handle file names with special characters', () => {
      const fileName = 'File-name_2024.test.pdf';
      const resource = createResource(Buffer.from('data'), fileName, 'hash');

      expect(resource.attributes?.fileName).toBe(fileName);
    });

    it('should use provided hash without modification', () => {
      const hash = '1a2b3c4d5e6f';
      const resource = createResource(Buffer.from('data'), 'file.pdf', hash);

      expect(resource.data?.bodyHash).toBe(hash);
    });
  });
});
