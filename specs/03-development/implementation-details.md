# Implementation Details

> **Type:** Development Guide
> **Last Updated:** January 2025

This document provides technical implementation notes for key systems. For complete implementations, refer to the source code.

## File Extraction

### Supported Formats

**PDF** (`pdf-parse` v2.4.3)
- Extracts plain text from all pages
- Uses pdf.js under the hood
- Requires resource cleanup via `destroy()`
- **Source:** `electron/extractors/file-extractor.ts`

**Word Documents** (`mammoth` v1.11.0)
- Parses .docx (not legacy .doc)
- Extracts raw text, formatting lost
- **Source:** `electron/extractors/file-extractor.ts`

**Text Files**
- Direct UTF-8 file reading for .txt, .md, .markdown
- No parsing or transformation needed

**Images** (`tesseract.js` v6.0.1)
- OCR for PNG, JPG, GIF, BMP, TIFF
- English language only
- Typically 30-60 seconds per image
- **Source:** `electron/extractors/file-extractor.ts`

## AI Analysis

### Ollama Integration

**Library:** `ollama` v0.6.0

**Key Concepts:**
- Default model: Mistral (multilingual support)
- Content truncated to 4000 chars to prevent token limits
- Prompt includes existing tags when available
- Response parsed as JSON

**Source Files:**
- `electron/ai/ai-analyzer.ts` - Main analysis logic
- `electron/ai/ollama-manager.ts` - Service management
- `electron/utils/ai-response-parser.ts` - Response parsing

### Ollama Service Management

**Detection Strategy:**
1. Check API endpoint (`http://localhost:11434/api/tags`)
2. If API fails, check CLI (`which ollama`)
3. Search common installation paths

**Auto-start:** Spawns `ollama serve` as detached process if not running

**Model Downloads:** Automatic on first use (models 2-7GB)

## Evernote Integration

### ENML (Evernote Markup Language)

XML-based format for note content. Key requirements:
- Strict XML escaping (& < > " ')
- DOCTYPE declaration required
- Resources referenced by MD5 hash

**Example structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>
  <div>Description text...</div>
  <en-media type="application/pdf" hash="abc123..."/>
</en-note>
```

**Source:** `electron/evernote/enml-helpers.ts` (pure functions, 100% test coverage)

### Tag Management

**Validation Rules:**
- 1-100 characters
- No commas, control characters, or line separators
- Trimmed whitespace
- **Source:** `electron/evernote/tag-validator.ts`

**Tag Filtering:**
- AI tags matched against existing Evernote tags (case-insensitive)
- Only existing tags used (no new tag creation)
- Batch optimization: fetch tags once, reuse for all files

### Rate Limiting

**Evernote API Error Code 19:**
- Includes `rateLimitDuration` (seconds to wait)
- Queue system tracks retry times
- Automatic retry after duration expires

## Architecture Patterns

### Pure Helper Modules

**ENML Helpers** (`electron/evernote/enml-helpers.ts`)
- `createNoteContent()`, `getMimeType()`, `escapeXml()`, `createMD5Hash()`
- Pure functions, no side effects
- 100% test coverage

**Progress Helpers** (`electron/utils/progress-helpers.ts`)
- `getStageProgress()`, `getStageMessage()`, `createProgressData()`
- Centralizes progress calculation and formatting

**File State Reducer** (`electron/utils/file-state-reducer.ts`)
- `updateFileFromIPCMessage()`, `addFiles()`, `removeCompletedFiles()`
- Immutable state updates (Redux-style)

### React Custom Hooks

**File Processing Hook** (`electron/renderer/hooks/useFileProcessing.ts`)
- Manages file upload state and IPC subscriptions
- Auto-processing with ProcessingScheduler
- Provides `addFiles()`, `retryFile()`, `reloadFiles()`

**Notebooks Hook** (`electron/renderer/hooks/useNotebooks.ts`)
- Notebook selection and notes fetching
- React Query integration
- Auto-select default notebook

**Note Augmentation Hook** (`electron/renderer/hooks/useNoteAugmentation.ts`)
- Tracks augmentation progress for multiple notes
- Subscribes to `augment-progress` IPC events
- Handles completion/error callbacks

**Ollama Status Hook** (`electron/renderer/hooks/useOllamaStatus.ts`)
- Checks installation on mount
- Manages welcome wizard visibility

## Performance Optimizations

### Batch Tag Fetching
- **Before:** N API calls for N files
- **After:** 1 API call for entire batch
- **Improvement:** N× reduction in Evernote API calls

### Content Truncation
- Limit text to 4000 chars for AI analysis
- Prevents token limit errors
- Reduces processing time

### Ollama Process Reuse
- Start once, use multiple times
- Keeps model in memory
- Stop at end of session

## Error Handling

### Patterns Used

**Async/Await with Try-Catch:**
```typescript
try {
  const result = await operation();
} catch (error) {
  throw new Error(`Operation failed: ${error.message}`);
}
```

**Resource Cleanup:**
```typescript
try {
  const parser = new PDFParse({ data });
  return await parser.getText();
} finally {
  await parser.destroy();
}
```

**Process Signal Handling:**
- SIGINT, SIGTERM - Clean shutdown (stop Ollama if started by app)
- unhandledRejection - Log error and clean exit

**Source:** Various modules implement appropriate error handling patterns

## Testing

See [Testing Strategy](testing-strategy.md) for comprehensive test coverage details.

**Key modules with high coverage:**
- ENML helpers: 100%
- Tag validator: 100%
- Progress helpers: 100%
- File state reducer: 100%
- Queue database: 90%+
