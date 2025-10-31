import Evernote from 'evernote';
import { promises as fs } from 'fs';
import path from 'path';
import { getToken } from './oauth-helper.js';
import { sanitizeTags, validateTagsForAPI } from './tag-validator.js';
import { mergeNoteAttributes } from '../utils/note-helpers.js';
import {
  createNoteContent,
  createResource,
  createMD5Hash
} from './enml-helpers.js';
import { EVERNOTE_ENDPOINT } from '../config/runtime-config.js';

/**
 * Create a note in Evernote with the file and AI-generated metadata
 * @param filePath - Path to the original file
 * @param title - AI-generated title for the note
 * @param description - AI-generated description
 * @param tags - AI-generated tags
 * @returns Object with URL and GUID of the created note
 */
export async function createNote(
  filePath: string,
  title: string,
  description: string,
  tags: string[]
): Promise<{ noteUrl: string; noteGuid: string }> {
  const token = await getToken();
  const endpoint = EVERNOTE_ENDPOINT;

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

  console.log('Creating note in Evernote...');

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
      console.warn(`Filtered out ${invalidTags.length} invalid tag(s): ${invalidTags.join(', ')}`);
    }

    // Create note with ENML content
    const noteBody = createNoteContent(description, fileName, fileHash);

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

    console.log('Note created successfully');
    console.log(`Note GUID: ${createdNote.guid}`);

    return { noteUrl, noteGuid: createdNote.guid };

  } catch (error: unknown) {
    console.error('Failed to create note');

    // Better error handling for Evernote API errors
    console.error('Evernote API Error:', error);

    // Check for error code 19 (can be either RTE conflict or rate limit)
    if (
      typeof error === 'object' &&
      error !== null &&
      'errorCode' in error &&
      error.errorCode === 19
    ) {
      const errorMessage = 'message' in error && typeof error.message === 'string'
        ? error.message
        : '';

      // Check if it's an RTE room conflict - preserve original error for detection
      if (errorMessage.includes('RTE room') || errorMessage.includes('already been open')) {
        throw error;  // Re-throw original error to preserve error details
      }

      // Otherwise, it's a rate limit error
      const rateLimitDuration = 'rateLimitDuration' in error && typeof error.rateLimitDuration === 'number'
        ? error.rateLimitDuration
        : 60;

      const errorDetails = {
        errorCode: 19,
        rateLimitDuration: rateLimitDuration,
        parameter: 'parameter' in error ? error.parameter : undefined,
        message: `Rate limit exceeded. Retry after ${rateLimitDuration} seconds.`,
      };
      throw new Error(`Failed to create Evernote note: ${JSON.stringify(errorDetails)}`);
    }

    // Check for other EDAMUserException errors
    if (
      typeof error === 'object' &&
      error !== null &&
      'identifier' in error &&
      error.identifier === 'EDAMUserException'
    ) {
      const errorMessage = 'message' in error && typeof error.message === 'string'
        ? error.message
        : 'Unknown EDAMUserException';
      throw new Error(`Failed to create Evernote note: ${errorMessage}`);
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
 * List all notebooks from Evernote
 * @returns Array of notebooks with names and GUIDs
 */
export async function listNotebooks(): Promise<Evernote.Types.Notebook[]> {
  const token = await getToken();
  const endpoint = EVERNOTE_ENDPOINT;

  if (!token) {
    throw new Error('Not authenticated. Please run OAuth authentication first');
  }

  const serviceHost = endpoint.includes('sandbox') ? 'sandbox.evernote.com' : 'www.evernote.com';

  const client = new Evernote.Client({
    token: token,
    sandbox: serviceHost.includes('sandbox'),
    serviceHost: serviceHost,
  });

  const noteStore = client.getNoteStore();

  try {
    const notebooks = await noteStore.listNotebooks();
    return notebooks;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'errorMessage' in error
      ? String(error.errorMessage)
      : JSON.stringify(error) || 'Unknown error';

    throw new Error(`Failed to list notebooks: ${errorMessage}`);
  }
}

/**
 * List notes in a specific notebook
 * @param notebookGuid - GUID of the notebook
 * @param offset - Starting index for pagination (default: 0)
 * @param limit - Maximum number of notes to return (default: 50)
 * @returns Array of note metadata
 */
export async function listNotesInNotebook(
  notebookGuid: string,
  offset: number = 0,
  limit: number = 50
): Promise<Evernote.NoteStore.NoteMetadata[]> {
  const token = await getToken();
  const endpoint = EVERNOTE_ENDPOINT;

  if (!token) {
    throw new Error('Not authenticated. Please run OAuth authentication first');
  }

  const serviceHost = endpoint.includes('sandbox') ? 'sandbox.evernote.com' : 'www.evernote.com';

  const client = new Evernote.Client({
    token: token,
    sandbox: serviceHost.includes('sandbox'),
    serviceHost: serviceHost,
  });

  const noteStore = client.getNoteStore();

  try {
    // Create filter for the notebook
    const filter = new Evernote.NoteStore.NoteFilter({
      notebookGuid: notebookGuid,
      order: Evernote.Types.NoteSortOrder.UPDATED,
      ascending: false
    });

    // Specify what metadata to include
    const resultSpec = new Evernote.NoteStore.NotesMetadataResultSpec({
      includeTitle: true,
      includeCreated: true,
      includeUpdated: true,
      includeTagGuids: true,
      includeAttributes: true,
      includeContentLength: true
    });

    const notesMetadata = await noteStore.findNotesMetadata(filter, offset, limit, resultSpec);

    return notesMetadata.notes || [];
  } catch (error: unknown) {
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'errorMessage' in error
      ? String(error.errorMessage)
      : JSON.stringify(error) || 'Unknown error';

    throw new Error(`Failed to list notes in notebook: ${errorMessage}`);
  }
}

/**
 * Get full note content including resources
 * @param noteGuid - GUID of the note to retrieve
 * @returns Complete note with content and resources
 */
export async function getNoteWithContent(noteGuid: string): Promise<Evernote.Types.Note> {
  const token = await getToken();
  const endpoint = EVERNOTE_ENDPOINT;

  if (!token) {
    throw new Error('Not authenticated. Please run OAuth authentication first');
  }

  const serviceHost = endpoint.includes('sandbox') ? 'sandbox.evernote.com' : 'www.evernote.com';

  const client = new Evernote.Client({
    token: token,
    sandbox: serviceHost.includes('sandbox'),
    serviceHost: serviceHost,
  });

  const noteStore = client.getNoteStore();

  try {
    // Get note with all content
    const note = await noteStore.getNote(
      noteGuid,
      true,  // withContent
      true,  // withResourcesData
      true,  // withResourcesRecognition
      true   // withResourcesAlternateData
    );

    return note;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'errorMessage' in error
      ? String(error.errorMessage)
      : JSON.stringify(error) || 'Unknown error';

    throw new Error(`Failed to get note: ${errorMessage}`);
  }
}

/**
 * Update an existing note's content and/or attributes
 * @param noteGuid - GUID of the note to update
 * @param updatedContent - New ENML content (optional)
 * @param updatedAttributes - New attributes (optional)
 * @param updatedTitle - New title (optional)
 * @param updatedTags - New tags (optional)
 * @returns Updated note
 */
export async function updateNote(
  noteGuid: string,
  updatedContent?: string,
  updatedAttributes?: Partial<Evernote.Types.NoteAttributes>,
  updatedTitle?: string,
  updatedTags?: string[]
): Promise<Evernote.Types.Note> {
  const token = await getToken();
  const endpoint = EVERNOTE_ENDPOINT;

  if (!token) {
    throw new Error('Not authenticated. Please run OAuth authentication first');
  }

  const serviceHost = endpoint.includes('sandbox') ? 'sandbox.evernote.com' : 'www.evernote.com';

  const client = new Evernote.Client({
    token: token,
    sandbox: serviceHost.includes('sandbox'),
    serviceHost: serviceHost,
  });

  const noteStore = client.getNoteStore();

  try {
    console.log(`  Updating note ${noteGuid}...`);

    // First, get the current note to get the update sequence number and attributes
    const currentNote = await noteStore.getNote(noteGuid, false, false, false, false);

    // Create note object with updates
    const noteToUpdate = new Evernote.Types.Note({
      guid: noteGuid,
      title: updatedTitle || currentNote.title, // Use new title if provided
      updateSequenceNum: currentNote.updateSequenceNum,
      tagNames: updatedTags // Add tags if provided
    });

    // Update content if provided
    if (updatedContent) {
      noteToUpdate.content = updatedContent;
      console.log(`  ✓ Updated note content (${updatedContent.length} bytes)`);
    }

    // Update attributes if provided
    if (updatedAttributes) {
      const mergedAttributes = mergeNoteAttributes(currentNote.attributes, updatedAttributes);

      if (updatedAttributes.applicationData) {
        console.log(`  ✓ Merged applicationData:`, mergedAttributes.applicationData);
      }

      noteToUpdate.attributes = new Evernote.Types.NoteAttributes(mergedAttributes);
    }

    // Perform the update
    console.log(`  Uploading to Evernote...`);
    const updatedNote = await noteStore.updateNote(noteToUpdate);
    console.log(`  ✓ Note updated successfully (updateSequenceNum: ${updatedNote.updateSequenceNum})`);

    return updatedNote;
  } catch (error: unknown) {
    console.error('  ✗ Failed to update note:', error);

    // Check for error code 19 (can be either RTE conflict or rate limit)
    if (
      typeof error === 'object' &&
      error !== null &&
      'errorCode' in error &&
      error.errorCode === 19
    ) {
      const errorMessage = 'message' in error && typeof error.message === 'string'
        ? error.message
        : '';

      // Check if it's an RTE room conflict - preserve original error for detection
      if (errorMessage.includes('RTE room') || errorMessage.includes('already been open')) {
        throw error;  // Re-throw original error to preserve error details
      }

      // Otherwise, it's a rate limit error
      const rateLimitDuration = 'rateLimitDuration' in error && typeof error.rateLimitDuration === 'number'
        ? error.rateLimitDuration
        : 60;

      throw new Error(`Rate limit exceeded. Retry after ${rateLimitDuration} seconds.`);
    }

    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'errorMessage' in error
      ? String(error.errorMessage)
      : JSON.stringify(error) || 'Unknown error';

    throw new Error(`Failed to update note: ${errorMessage}`);
  }
}

/**
 * Get note's application data (custom attributes)
 * @param noteGuid - GUID of the note
 * @returns Application data key-value pairs
 */
export async function getNoteApplicationData(noteGuid: string): Promise<Record<string, string>> {
  const token = await getToken();
  const endpoint = EVERNOTE_ENDPOINT;

  if (!token) {
    throw new Error('Not authenticated. Please run OAuth authentication first');
  }

  const serviceHost = endpoint.includes('sandbox') ? 'sandbox.evernote.com' : 'www.evernote.com';

  const client = new Evernote.Client({
    token: token,
    sandbox: serviceHost.includes('sandbox'),
    serviceHost: serviceHost,
  });

  const noteStore = client.getNoteStore();

  try {
    // Get note with attributes
    const note = await noteStore.getNote(noteGuid, false, false, false, false);

    return note.attributes?.applicationData || {};
  } catch (error: unknown) {
    const errorMessage = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'errorMessage' in error
      ? String(error.errorMessage)
      : JSON.stringify(error) || 'Unknown error';

    throw new Error(`Failed to get note attributes: ${errorMessage}`);
  }
}

/**
 * List all tags from Evernote
 * @returns Array of tag names
 */
export async function listTags(): Promise<string[]> {
  const token = await getToken();
  const endpoint = EVERNOTE_ENDPOINT;

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

/**
 * Check if a note exists in Evernote by its GUID
 * @param noteGuid - GUID of the note to check
 * @returns true if note exists, false otherwise
 */
export async function checkNoteExists(noteGuid: string): Promise<boolean> {
  const token = await getToken();
  const endpoint = EVERNOTE_ENDPOINT;

  if (!token) {
    throw new Error('Not authenticated. Please run OAuth authentication first');
  }

  const serviceHost = endpoint.includes('sandbox') ? 'sandbox.evernote.com' : 'www.evernote.com';

  const client = new Evernote.Client({
    token: token,
    sandbox: serviceHost.includes('sandbox'),
    serviceHost: serviceHost,
  });

  const noteStore = client.getNoteStore();

  try {
    // Try to get just the note metadata (no content needed)
    await noteStore.getNote(noteGuid, false, false, false, false);
    return true;
  } catch (error: unknown) {
    // If error is "note not found", return false
    // Otherwise, log and return false to be safe
    if (
      typeof error === 'object' &&
      error !== null &&
      'identifier' in error &&
      (error.identifier === 'EDAMNotFoundException' ||
       ('errorCode' in error && error.errorCode === 2))
    ) {
      return false;
    }

    // For other errors (auth, network, etc), log and return false
    console.warn(`Error checking note existence for ${noteGuid}:`, error);
    return false;
  }
}
