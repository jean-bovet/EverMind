/**
 * ENML Helpers
 * Pure utility functions for working with Evernote Markup Language (ENML)
 * and related file operations.
 */

import crypto from 'crypto';
import path from 'path';
import Evernote from 'evernote';

/**
 * Create ENML content for a note with description and file attachment
 * @param description - AI-generated description of the file
 * @param fileName - Name of the attached file
 * @param fileHash - MD5 hash of the file data
 * @returns ENML string ready for Evernote API
 */
export function createNoteContent(
  description: string,
  fileName: string,
  fileHash: string
): string {
  const mimeType = getMimeType(fileName);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>
  <div><strong>Description:</strong></div>
  <div>${escapeXml(description)}</div>
  <br/>
  <div><strong>Attached File:</strong> ${escapeXml(fileName)}</div>
  <br/>
  <en-media type="${mimeType}" hash="${fileHash}"/>
</en-note>`;
}

/**
 * Create an Evernote resource (attachment) object
 * @param fileData - Raw file data as Buffer
 * @param fileName - Name of the file
 * @param fileHash - MD5 hash of the file data
 * @returns Evernote Resource object
 */
export function createResource(
  fileData: Buffer,
  fileName: string,
  fileHash: string
): Evernote.Types.Resource {
  const mimeType = getMimeType(fileName);

  const data = new Evernote.Types.Data({
    size: fileData.length,
    bodyHash: fileHash,
    body: fileData,
  });

  const resource = new Evernote.Types.Resource({
    mime: mimeType,
    data: data,
    attributes: new Evernote.Types.ResourceAttributes({
      fileName: fileName,
    }),
  });

  return resource;
}

/**
 * Create MD5 hash of file data (Evernote uses MD5 for resource hashing)
 * @param data - Buffer containing file data
 * @returns MD5 hash as hexadecimal string
 */
export function createMD5Hash(data: Buffer): string {
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Get MIME type based on file extension
 * @param fileName - Name of the file (with extension)
 * @returns MIME type string
 */
export function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();

  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/plain',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Escape XML special characters for ENML
 * @param text - Text to escape
 * @returns XML-safe string
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
