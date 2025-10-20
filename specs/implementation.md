# Implementation Details

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
const note = new Evernote.Types.Note({
  title: fileName,
  content: enmlContent,
  tagNames: tags,
  resources: [resource]
});

const createdNote = await noteStore.createNote(note);
```

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

  return tagNames;
}
```

**Returns:** Array of strings (tag names only, metadata discarded)

### Tag Validation

```javascript
const validTags = existingTags.length > 0
  ? aiTags.filter(tag => existingTags.includes(tag))
  : aiTags;

// Track filtered tags
const filteredTags = aiTags.filter(tag => !existingTags.includes(tag));
if (verbose && filteredTags.length > 0) {
  console.log(`Filtered out non-existing tags: ${filteredTags.join(', ')}`);
}
```

**Strategy:**
- If existing tags available: filter to only include existing
- If no existing tags: allow all AI-generated tags
- Report filtered tags in verbose mode

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

## Performance Optimizations

### Single Tag Fetch

**Strategy:** Fetch tags once at start of workflow, reuse for analysis
```javascript
const existingTags = await listTags();  // Once per run
const { description, tags } = await analyzeContent(text, fileName, fileType, existingTags);
```

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
