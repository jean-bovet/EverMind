import Evernote from 'evernote';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getToken } from './oauth-helper.js';
import { createSpinner, colors, warning } from './output-formatter.js';
import { sanitizeTags, validateTagsForAPI } from './tag-validator.js';

/**
 * Create a note in Evernote with the file and AI-generated metadata
 * @param filePath - Path to the original file
 * @param title - AI-generated title for the note
 * @param description - AI-generated description
 * @param tags - AI-generated tags
 * @returns URL to the created note
 */
export async function createNote(
  filePath: string,
  title: string,
  description: string,
  tags: string[]
): Promise<string> {
  const token = await getToken();
  const endpoint = process.env['EVERNOTE_ENDPOINT'] || 'https://www.evernote.com';

  if (!token) {
    throw new Error('Not authenticated. Please run: node index.js --auth');
  }

  // Determine if using sandbox
  const serviceHost = endpoint.includes('sandbox') ? 'sandbox.evernote.com' : 'www.evernote.com';

  const client = new Evernote.Client({
    token: token,
    sandbox: serviceHost.includes('sandbox'),
    serviceHost: serviceHost,
  });

  const noteStore = client.getNoteStore();

  const spinner = createSpinner('Creating note in Evernote').start();

  try {
    // Read file data for attachment
    const fileData = await fs.readFile(filePath);
    const fileHash = createMD5Hash(fileData);

    // Extract filename from path for attachment display
    const fileName = path.basename(filePath);

    // Validate and sanitize tags before sending to API
    const validTags = validateTagsForAPI(tags);

    // Warn if any tags were filtered out
    if (validTags.length < tags.length) {
      const invalidTags = tags.filter(tag => !validTags.includes(tag));
      spinner.stop();
      console.warn(warning(`Filtered out ${invalidTags.length} invalid tag(s): ${invalidTags.join(', ')}`));
      spinner.start();
    }

    // Create note with ENML content
    const noteBody = createNoteContent(description, fileName, fileData, fileHash);

    // Create the note object
    const note = new Evernote.Types.Note({
      title: title,
      content: noteBody,
      tagNames: validTags,
    });

    // Create resource (attachment)
    const resource = createResource(fileData, fileName, fileHash);
    note.resources = [resource];

    // Create note in Evernote
    const createdNote = await noteStore.createNote(note);

    const noteUrl = `${endpoint}/Home.action#n=${createdNote.guid}`;

    spinner.succeed('Note created successfully');
    console.log(`  Note GUID: ${colors.muted(createdNote.guid)}`);

    return noteUrl;

  } catch (error: unknown) {
    spinner.fail('Failed to create note');

    // Better error handling for Evernote API errors
    console.error('Evernote API Error:', error);

    // Check if it's a rate limit error (errorCode 19)
    if (
      typeof error === 'object' &&
      error !== null &&
      ('errorCode' in error && error.errorCode === 19 || 'identifier' in error && error.identifier === 'EDAMUserException')
    ) {
      const rateLimitDuration = 'rateLimitDuration' in error && typeof error.rateLimitDuration === 'number'
        ? error.rateLimitDuration
        : 60;

      const errorDetails = {
        errorCode: 'errorCode' in error ? error.errorCode : 19,
        rateLimitDuration: rateLimitDuration,
        parameter: 'parameter' in error ? error.parameter : undefined,
        message: `Rate limit exceeded. Retry after ${rateLimitDuration} seconds.`,
      };
      throw new Error(`Failed to create Evernote note: ${JSON.stringify(errorDetails)}`);
    }

    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'errorMessage' in error
      ? String(error.errorMessage)
      : JSON.stringify(error) || 'Unknown error';

    throw new Error(`Failed to create Evernote note: ${errorMessage}`);
  }
}

/**
 * Create ENML content for the note
 */
function createNoteContent(description: string, fileName: string, _fileData: Buffer, fileHash: string): string {
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
 * Create a resource (attachment) for the note
 */
function createResource(fileData: Buffer, fileName: string, fileHash: string): Evernote.Types.Resource {
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
 */
function createMD5Hash(data: Buffer): string {
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Get MIME type based on file extension
 */
function getMimeType(fileName: string): string {
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
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * List all tags from Evernote
 * @returns Array of tag names
 */
export async function listTags(): Promise<string[]> {
  const token = await getToken();
  const endpoint = process.env['EVERNOTE_ENDPOINT'] || 'https://www.evernote.com';

  if (!token) {
    throw new Error('Not authenticated. Please run: node index.js --auth');
  }

  // Determine if using sandbox
  const serviceHost = endpoint.includes('sandbox') ? 'sandbox.evernote.com' : 'www.evernote.com';

  const client = new Evernote.Client({
    token: token,
    sandbox: serviceHost.includes('sandbox'),
    serviceHost: serviceHost,
  });

  const noteStore = client.getNoteStore();

  try {
    // Fetch all tags
    const tags = await noteStore.listTags();

    // Extract tag names
    const tagNames = tags.map((tag: Evernote.Types.Tag) => tag.name);

    // Sanitize tags to ensure they meet Evernote requirements
    const sanitized = sanitizeTags(tagNames);

    return sanitized;

  } catch (error: unknown) {
    // Better error handling for Evernote API errors
    console.error('Evernote API Error:', error);

    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'errorMessage' in error
      ? String(error.errorMessage)
      : JSON.stringify(error) || 'Unknown error';

    throw new Error(`Failed to list tags: ${errorMessage}`);
  }
}
