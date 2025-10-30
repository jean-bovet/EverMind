import Evernote from 'evernote';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { getToken } from './electron/oauth-helper.js';

// Load environment variables
dotenv.config();

/**
 * Sanitize filename for safe filesystem use
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')  // Replace invalid chars
    .replace(/\s+/g, '-')                      // Replace spaces with dashes
    .replace(/\.+$/, '')                       // Remove trailing dots
    .substring(0, 50)                          // Limit length
    .toLowerCase();
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Test script to verify Evernote API credentials can read notes
 * This will:
 * 1. Connect to Evernote using your OAuth token
 * 2. List all notebooks
 * 3. Find the default notebook
 * 4. Get the first note from that notebook
 * 5. Display note details (title, content, tags, etc.)
 * 6. Download the complete note with attachments
 */
async function testReadNote() {
  console.log('🔍 Testing Evernote API - Read Permissions\n');
  console.log('='.repeat(50));

  try {
    // Step 1: Get OAuth token
    console.log('\n📋 Step 1: Loading OAuth token...');
    const token = await getToken();

    if (!token) {
      console.error('❌ No OAuth token found!');
      console.error('Please authenticate first by running your app and completing OAuth flow.');
      process.exit(1);
    }

    console.log('✅ Token loaded successfully');

    // Step 2: Initialize Evernote client
    console.log('\n📋 Step 2: Connecting to Evernote API...');
    const endpoint = process.env['EVERNOTE_ENDPOINT'] || 'https://www.evernote.com';
    const serviceHost = endpoint.includes('sandbox')
      ? 'sandbox.evernote.com'
      : 'www.evernote.com';

    const client = new Evernote.Client({
      token: token,
      sandbox: serviceHost.includes('sandbox'),
      serviceHost: serviceHost,
    });

    const noteStore = client.getNoteStore();
    console.log(`✅ Connected to ${serviceHost}`);

    // Step 3: List all notebooks
    console.log('\n📋 Step 3: Listing notebooks...');
    const notebooks = await noteStore.listNotebooks();

    console.log(`✅ Found ${notebooks.length} notebook(s):`);
    notebooks.forEach((notebook: Evernote.Types.Notebook, index: number) => {
      const isDefault = notebook.defaultNotebook ? ' [DEFAULT]' : '';
      console.log(`   ${index + 1}. ${notebook.name}${isDefault} (GUID: ${notebook.guid})`);
    });

    // Step 4: Find default notebook
    console.log('\n📋 Step 4: Finding default notebook...');
    const defaultNotebook = notebooks.find(
      (nb: Evernote.Types.Notebook) => nb.defaultNotebook
    );

    if (!defaultNotebook) {
      console.error('❌ No default notebook found!');
      if (notebooks.length > 0) {
        console.log('Using first notebook instead:', notebooks[0].name);
      } else {
        console.error('No notebooks available.');
        process.exit(1);
      }
    }

    const targetNotebook = defaultNotebook || notebooks[0];
    console.log(`✅ Using notebook: "${targetNotebook.name}"`);

    // Step 5: Get first note from notebook
    console.log('\n📋 Step 5: Searching for notes...');

    // Create a search filter for the target notebook
    const filter = new Evernote.NoteStore.NoteFilter({
      notebookGuid: targetNotebook.guid,
      order: Evernote.Types.NoteSortOrder.CREATED,
      ascending: false,
    });

    // Search for notes (get just 1)
    const resultSpec = new Evernote.NoteStore.NotesMetadataResultSpec({
      includeTitle: true,
      includeCreated: true,
      includeUpdated: true,
      includeUpdateSequenceNum: true,
      includeTagGuids: true,
    });

    const notesMetadata = await noteStore.findNotesMetadata(filter, 0, 1, resultSpec);

    if (!notesMetadata.notes || notesMetadata.notes.length === 0) {
      console.log('⚠️  No notes found in this notebook.');
      console.log('Your API key has read permissions, but the notebook is empty.');
      console.log('\n✅ TEST PASSED: API key can read from Evernote!');
      return;
    }

    const noteMetadata = notesMetadata.notes[0];
    console.log(`✅ Found note: "${noteMetadata.title}"`);

    // Step 6: Get full note content
    console.log('\n📋 Step 6: Fetching full note details...');
    const note = await noteStore.getNote(
      noteMetadata.guid!,
      true,  // withContent
      true,  // withResourcesData
      true,  // withResourcesRecognition
      true   // withResourcesAlternateData
    );

    // Step 7: Display note details
    console.log('\n' + '='.repeat(50));
    console.log('📝 NOTE DETAILS');
    console.log('='.repeat(50));

    console.log(`\n📌 Title: ${note.title}`);
    console.log(`🆔 GUID: ${note.guid}`);
    console.log(`📅 Created: ${new Date(note.created!).toLocaleString()}`);
    console.log(`🔄 Updated: ${new Date(note.updated!).toLocaleString()}`);

    if (note.tagNames && note.tagNames.length > 0) {
      console.log(`🏷️  Tags: ${note.tagNames.join(', ')}`);
    } else {
      console.log(`🏷️  Tags: None`);
    }

    if (note.resources && note.resources.length > 0) {
      console.log(`📎 Attachments: ${note.resources.length}`);
      note.resources.forEach((resource: Evernote.Types.Resource, idx: number) => {
        const fileName = resource.attributes?.fileName || 'Unnamed';
        const mimeType = resource.mime || 'unknown';
        const size = resource.data?.size || 0;
        console.log(`   ${idx + 1}. ${fileName} (${mimeType}, ${formatBytes(size)})`);
      });
    } else {
      console.log(`📎 Attachments: None`);
    }

    // Display content preview (first 500 characters)
    console.log(`\n📄 Content Preview:`);
    console.log('-'.repeat(50));
    if (note.content) {
      // Remove ENML tags for readability
      const contentPreview = note.content
        .replace(/<[^>]+>/g, ' ')  // Remove XML tags
        .replace(/\s+/g, ' ')       // Collapse whitespace
        .trim()
        .substring(0, 500);

      console.log(contentPreview);
      if (note.content.length > 500) {
        console.log('\n... (content truncated)');
      }
    } else {
      console.log('(No content)');
    }
    console.log('-'.repeat(50));

    // Step 7: Download note completely
    console.log('\n📋 Step 7: Downloading note completely...');

    // Create folder name
    const sanitizedTitle = sanitizeFilename(note.title || 'untitled');
    const guidPrefix = note.guid!.substring(0, 8);
    const folderName = `downloaded-note-${sanitizedTitle}-${guidPrefix}`;
    const folderPath = path.join(process.cwd(), folderName);

    // Create the folder
    await fs.mkdir(folderPath, { recursive: true });
    console.log(`✅ Created folder: ${folderName}/`);

    const downloadedFiles: string[] = [];

    // Save ENML content
    if (note.content) {
      const contentPath = path.join(folderPath, 'note-content.enml');
      await fs.writeFile(contentPath, note.content, 'utf8');
      downloadedFiles.push('note-content.enml');
      console.log(`✅ Saved ENML content (${formatBytes(note.content.length)})`);
    }

    // Save metadata as JSON
    const metadata = {
      title: note.title,
      guid: note.guid,
      notebookGuid: note.notebookGuid,
      notebookName: targetNotebook.name,
      created: new Date(note.created!).toISOString(),
      updated: new Date(note.updated!).toISOString(),
      tags: note.tagNames || [],
      attachments: note.resources?.map((r: Evernote.Types.Resource) => ({
        filename: r.attributes?.fileName || 'Unnamed',
        mimeType: r.mime || 'unknown',
        size: r.data?.size || 0,
      })) || [],
    };

    const metadataPath = path.join(folderPath, 'note-metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    downloadedFiles.push('note-metadata.json');
    console.log(`✅ Saved metadata`);

    // Download attachments
    if (note.resources && note.resources.length > 0) {
      console.log(`\n📎 Downloading ${note.resources.length} attachment(s)...`);

      for (let i = 0; i < note.resources.length; i++) {
        const resource = note.resources[i];
        let fileName = resource.attributes?.fileName || `attachment-${i + 1}`;

        // Handle duplicate filenames
        let filePath = path.join(folderPath, fileName);
        let counter = 1;
        const baseName = path.parse(fileName).name;
        const ext = path.parse(fileName).ext;

        while (downloadedFiles.includes(path.basename(filePath))) {
          fileName = `${baseName}-${counter}${ext}`;
          filePath = path.join(folderPath, fileName);
          counter++;
        }

        // Write the attachment data
        if (resource.data?.body) {
          await fs.writeFile(filePath, resource.data.body);
          downloadedFiles.push(path.basename(filePath));
          const size = resource.data.size || 0;
          console.log(`   ${i + 1}. ${fileName} (${formatBytes(size)})`);
        }
      }
    }

    // Create README
    const readmeContent = `# Downloaded Evernote Note

Title: ${note.title}
GUID: ${note.guid}
Downloaded: ${new Date().toISOString()}

## Files

${downloadedFiles.map(f => `- ${f}`).join('\n')}

## Note Information

- Notebook: ${targetNotebook.name}
- Created: ${new Date(note.created!).toLocaleString()}
- Updated: ${new Date(note.updated!).toLocaleString()}
- Tags: ${note.tagNames?.join(', ') || 'None'}
- Attachments: ${note.resources?.length || 0}

---
Downloaded using EverMind test script
`;

    const readmePath = path.join(folderPath, 'README.txt');
    await fs.writeFile(readmePath, readmeContent, 'utf8');
    downloadedFiles.push('README.txt');

    // Success message
    console.log('\n' + '='.repeat(50));
    console.log('✅ TEST PASSED: Your API key can READ notes from Evernote!');
    console.log('='.repeat(50));
    console.log('\nPermissions verified:');
    console.log('  ✓ List notebooks');
    console.log('  ✓ Search notes');
    console.log('  ✓ Read note metadata');
    console.log('  ✓ Read note content');
    console.log('  ✓ Read attachments/resources');
    console.log('  ✓ Download complete notes');

    console.log('\n📦 Downloaded note to:');
    console.log(`   ${folderPath}`);
    console.log('\n📄 Files:');
    downloadedFiles.forEach(file => {
      console.log(`   - ${file}`);
    });

  } catch (error: unknown) {
    console.error('\n' + '='.repeat(50));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(50));

    if (error instanceof Error) {
      console.error(`\nError: ${error.message}`);
      console.error(`\nStack: ${error.stack}`);
    } else if (typeof error === 'object' && error !== null) {
      console.error('\nError details:', JSON.stringify(error, null, 2));
    } else {
      console.error('\nUnknown error:', error);
    }

    console.error('\nPossible issues:');
    console.error('  • OAuth token may be invalid or expired');
    console.error('  • API key may not have read permissions');
    console.error('  • Network connectivity issues');
    console.error('  • Evernote API may be down');

    process.exit(1);
  }
}

// Run the test
testReadNote();
