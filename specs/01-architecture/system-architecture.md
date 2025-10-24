# System Architecture (Historical)

> **⚠️ DEPRECATED:** This document describes the legacy CLI-based architecture. The application is now Electron-only. See [Electron Architecture](electron-architecture.md) for current architecture.

> **Type:** Architecture (Historical)
> **Last Updated:** January 2025

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                          │
│                    (Command Line - index.js)                    │
└────────────┬────────────────────────────────────────────────────┘
             │
             │ Commands: --auth, --list-tags, <file-path>
             │
┌────────────▼────────────────────────────────────────────────────┐
│                      Application Core                           │
│                         (index.js)                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ - Command routing                                         │  │
│  │ - Workflow orchestration                                 │  │
│  │ - Error handling                                         │  │
│  │ - Resource cleanup                                       │  │
│  └──────────────────────────────────────────────────────────┘  │
└──┬────────┬────────────┬──────────────┬──────────────┬─────────┘
   │        │            │              │              │
   │        │            │              │              │
┌──▼──┐ ┌──▼──┐  ┌──────▼───────┐ ┌────▼─────┐ ┌────▼─────────┐ ┌────▼─────────┐ ┌────▼────────┐
│Auth │ │File │  │AI Analyzer   │ │Upload    │ │Evernote  │ │Ollama        │ │Tag          │
│Mgmt │ │Extr │  │              │ │Queue     │ │Client    │ │Manager       │ │Validator    │
└──┬──┘ └──┬──┘  └──────┬───────┘ └────┬─────┘ └────┬─────┘ └────┬─────────┘ └────┬────────┘
   │        │            │              │              │              │
   │        │            │              │              │              │
   ▼        ▼            ▼              ▼              ▼              ▼
┌─────┐ ┌──────┐  ┌──────────┐   ┌──────────┐  ┌──────────┐  ┌──────────┐
│.env │ │Files │  │ Ollama   │   │.evernote │  │Evernote  │  │ Ollama   │
│Token│ │(.pdf │  │ Service  │   │.json     │  │   API    │  │ Process  │
│     │ │.docx)│  │(Local AI)│   │(Queue)   │  │(Cloud)   │  │          │
└─────┘ └──────┘  └──────────┘   └──────────┘  └──────────┘  └──────────┘
```

## Component Breakdown

### 1. index.js - Application Core & CLI

**Responsibilities:**
- Parse command-line arguments using Commander.js
- Route commands to appropriate handlers
- Orchestrate the main import workflow
- Handle errors and cleanup
- Manage process lifecycle (SIGINT, SIGTERM)

**Key Functions:**
- `importFile(filePath, verbose)` - Main file import orchestration
- Command handlers for --auth, --logout, --list-tags
- Process signal handlers for cleanup

**Dependencies:**
- All other application modules
- commander (CLI framework)
- dotenv (environment variables)

### 2. oauth-helper.js - Authentication Manager

**Responsibilities:**
- Manage OAuth 1.0a authentication flow with Evernote
- Store and retrieve OAuth access tokens
- Handle interactive user authorization

**Key Functions:**
- `authenticate()` - Complete OAuth flow
- `hasToken()` - Check if token exists
- `getToken()` - Retrieve stored token
- `saveToken(token)` - Persist token to disk
- `removeToken()` - Logout functionality
- `askQuestion(question)` - Interactive CLI prompts

**Data Storage:**
- `.evernote-token` file (plain text, git-ignored)

**Security Considerations:**
- Token file has user-only read permissions
- Never logged or transmitted except to Evernote
- File excluded from version control

### 3. file-extractor.js - Content Extraction

**Responsibilities:**
- Detect file type by extension
- Extract text content from various formats
- Handle extraction errors gracefully

**Key Functions:**
- `extractFileContent(filePath)` - Main entry point
- `extractPDF(filePath, fileName)` - PDF parsing
- `extractText(filePath, fileName)` - Plain text reading
- `extractWord(filePath, fileName)` - DOCX parsing
- `extractImage(filePath, fileName)` - OCR processing

**Supported Formats:**
```javascript
{
  '.pdf': extractPDF,
  '.txt': extractText,
  '.md': extractText,
  '.markdown': extractText,
  '.docx': extractWord,
  '.png': extractImage,
  '.jpg': extractImage,
  '.jpeg': extractImage,
  '.gif': extractImage,
  '.bmp': extractImage,
  '.tiff': extractImage
}
```

**Output Format:**
```javascript
{
  text: string,      // Extracted text content
  fileType: string,  // Type identifier (pdf, text, docx, image)
  fileName: string   // Original file name
}
```

### 4. ai-analyzer.js - AI Content Analysis

**Responsibilities:**
- Connect to local Ollama instance
- Ensure Ollama readiness (via ollama-manager)
- Generate content descriptions using AI
- Select relevant tags from existing Evernote tags
- Parse and validate AI responses

**Key Functions:**
- `analyzeContent(text, fileName, fileType, existingTags)` - Main analysis
- `parseAIResponse(response)` - Parse JSON from AI

**AI Prompt Strategy:**
- When existingTags provided: Instructs AI to select only from provided tags
- When no existingTags: Allows AI to generate new tags
- Requests structured JSON output for easy parsing

**Output Format:**
```javascript
{
  description: string,  // 2-3 sentence summary
  tags: string[]        // Array of relevant tags
}
```

**Fallback Behavior:**
- If JSON parsing fails, extracts description from raw text
- Returns generic tags: ['document', 'imported']

### 5. ollama-manager.js - Ollama Service Manager

**Responsibilities:**
- Detect Ollama installation
- Check if Ollama is running
- Start Ollama when needed
- Download models on first use
- Stop Ollama when done (if we started it)
- Track startup state

**Key Functions:**
- `ensureOllamaReady(model, host)` - Main entry point
- `isOllamaInstalled()` - Check installation
- `isOllamaRunning(host)` - Check if service is up
- `startOllama()` - Start Ollama service
- `ensureModelAvailable(model, host)` - Download if needed
- `stopOllama()` - Cleanup function
- `wasOllamaStartedByUs()` - State tracker

**State Management:**
- Tracks whether Ollama was started by this app
- Only stops Ollama if we started it
- Respects user's running instances

### 6. upload-queue.js - Upload Queue Manager

**Responsibilities:**
- Manage upload queue through JSON files stored alongside source files
- Decouple file processing from Evernote upload
- Handle Evernote API rate limiting gracefully
- Track upload status and retry failed uploads
- Enable resume capability after interruption

**Key Functions:**
- `saveNoteToJSON(filePath, noteData)` - Save note metadata to JSON
- `loadNoteFromJSON(jsonPath)` - Load note data from JSON
- `uploadNoteFromJSON(jsonPath)` - Upload to Evernote and update JSON
- `hasExistingJSON(filePath)` - Check if file has been processed
- `isUploaded(jsonPath)` - Check if upload completed successfully
- `findPendingUploads(directory)` - Find all pending JSON files
- `retryPendingUploads(directory)` - Retry uploads that are ready
- `waitForPendingUploads(directory, maxWaitTime)` - Wait for all uploads to complete

**JSON File Format** (saved as `filename.ext.evernote.json`):
```json
{
  "filePath": "/absolute/path/to/file.pdf",
  "title": "AI-generated title",
  "description": "AI-generated description",
  "tags": ["tag1", "tag2", "tag3"],
  "createdAt": "2025-10-20T10:00:00Z",
  "lastAttempt": "2025-10-20T10:05:00Z",
  "retryAfter": 1729450000000,
  "uploadedAt": "2025-10-20T10:05:00Z",
  "noteUrl": "https://www.evernote.com/Home.action#n=..."
}
```

**Rate Limit Handling:**
- Parses Evernote rate limit errors (error code 19)
- Extracts `rateLimitDuration` from error response
- Updates JSON with `retryAfter` timestamp
- Continues processing other files without blocking
- Automatically retries after rate limit expires

**Resume Capability:**
- JSON files persist after successful upload
- Restarting script skips files with existing JSON
- `uploadedAt` field marks completed uploads
- Only pending uploads (no `uploadedAt`) are retried
- Complete audit trail of all processed files

### 7. evernote-client.js - Evernote API Integration

**Responsibilities:**
- Create notes with attachments in Evernote
- List existing tags from Evernote (with sanitization)
- Generate ENML (Evernote Markup Language) content
- Handle file attachments and resources
- Parse and return rate limit errors with retry information
- Validate tags before API calls

**Key Functions:**
- `createNote(filePath, fileName, description, tags)` - Create note with tag validation
- `listTags()` - Fetch and sanitize user tags
- `createNoteContent(description, fileName, fileData, fileHash)` - Generate ENML
- `createResource(fileData, fileName, fileHash)` - Prepare attachment
- `createMD5Hash(data)` - Hash for resource identification
- `getMimeType(fileName)` - Determine file MIME type
- `escapeXml(text)` - Sanitize text for ENML

### 8. tag-validator.ts - Tag Validation Utility

**Responsibilities:**
- Validate tag names against Evernote API requirements
- Sanitize tags by removing invalid characters
- Filter AI-generated tags against existing Evernote tags
- Prevent creation of new tags (strict existing-only policy)
- Case-insensitive tag matching

**Key Functions:**
- `isValidTagName(tag)` - Check if tag meets Evernote requirements
- `sanitizeTag(tag)` - Clean tag by removing invalid characters
- `filterExistingTags(tags, existingTags)` - Filter and match against existing tags
- `sanitizeTags(tags)` - Clean array of tags
- `validateTagsForAPI(tags)` - Final validation before API call

**Evernote Tag Requirements:**
- Length: 1-100 characters
- No commas (`,`)
- No leading or trailing whitespace
- No control characters or line/paragraph separators
- Case-insensitive uniqueness

**Filtering Strategy:**
- Case-insensitive matching against existing tags
- Returns exact case from Evernote
- Rejects tags that don't exist in Evernote
- Provides detailed rejection reasons

**ENML Structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>
  <div><strong>Description:</strong></div>
  <div>{escaped description}</div>
  <br/>
  <div><strong>Attached File:</strong> {fileName}</div>
  <br/>
  <en-media type="{mimeType}" hash="{md5Hash}"/>
</en-note>
```

**Resource Handling:**
- Files attached as Evernote Resources
- MD5 hash used for resource identification
- MIME type determined from file extension
- Resource linked in note via `<en-media>` tag

**Error Handling:**
- Detects rate limit errors (errorCode 19)
- Extracts `rateLimitDuration` from error
- Returns structured error with retry information
- Preserves other error details for debugging

## Data Flow

### Authentication Flow

```
User runs: node index.js --auth
    │
    ├─> oauth-helper.authenticate()
    │
    ├─> Get request token from Evernote
    │
    ├─> Display authorization URL to user
    │
    ├─> User visits URL, authorizes app
    │
    ├─> User provides verification code
    │
    ├─> Exchange code for access token
    │
    ├─> Save token to .evernote-token
    │
    └─> Authentication complete
```

### File Import Flow (Single File)

```
User runs: node index.js /path/to/file.pdf
    │
    ├─> index.js: Parse arguments
    │
    ├─> index.js: Check authentication
    │   └─> oauth-helper.hasToken()
    │
    ├─> upload-queue.hasExistingJSON()
    │   └─> If JSON exists: Skip (already processed)
    │
    ├─> ollama-manager.ensureOllamaReady()
    │   ├─> Check installation
    │   ├─> Check if running
    │   ├─> Start if needed
    │   └─> Download model if needed
    │
    ├─> evernote-client.listTags()
    │   ├─> Fetch existing tags from Evernote API
    │   └─> Sanitize tags using tag-validator
    │
    ├─> file-extractor.extractFileContent()
    │   ├─> Detect file type
    │   ├─> Call appropriate extractor
    │   └─> Return {text, fileType, fileName}
    │
    ├─> ai-analyzer.analyzeContent()
    │   ├─> Send content + existing tags to Ollama
    │   ├─> AI generates title, description and selects tags
    │   ├─> Parse JSON response
    │   └─> Return {title, description, tags}
    │
    ├─> tag-validator.filterExistingTags()
    │   ├─> Sanitize AI-generated tags
    │   ├─> Match against existing tags (case-insensitive)
    │   ├─> Return {valid, rejected} with reasons
    │   └─> Keep only tags that exist in Evernote
    │
    ├─> upload-queue.saveNoteToJSON()
    │   └─> Save {title, description, tags} to .evernote.json
    │
    ├─> upload-queue.uploadNoteFromJSON()
    │   ├─> evernote-client.createNote()
    │   │   ├─> Read file data
    │   │   ├─> Create MD5 hash
    │   │   ├─> Generate ENML content
    │   │   ├─> Create Resource object
    │   │   ├─> Create Note object
    │   │   └─> Call Evernote API
    │   │
    │   ├─> On Success:
    │   │   ├─> Update JSON with uploadedAt & noteUrl
    │   │   └─> Keep JSON file (audit trail)
    │   │
    │   └─> On Rate Limit:
    │       ├─> Update JSON with retryAfter timestamp
    │       └─> Continue (don't block)
    │
    ├─> Display result message
    │
    └─> ollama-manager.stopOllama() [if we started it]
```

### Batch Processing Flow

```
User runs: node index.js /path/to/folder
    │
    ├─> Scan folder for supported files
    │
    ├─> Filter out files with existing .evernote.json
    │   └─> Only process new/unprocessed files
    │
    ├─> evernote-client.listTags() [ONCE for entire batch]
    │   ├─> Fetch existing tags from Evernote API
    │   └─> Sanitize tags using tag-validator
    │
    ├─> upload-queue.retryPendingUploads()
    │   └─> Retry any uploads that are ready (before processing new files)
    │
    ├─> FOR EACH new file:
    │   ├─> Extract content
    │   ├─> Analyze with AI (using pre-fetched tags)
    │   ├─> Validate and filter tags (tag-validator)
    │   ├─> Save to JSON
    │   ├─> Try upload
    │   │   ├─> Success: Mark as uploaded in JSON
    │   │   └─> Rate limit: Save retry time, continue
    │   └─> Continue to next file (never block)
    │
    ├─> upload-queue.waitForPendingUploads()
    │   ├─> Find all pending uploads
    │   ├─> Wait for retry times
    │   ├─> Retry uploads when ready
    │   └─> Repeat until all uploaded or timeout
    │
    ├─> Display summary statistics
    │   ├─> Files processed
    │   ├─> Uploads successful
    │   ├─> Still pending
    │   └─> Failed
    │
    └─> Exit (pending uploads will retry on next run)
```

## Module Dependencies

```
index.js
├── oauth-helper.js
│   └── evernote (npm)
├── file-extractor.js
│   ├── pdf-parse (npm)
│   ├── mammoth (npm)
│   └── tesseract.js (npm)
├── ai-analyzer.js
│   ├── ollama (npm)
│   └── ollama-manager.js
├── ollama-manager.js
│   └── ollama (npm)
├── upload-queue.js
│   └── evernote-client.js
├── evernote-client.js
│   ├── evernote (npm)
│   ├── oauth-helper.js
│   └── tag-validator.js
└── tag-validator.js
    └── (no external dependencies)
```

## Error Handling Strategy

### Graceful Degradation
- If tags fetch fails: Proceed without tag filtering (warn user)
- If AI parsing fails: Use fallback parser with generic tags
- If Ollama unavailable: Clear error message with installation instructions

### Resource Cleanup
- Process signal handlers (SIGINT, SIGTERM) ensure cleanup
- Ollama stopped if app started it
- Error handlers call cleanup before exit

### User-Friendly Errors
- Network errors → Check connection instructions
- Auth errors → Re-authentication instructions
- File errors → File format or path guidance
- API errors → Detailed error messages from service

## Configuration Management

### Environment Variables (.env)
```
EVERNOTE_CONSUMER_KEY      # OAuth consumer key
EVERNOTE_CONSUMER_SECRET   # OAuth consumer secret
EVERNOTE_ENDPOINT          # API endpoint (prod/sandbox)
OLLAMA_MODEL              # AI model name (default: mistral for French/English support)
OLLAMA_HOST               # Ollama API URL
```

**Model Selection:**
- **Default: mistral** - Chosen for native French/English multilingual support
- **Alternative: llama2** - English-biased, suitable for English-only documents
- See configuration.md for detailed rationale and testing results

### Runtime State
- `.evernote-token` - OAuth access token (persistent)
- Ollama startup state (in-memory)

## Security Considerations

### Data Privacy
- All file content processed locally (never sent to cloud AI)
- Only final note sent to Evernote
- No telemetry or analytics

### Credential Protection
- `.env` and `.evernote-token` excluded from git
- Token file user-only readable
- Environment variables not logged

### Input Validation
- File path validation (exists, readable)
- File type validation (supported extensions)
- Tag validation (strict format and existence requirements)
  - Length: 1-100 characters
  - No commas, control characters, or invalid whitespace
  - Must exist in Evernote (no new tag creation)
  - Case-insensitive matching

## Performance Considerations

### Bottlenecks
1. **OCR Processing**: Slowest operation (30-60s for images)
2. **AI Analysis**: 5-15s depending on model and content length
3. **PDF Parsing**: Generally fast (<1s)

### Optimizations
- Text truncation for AI (4000 chars max)
- Single Ollama instance reuse
- **Tag batch fetching**: Tags fetched once per batch (1 API call vs N calls)
  - Single file: 1 tag fetch per file
  - Batch of N files: 1 tag fetch total (N× improvement)
- Tag validation performed locally (no API calls)

### Resource Usage
- Memory: Moderate (file buffers, AI model)
- CPU: High during AI inference
- Network: Minimal (only Evernote API calls)
- Disk: Low (temporary file reading only)
