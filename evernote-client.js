const Evernote = require('evernote');
const fs = require('fs').promises;
const path = require('path');
const { getToken } = require('./oauth-helper');
const { createSpinner, success, colors } = require('./output-formatter');

/**
 * Create a note in Evernote with the file and AI-generated metadata
 * @param {string} filePath - Path to the original file
 * @param {string} title - AI-generated title for the note
 * @param {string} description - AI-generated description
 * @param {string[]} tags - AI-generated tags
 * @returns {Promise<string>} - URL to the created note
 */
async function createNote(filePath, title, description, tags) {
  const token = await getToken();
  const endpoint = process.env.EVERNOTE_ENDPOINT || 'https://www.evernote.com';

  if (!token) {
    throw new Error('Not authenticated. Please run: node index.js --auth');
  }

  // Determine if using sandbox
  const serviceHost = endpoint.includes('sandbox') ? 'sandbox.evernote.com' : 'www.evernote.com';

  const client = new Evernote.Client({
    token: token,
    sandbox: serviceHost.includes('sandbox'),
    serviceHost: serviceHost
  });

  const noteStore = client.getNoteStore();

  const spinner = createSpinner('Creating note in Evernote').start();

  try {
    // Read file data for attachment
    const fileData = await fs.readFile(filePath);
    const fileHash = createMD5Hash(fileData);

    // Extract filename from path for attachment display
    const fileName = path.basename(filePath);

    // Create note with ENML content
    const noteBody = createNoteContent(description, fileName, fileData, fileHash);

    // Create the note object
    const note = new Evernote.Types.Note({
      title: title,
      content: noteBody,
      tagNames: tags
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

  } catch (error) {
    spinner.fail('Failed to create note');

    // Better error handling for Evernote API errors
    console.error('Evernote API Error:', error);

    // Check if it's a rate limit error (errorCode 19)
    if (error.errorCode === 19 || error.identifier === 'EDAMUserException') {
      const rateLimitDuration = error.rateLimitDuration || 60;
      const errorDetails = {
        errorCode: error.errorCode,
        rateLimitDuration: rateLimitDuration,
        parameter: error.parameter,
        message: `Rate limit exceeded. Retry after ${rateLimitDuration} seconds.`
      };
      throw new Error(`Failed to create Evernote note: ${JSON.stringify(errorDetails)}`);
    }

    const errorMessage = error.message ||
                         error.errorMessage ||
                         JSON.stringify(error) ||
                         'Unknown error';

    throw new Error(`Failed to create Evernote note: ${errorMessage}`);
  }
}

/**
 * Create ENML content for the note
 */
function createNoteContent(description, fileName, fileData, fileHash) {
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
function createResource(fileData, fileName, fileHash) {
  const mimeType = getMimeType(fileName);

  const data = new Evernote.Types.Data({
    size: fileData.length,
    bodyHash: fileHash,
    body: fileData
  });

  const resource = new Evernote.Types.Resource({
    mime: mimeType,
    data: data,
    attributes: new Evernote.Types.ResourceAttributes({
      fileName: fileName
    })
  });

  return resource;
}

/**
 * Create MD5 hash of file data (Evernote uses MD5 for resource hashing)
 */
function createMD5Hash(data) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Get MIME type based on file extension
 */
function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();

  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/plain',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff'
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Escape XML special characters for ENML
 */
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * List all tags from Evernote
 * @returns {Promise<string[]>} - Array of tag names
 */
async function listTags() {
  const token = await getToken();
  const endpoint = process.env.EVERNOTE_ENDPOINT || 'https://www.evernote.com';

  if (!token) {
    throw new Error('Not authenticated. Please run: node index.js --auth');
  }

  // Determine if using sandbox
  const serviceHost = endpoint.includes('sandbox') ? 'sandbox.evernote.com' : 'www.evernote.com';

  const client = new Evernote.Client({
    token: token,
    sandbox: serviceHost.includes('sandbox'),
    serviceHost: serviceHost
  });

  const noteStore = client.getNoteStore();

  try {
    // Fetch all tags
    const tags = await noteStore.listTags();

    // Extract tag names
    const tagNames = tags.map(tag => tag.name);

    return tagNames;

  } catch (error) {
    // Better error handling for Evernote API errors
    console.error('Evernote API Error:', error);

    const errorMessage = error.message ||
                         error.errorMessage ||
                         JSON.stringify(error) ||
                         'Unknown error';

    throw new Error(`Failed to list tags: ${errorMessage}`);
  }
}

module.exports = {
  createNote,
  listTags
};
