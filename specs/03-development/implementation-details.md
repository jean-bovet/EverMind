# Implementation Details

> **Type:** Development Guide
> **Last Updated:** January 2025

## File Extraction Implementation

### PDF Extraction

**Library:** `pdf-parse` v2.4.3

**Implementation:**
```javascript
async function extractPDF(filePath, fileName) {
  const dataBuffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: dataBuffer });

  try {
    const result = await parser.getText();
    return {
      text: result.text,
      fileType: 'pdf',
      fileName: fileName
    };
  } finally {
    await parser.destroy(); // Clean up resources
  }
}
```

**Technical Details:**
- Uses pdf.js under the hood
- Extracts plain text from all pages
- Preserves basic structure (paragraphs, line breaks)
- No formatting information retained
- Resource cleanup via `destroy()` method

**Limitations:**
- Cannot extract text from image-based PDFs (scanned documents)
- No OCR capability for embedded images
- Complex layouts may have reading order issues

### Word Document Extraction

**Library:** `mammoth` v1.11.0

**Implementation:**
```javascript
async function extractWord(filePath, fileName) {
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });

  return {
    text: result.value,
    fileType: 'docx',
    fileName: fileName
  };
}
```

**Technical Details:**
- Parses Office Open XML format (.docx only)
- Extracts raw text without formatting
- Handles tables and lists (flattened to text)
- Ignores headers, footers, and metadata

**Limitations:**
- Only supports .docx (not legacy .doc format)
- Formatting lost in extraction
- Embedded objects (images, charts) ignored

### Text File Extraction

**Implementation:**
```javascript
async function extractText(filePath, fileName) {
  const text = await fs.readFile(filePath, 'utf8');

  return {
    text: text,
    fileType: 'text',
    fileName: fileName
  };
}
```

**Supported Extensions:**
- `.txt` - Plain text
- `.md` - Markdown
- `.markdown` - Markdown variant

**Technical Details:**
- Direct file reading with UTF-8 encoding
- No parsing or transformation
- Preserves all whitespace and formatting characters

### Image OCR Extraction

**Library:** `tesseract.js` v6.0.1

**Implementation:**
```javascript
async function extractImage(filePath, fileName) {
  console.log('Performing OCR on image... This may take a moment.');

  const { data } = await Tesseract.recognize(filePath, 'eng', {
    logger: m => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\rOCR Progress: ${Math.round(m.progress * 100)}%`);
      }
    }
  });

  console.log('\n');

  return {
    text: data.text,
    fileType: 'image',
    fileName: fileName
  };
}
```

**Technical Details:**
- Uses Tesseract OCR engine (compiled to WebAssembly)
- English language only ('eng')
- Progress reporting during recognition
- Confidence scores ignored (all text accepted)

**Performance:**
- Typically 30-60 seconds per image
- Depends on image size and complexity
- CPU-intensive operation

**Accuracy Factors:**
- Image resolution (higher is better)
- Text clarity and contrast
- Font types (printed text works best)
- Background noise and artifacts

---

## AI Analysis Implementation

### Ollama Integration

**Library:** `ollama` v0.6.0

**Connection:**
```javascript
const ollama = new Ollama({ host: ollamaHost });
```

**Model Configuration:**
- Default model: `llama2`
- Configurable via `OLLAMA_MODEL` environment variable
- Alternative options: `mistral`, `llama2:13b`, `codellama`

### Content Truncation

**Strategy:**
```javascript
const maxLength = 4000;
const truncatedText = text.length > maxLength
  ? text.substring(0, maxLength) + '...[truncated]'
  : text;
```

**Rationale:**
- Prevents token limit errors
- Reduces processing time
- First 4000 characters usually contain core content
- Marked with `[truncated]` suffix

### AI Prompt Engineering

**With Existing Tags:**
```
You are analyzing a file named "{fileName}" of type "{fileType}".

File content:
{truncatedText}

Please analyze this content and provide:
1. A concise description (2-3 sentences) of what this file contains
2. Select 3-7 relevant tags from the EXISTING TAGS list below

EXISTING TAGS (you MUST choose ONLY from this list):
{tag1}, {tag2}, {tag3}, ...

IMPORTANT: You MUST select tags ONLY from the existing tags list above. Do NOT create new tags.

Format your response as JSON:
{
  "description": "your description here",
  "tags": ["existing-tag1", "existing-tag2", "existing-tag3"]
}

Respond ONLY with the JSON object, no additional text.
```

**Without Existing Tags:**
```
You are analyzing a file named "{fileName}" of type "{fileType}".

File content:
{truncatedText}

Please analyze this content and provide:
1. A concise description (2-3 sentences) of what this file contains
2. 5-7 relevant tags/keywords that categorize this content

Format your response as JSON:
{
  "description": "your description here",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Respond ONLY with the JSON object, no additional text.
```

### Response Parsing

**Strategy:**
```javascript
function parseAIResponse(response) {
  try {
    // Try to find JSON in the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        description: parsed.description || 'No description provided',
        tags: Array.isArray(parsed.tags) ? parsed.tags : []
      };
    }

    // Fallback: try to parse entire response
    const parsed = JSON.parse(response);
    return {
      description: parsed.description || 'No description provided',
      tags: Array.isArray(parsed.tags) ? parsed.tags : []
    };

  } catch (error) {
    // Ultimate fallback
    return {
      description: response.substring(0, 200) || 'File content analyzed',
      tags: ['document', 'imported']
    };
  }
}
```

**Fallback Hierarchy:**
1. Extract JSON from wrapped response
2. Parse entire response as JSON
3. Use raw text as description with generic tags

---

## Ollama Management Implementation

### Installation Detection

```javascript
async function isOllamaInstalled() {
  try {
    await execAsync('which ollama');
    return true;
  } catch {
    return false;
  }
}
```

**Method:** Checks for `ollama` binary in system PATH

### Service Status Check

```javascript
async function isOllamaRunning(host) {
  try {
    const response = await fetch(`${host}/api/tags`, {
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

**Method:** HTTP request to Ollama API endpoint with 2-second timeout

### Service Startup

```javascript
async function startOllama() {
  ollamaProcess = spawn('ollama', ['serve'], {
    detached: true,
    stdio: 'ignore'
  });

  ollamaProcess.unref();
  startedByUs = true;

  // Wait for service to be ready
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (await isOllamaRunning(host)) {
      return;
    }
  }

  throw new Error('Ollama started but not responding');
}
```

**Technical Details:**
- Spawns `ollama serve` as detached process
- Runs in background (stdio ignored)
- Unreferenced to allow parent process exit
- Polls for 30 seconds until service responds
- State tracked via `startedByUs` flag

### Model Download

```javascript
async function ensureModelAvailable(model, host) {
  const ollama = new Ollama({ host });

  // Check if model exists
  const models = await ollama.list();
  const modelExists = models.models.some(m => m.name === model);

  if (!modelExists) {
    console.log(`Downloading model ${model}... (this may take a while)`);

    const stream = await ollama.pull({ model, stream: true });

    for await (const chunk of stream) {
      if (chunk.status) {
        process.stdout.write(`\r${chunk.status}`);
      }
    }

    console.log('\nModel downloaded successfully');
  }
}
```

**Technical Details:**
- Lists available models via Ollama API
- Initiates streaming pull if model missing
- Shows progress during download
- Models typically 2-7 GB (llama2: ~4GB)
- One-time download (persists across sessions)

### Cleanup

```javascript
function stopOllama() {
  if (startedByUs && ollamaProcess && !ollamaProcess.killed) {
    try {
      ollamaProcess.kill('SIGTERM');
      ollamaProcess = null;
      startedByUs = false;
    } catch (error) {
      // Process may have already exited
    }
  }
}
```

**Strategy:**
- Only stops if we started it (`startedByUs` flag)
- Sends SIGTERM (graceful shutdown)
- Ignores errors if already stopped
- Resets state flags

---

## OAuth Authentication Implementation

### OAuth 1.0a Flow

**Library:** Evernote SDK (includes OAuth support)

**Flow Diagram:**
```
1. Request Token
   ├─> App: Call getRequestToken()
   └─> Evernote: Returns oauth_token + oauth_token_secret

2. User Authorization
   ├─> App: Generate authorization URL
   ├─> User: Visits URL in browser
   ├─> User: Authorizes application
   └─> Evernote: Provides oauth_verifier code

3. Access Token Exchange
   ├─> App: User enters oauth_verifier
   ├─> App: Call getAccessToken()
   └─> Evernote: Returns final oauth_access_token

4. Token Storage
   └─> App: Save access token to .evernote-token
```

### Request Token

```javascript
const requestToken = await new Promise((resolve, reject) => {
  client.getRequestToken(callbackUrl, (error, oauthToken, oauthTokenSecret, results) => {
    if (error) {
      reject(error);
    } else {
      resolve({ oauthToken, oauthTokenSecret, results });
    }
  });
});
```

**Callback URL:** `http://localhost` (not used, but required by Evernote)

### Authorization URL Generation

```javascript
const authorizeUrl = client.getAuthorizeUrl(requestToken.oauthToken);
// Example: https://www.evernote.com/OAuth.action?oauth_token=...
```

**User Action:** Visit URL in browser, authorize, copy verification code

### Access Token Exchange

```javascript
const accessToken = await new Promise((resolve, reject) => {
  client.getAccessToken(
    requestToken.oauthToken,
    requestToken.oauthTokenSecret,
    verifier.trim(),
    (error, oauthAccessToken, oauthAccessTokenSecret, results) => {
      if (error) {
        reject(error);
      } else {
        resolve(oauthAccessToken);
      }
    }
  );
});
```

### Token Persistence

```javascript
async function saveToken(token) {
  await fs.writeFile(TOKEN_FILE, token, 'utf8');
  // TOKEN_FILE = /path/to/project/.evernote-token
}

async function getToken() {
  try {
    const token = await fs.readFile(TOKEN_FILE, 'utf8');
    return token.trim();
  } catch {
    return null;
  }
}
```

**Security:**
- Plain text storage (no encryption)
- Git-ignored to prevent commits
- User-only file permissions (readable by owner)

---

## Evernote Note Creation

### ENML Generation

**ENML (Evernote Markup Language):**
- XML-based format
- Subset of HTML
- Strict validation requirements

**Template:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>
  <div><strong>Description:</strong></div>
  <div>{escaped_description}</div>
  <br/>
  <div><strong>Attached File:</strong> {escaped_fileName}</div>
  <br/>
  <en-media type="{mimeType}" hash="{md5Hash}"/>
</en-note>
```

### XML Escaping

```javascript
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')   // Must be first
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
```

**Critical:** Must escape special characters to prevent XML parsing errors

### Resource Handling

**MD5 Hash Calculation:**
```javascript
function createMD5Hash(data) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(data).digest('hex');
}
```

**Resource Object:**
```javascript
const data = new Evernote.Types.Data({
  size: fileData.length,
  bodyHash: md5Hash,
  body: fileData  // Raw file bytes
});

const resource = new Evernote.Types.Resource({
  mime: mimeType,
  data: data,
  attributes: new Evernote.Types.ResourceAttributes({
    fileName: fileName
  })
});
```

**MIME Type Mapping:**
```javascript
const mimeTypes = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  // ... etc
};
```

### Note Object Creation

```javascript
// Final validation before API call
const validTags = validateTagsForAPI(tags);

// Warn if any tags were filtered
if (validTags.length < tags.length) {
  const invalidTags = tags.filter(tag => !validTags.includes(tag));
  console.warn(`Filtered out ${invalidTags.length} invalid tag(s): ${invalidTags.join(', ')}`);
}

const note = new Evernote.Types.Note({
  title: fileName,
  content: enmlContent,
  tagNames: validTags,  // Use validated tags
  resources: [resource]
});

const createdNote = await noteStore.createNote(note);
```

**Tag Validation Before API:**
- Final safety check before sending to Evernote
- Filters out any invalid tags that slipped through
- Prevents `Tag.name` API errors
- Logs warnings for filtered tags

**Note URL Generation:**
```javascript
const noteUrl = `${endpoint}/Home.action#n=${createdNote.guid}`;
// Example: https://www.evernote.com/Home.action#n=abc-123-def
```

---

## Tag Management Implementation

### Tag Fetching

```javascript
async function listTags() {
  const client = new Evernote.Client({ token, sandbox, serviceHost });
  const noteStore = client.getNoteStore();

  const tags = await noteStore.listTags();
  const tagNames = tags.map(tag => tag.name);

  // Sanitize tags to ensure they meet Evernote requirements
  const sanitized = sanitizeTags(tagNames);

  return sanitized;
}
```

**Returns:** Array of sanitized tag names (metadata discarded)

**Sanitization:** Removes invalid characters, trims whitespace, filters invalid tags

### Tag Validation Implementation

**Tag Validator Module** (`tag-validator.ts`):

```typescript
// Validate single tag name
function isValidTagName(tag: string): boolean {
  if (!tag || typeof tag !== 'string') return false;
  if (tag.length < 1 || tag.length > 100) return false;
  if (tag !== tag.trim()) return false;
  if (tag.includes(',')) return false;

  // Check for control characters, line/paragraph separators
  const invalidCharsRegex = /[\p{Cc}\p{Zl}\p{Zp}]/u;
  if (invalidCharsRegex.test(tag)) return false;

  return true;
}

// Sanitize tag by removing invalid characters
function sanitizeTag(tag: string): string | null {
  if (!tag || typeof tag !== 'string') return null;

  // Remove control characters, line separators, commas
  let sanitized = tag.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, '');
  sanitized = sanitized.replace(/,/g, '');
  sanitized = sanitized.trim();

  if (!sanitized || sanitized.length < 1 || sanitized.length > 100) {
    return null;
  }

  return sanitized;
}

// Filter AI tags against existing Evernote tags
function filterExistingTags(
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
    const sanitized = sanitizeTag(tag);

    if (!sanitized) {
      rejected.push({
        tag: tag,
        reason: 'Invalid format (empty, too long, or contains invalid characters)',
      });
      continue;
    }

    // Check if tag exists (case-insensitive)
    const matchedTag = existingTagsLower.get(sanitized.toLowerCase());

    if (matchedTag) {
      valid.push(matchedTag); // Use exact case from Evernote
    } else {
      rejected.push({
        tag: sanitized,
        reason: 'Tag does not exist in Evernote',
      });
    }
  }

  return { valid, rejected };
}
```

**Strategy:**
- Sanitize AI-generated tags before filtering
- Case-insensitive matching against existing tags
- Return exact case from Evernote
- Only existing tags are used (no new tag creation)
- Provide detailed rejection reasons for better user feedback

**Usage in Application:**

```typescript
// Fetch and filter tags
const existingTags = await listTags(); // Sanitized by listTags()
const { valid: validTags, rejected: rejectedTags } = filterExistingTags(aiTags, existingTags);

// Display warnings for rejected tags
if (rejectedTags.length > 0) {
  console.log('⚠ Rejected tags:');
  rejectedTags.forEach(({ tag, reason }) => {
    console.log(`  • ${tag} - ${reason}`);
  });
}
```

**Batch Optimization:**

For batch processing, tags are fetched once for all files:

```typescript
async function processFolderBatch(folderPath: string) {
  // Fetch tags ONCE for entire batch
  const batchTags = await listTags();

  // Process each file with pre-fetched tags
  for (const file of filesToProcess) {
    await importFile(file, debug, batchTags); // Pass tags
  }
}

async function importFile(
  filePath: string,
  debug: boolean,
  existingTags?: string[] // Optional pre-fetched tags
) {
  // Use pre-fetched tags or fetch if not provided
  const tags = existingTags || await listTags();

  // Use tags for AI analysis and validation
  const { title, description, tags: aiTags } = await analyzeContent(..., tags);
  const { valid } = filterExistingTags(aiTags, tags);
}
```

**Performance Impact:**
- Single file: 1 API call (no change)
- Batch of N files: 1 API call (previously N calls)
- N× reduction in API calls for batches

---

## Error Handling Patterns

### Async/Await with Try-Catch

```javascript
try {
  const result = await somethingAsync();
  return result;
} catch (error) {
  throw new Error(`Operation failed: ${error.message}`);
}
```

### Promise Wrapping for Callbacks

```javascript
const result = await new Promise((resolve, reject) => {
  oldCallbackApi((error, data) => {
    if (error) {
      reject(error);
    } else {
      resolve(data);
    }
  });
});
```

### Resource Cleanup with Finally

```javascript
try {
  const parser = new PDFParse({ data });
  const result = await parser.getText();
  return result;
} finally {
  await parser.destroy();
}
```

### Process Signal Handling

```javascript
process.on('SIGINT', () => {
  console.log('\n\nInterrupted. Cleaning up...');
  stopOllama();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopOllama();
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  console.error(`\n❌ Unexpected error: ${error.message}`);
  stopOllama();
  process.exit(1);
});
```

---

## Upload Queue System Implementation

### Queue File Management

**JSON Storage Location:**
```javascript
function getJSONPath(filePath) {
  return `${filePath}.evernote.json`;
}
// Example: document.pdf → document.pdf.evernote.json
```

**Strategy:** Store JSON alongside source file for easy association and cleanup

### JSON File Lifecycle

**1. File Processing (JSON Creation):**
```javascript
async function saveNoteToJSON(filePath, noteData) {
  const jsonPath = getJSONPath(filePath);

  const queueData = {
    filePath: filePath,
    title: noteData.title,
    description: noteData.description,
    tags: noteData.tags,
    createdAt: new Date().toISOString(),
    lastAttempt: null,
    retryAfter: null
  };

  await fs.writeFile(jsonPath, JSON.stringify(queueData, null, 2), 'utf-8');
  return jsonPath;
}
```

**2. Upload Attempt:**
```javascript
async function uploadNoteFromJSON(jsonPath) {
  const noteData = await loadNoteFromJSON(jsonPath);

  // Skip if already uploaded
  if (noteData.uploadedAt) {
    return { success: true, noteUrl: noteData.noteUrl, alreadyUploaded: true };
  }

  try {
    const noteUrl = await createNote(filePath, title, description, tags);

    // Update JSON with success info (DON'T delete)
    noteData.uploadedAt = new Date().toISOString();
    noteData.noteUrl = noteUrl;
    noteData.lastAttempt = new Date().toISOString();
    noteData.retryAfter = null;
    await fs.writeFile(jsonPath, JSON.stringify(noteData, null, 2), 'utf-8');

    return { success: true, noteUrl: noteUrl };

  } catch (error) {
    // Handle rate limit vs other errors
  }
}
```

**3. On Upload Success:**
- JSON file is **kept** (not deleted)
- `uploadedAt` field added with timestamp
- `noteUrl` field added with Evernote note URL
- `retryAfter` cleared (no longer needed)
- File serves as audit trail and resume marker

**4. On Rate Limit Error:**
```javascript
if (error.errorCode === 19) {
  const retryAfterMs = Date.now() + (rateLimitDuration * 1000);

  noteData.lastAttempt = new Date().toISOString();
  noteData.retryAfter = retryAfterMs;
  await fs.writeFile(jsonPath, JSON.stringify(noteData, null, 2), 'utf-8');

  return { success: false, rateLimitDuration };
}
```

### Rate Limit Detection

**Evernote API Error Structure:**
```javascript
{
  errorCode: 19,                  // Rate limit error code
  rateLimitDuration: 60,          // Seconds to wait
  parameter: "Note.create",       // Which operation was limited
  identifier: "EDAMUserException" // Exception type
}
```

**Detection in evernote-client.js:**
```javascript
catch (error) {
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
}
```

### Retry Logic

**Check if Ready to Retry:**
```javascript
async function shouldRetry(jsonPath) {
  const noteData = await loadNoteFromJSON(jsonPath);

  // No retry time set - can retry
  if (!noteData.retryAfter) return true;

  // Check if enough time has passed
  return Date.now() >= noteData.retryAfter;
}
```

**Retry Pending Uploads:**
```javascript
async function retryPendingUploads(directory) {
  const pendingFiles = await findPendingUploads(directory);

  for (const jsonPath of pendingFiles) {
    if (await shouldRetry(jsonPath)) {
      const result = await uploadNoteFromJSON(jsonPath);
      // Track statistics
    }
  }
}
```

### Finding Pending Uploads

**Strategy:** Only return uploads that haven't completed
```javascript
async function findPendingUploads(directory) {
  const jsonFiles = [];

  async function scan(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        await scan(fullPath); // Recursive
      } else if (entry.name.endsWith('.evernote.json')) {
        // Only include if not yet uploaded
        if (!(await isUploaded(fullPath))) {
          jsonFiles.push(fullPath);
        }
      }
    }
  }

  await scan(directory);
  return jsonFiles.sort();
}
```

**Upload Check:**
```javascript
async function isUploaded(jsonPath) {
  const noteData = await loadNoteFromJSON(jsonPath);
  return !!noteData.uploadedAt;
}
```

### Resume Capability

**Skip Already-Processed Files:**
```javascript
async function importFile(filePath, debug) {
  // Check if file has already been processed
  if (await hasExistingJSON(filePath)) {
    console.log('Skipping already processed file');
    return;
  }

  // Continue with processing...
}
```

**Filter in Batch Processing:**
```javascript
async function processFolderBatch(folderPath) {
  const allFiles = await scanFolderForFiles(folderPath);

  // Filter out already-processed files
  const filesToProcess = [];
  for (const file of allFiles) {
    if (!(await hasExistingJSON(file))) {
      filesToProcess.push(file);
    }
  }

  // Process only new files
  for (const file of filesToProcess) {
    await importFile(file, debug);
  }
}
```

### Wait Loop for Pending Uploads

**Strategy:** Keep retrying until all uploaded or timeout
```javascript
async function waitForPendingUploads(directory, maxWaitTime = 600000) {
  const startTime = Date.now();

  while (true) {
    const pendingFiles = await findPendingUploads(directory);

    if (pendingFiles.length === 0) break; // All done

    if (Date.now() - startTime > maxWaitTime) {
      console.log(`Timeout. ${pendingFiles.length} still pending.`);
      break;
    }

    // Find earliest retry time
    let earliestRetry = null;
    for (const jsonPath of pendingFiles) {
      const noteData = await loadNoteFromJSON(jsonPath);
      if (noteData.retryAfter && (!earliestRetry || noteData.retryAfter < earliestRetry)) {
        earliestRetry = noteData.retryAfter;
      }
    }

    // Try uploads that are ready
    await retryPendingUploads(directory);

    // Wait if needed
    if (earliestRetry) {
      const waitTime = Math.max(0, earliestRetry - Date.now());
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 5000)));
      }
    }
  }
}
```

### Benefits of Queue System

**1. Non-Blocking Processing:**
- File extraction and AI analysis continue even during rate limits
- Only upload step is delayed, not entire workflow
- Maximum throughput for batch operations

**2. Resume Support:**
- Script can be interrupted and restarted safely
- Already-processed files are skipped automatically
- No duplicate AI analysis or Evernote notes

**3. Audit Trail:**
- Complete record of all processed files
- Timestamps for creation, attempts, and success
- Direct links to Evernote notes
- Facilitates troubleshooting and verification

**4. Reliability:**
- Rate limit errors don't stop processing
- Automatic retry with proper timing
- No manual intervention needed
- Graceful degradation on errors

---

## Code Architecture & Pure Functions

### Pure Helper Modules

The codebase uses pure function modules for better testability and maintainability. Pure functions have no side effects, making them easy to test and reuse.

#### ENML Helpers (`electron/evernote/enml-helpers.ts`)

**Purpose:** Pure utility functions for Evernote Markup Language (ENML) generation

**Functions:**
```typescript
// Generate ENML content with description and file attachment
createNoteContent(description: string, fileName: string, fileHash: string): string

// Get MIME type from file extension
getMimeType(fileName: string): string

// Escape XML special characters for ENML
escapeXml(text: string): string

// Create MD5 hash for file data (Evernote requirement)
createMD5Hash(data: Buffer): string

// Create Evernote resource object for attachments
createResource(fileData: Buffer, fileName: string, fileHash: string): Resource
```

**Benefits:**
- **100% test coverage** - All functions thoroughly tested
- **No side effects** - Pure input/output transformations
- **Reusable** - Can be used across different modules
- **Type-safe** - Full TypeScript type definitions

#### Progress Helpers (`electron/processing/progress-helpers.ts`)

**Purpose:** Pure functions for file processing progress calculation and formatting

**Functions:**
```typescript
// Get progress percentage for a processing stage (0-100)
getStageProgress(stage: ProcessingStage): number

// Get user-friendly message for a stage
getStageMessage(stage: ProcessingStage, rateLimitDuration?: number): string

// Create complete progress data object for IPC communication
createProgressData(filePath: string, stage: ProcessingStage, options?): ProgressData

// Extract error message from unknown error types
extractErrorMessage(error: unknown): string

// Format rate limit duration (e.g., "2m 30s")
formatRateLimitDuration(seconds: number): string

// Check if file extension is supported
isSupportedFileType(filename: string): boolean

// Get list of supported extensions
getSupportedExtensions(): string[]
```

**Benefits:**
- **Centralized logic** - All progress-related calculations in one place
- **Consistent formatting** - Same messages across the app
- **Easy testing** - Pure functions with predictable outputs
- **DRY principle** - No duplicate progress/formatting code

#### File State Reducers (`electron/utils/file-state-reducer.ts`)

**Purpose:** Pure state reducer functions for file processing state management

**Functions:**
```typescript
// Update file list based on IPC progress message (immutable)
updateFileFromIPCMessage(files: FileItem[], message: FileProgressData): FileItem[]

// Add new files to the list (immutable)
addFiles(files: FileItem[], newFilePaths: string[]): FileItem[]

// Remove completed files from list (immutable)
removeCompletedFiles(files: FileItem[]): FileItem[]

// Clear all files (returns empty array)
clearAllFiles(): FileItem[]

// Update specific file's status (immutable)
updateFileStatus(files: FileItem[], filePath: string, status: FileStatus, error?: string): FileItem[]
```

**Benefits:**
- **Immutable updates** - Never mutates original arrays
- **Predictable** - Same input always produces same output
- **Testable** - Easy to verify state transformations
- **Redux-style** - Follows functional programming patterns

---

## React Custom Hooks Architecture

The Electron renderer uses custom React hooks to separate concerns and manage complex state logic.

### File Processing Hook (`useFileProcessing.ts`)

**Purpose:** Manages file upload state, IPC subscriptions, and auto-processing

**Responsibilities:**
- Load files from database on mount
- Subscribe to `file-progress` IPC events
- Auto-process pending files using ProcessingScheduler
- Handle file analysis and upload queueing
- Provide retry functionality

**API:**
```typescript
const { files, addFiles, retryFile, reloadFiles } = useFileProcessing(onFileComplete?)

// files: FileItem[] - Current file processing state
// addFiles: (paths: string[]) => void - Add new files to queue
// retryFile: (path: string) => void - Retry failed file
// reloadFiles: () => Promise<void> - Reload from database
// onFileComplete?: () => void - Callback when upload completes
```

### Notebooks Hook (`useNotebooks.ts`)

**Purpose:** Manages notebook selection and notes fetching with React Query

**Responsibilities:**
- Fetch notebooks list via React Query
- Manage selected notebook state
- Fetch notes for selected notebook
- Handle rate limit warnings
- Auto-select default notebook on mount

**API:**
```typescript
const {
  notebooks,
  selectedNotebook,
  setSelectedNotebook,
  notes,
  notesLoading,
  notebooksLoading,
  refetchNotes,
  rateLimitWarning,
  setRateLimitWarning
} = useNotebooks()
```

### Note Augmentation Hook (`useNoteAugmentation.ts`)

**Purpose:** Manages note augmentation progress and IPC communication

**Responsibilities:**
- Track augmentation progress for multiple notes
- Subscribe to `augment-progress` IPC events
- Handle completion and error callbacks
- Update progress state in real-time
- Trigger note list refresh on completion

**API:**
```typescript
const { augmentingNotes, augmentNote } = useNoteAugmentation(
  onComplete?: () => void,
  onRateLimitError?: (error: string) => void
)

// augmentingNotes: Map<noteGuid, { progress, message?, error? }>
// augmentNote: (noteGuid: string) => Promise<void>
```

### Ollama Status Hook (`useOllamaStatus.ts`)

**Purpose:** Checks Ollama installation and manages welcome wizard

**Responsibilities:**
- Check Ollama status on mount
- Manage welcome wizard visibility
- Provide status refresh functionality

**API:**
```typescript
const { ollamaStatus, showWelcome, setShowWelcome, checkOllamaStatus } = useOllamaStatus()

// ollamaStatus: OllamaStatus | null - Installation status
// showWelcome: boolean - Show welcome wizard
// setShowWelcome: (show: boolean) => void
// checkOllamaStatus: () => Promise<void> - Refresh status
```

### Benefits of Custom Hooks

**1. Separation of Concerns**
- Each hook handles one specific domain
- App.tsx reduced from 433 to 191 lines (56% smaller)
- Easier to understand and modify

**2. Reusability**
- Hooks can be used in multiple components
- Logic extracted from components
- Can be tested independently

**3. Better Testing**
- Isolated business logic
- Mock IPC communication easily
- Test state transformations directly

**4. Maintainability**
- Changes localized to specific hooks
- Clear API boundaries
- TypeScript type safety

---

## Performance Optimizations

### Batch Tag Fetching

**Strategy:** Fetch tags once per batch, reuse for all files

**Single File Processing:**
```javascript
// Tags fetched once per file
const existingTags = await listTags();
const { title, description, tags } = await analyzeContent(text, fileName, fileType, existingTags);
```

**Batch Processing:**
```javascript
// Tags fetched ONCE for entire batch
const batchTags = await listTags();  // 1 API call

for (const file of files) {
  // Reuse pre-fetched tags for each file
  await importFile(file, debug, batchTags);  // No API call
}
```

**Performance Improvement:**
- Single file: 1 API call (no change)
- Batch of 50 files: 1 API call (previously 50 calls) → **50× reduction**
- Batch of 100 files: 1 API call (previously 100 calls) → **100× reduction**

### Text Truncation

**Benefit:** Reduces AI processing time and prevents token limit errors
```javascript
const maxLength = 4000;
const truncatedText = text.length > maxLength
  ? text.substring(0, maxLength) + '...[truncated]'
  : text;
```

### Ollama Process Reuse

**Strategy:** Start once, use multiple times if needed, stop at end
- Eliminates startup overhead for batch operations
- Keeps model in memory between operations

### Streaming Progress

**OCR Progress:**
```javascript
logger: m => {
  if (m.status === 'recognizing text') {
    process.stdout.write(`\rOCR Progress: ${Math.round(m.progress * 100)}%`);
  }
}
```

**Model Download Progress:**
```javascript
for await (const chunk of stream) {
  if (chunk.status) {
    process.stdout.write(`\r${chunk.status}`);
  }
}
```

**Benefit:** User feedback during long operations, prevents perceived hanging
