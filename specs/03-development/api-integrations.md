# API Integrations

> **Type:** Development Guide
> **Last Updated:** October 2025

Reference for external API integrations used by the app.

## Evernote API

### SDK & Version

- **Library:** `evernote` (JavaScript SDK) v2.0.5
- **Protocol:** EDAM (Evernote Data Access and Management)
- **Authentication:** OAuth 1.0a

### Endpoints

**Production:**
- Base URL: `https://www.evernote.com`
- OAuth: `https://www.evernote.com/OAuth.action`

**Sandbox (Testing):**
- Base URL: `https://sandbox.evernote.com`
- OAuth: `https://sandbox.evernote.com/OAuth.action`

**Environment Variable:** `EVERNOTE_ENDPOINT` (defaults to production)

### OAuth 1.0a Authentication

**Flow Overview:**
1. Request temporary token
2. User authorizes in browser
3. Exchange verifier for access token
4. Store token for future use

**Implementation:** `electron/evernote/oauth-helper.ts`

**Key Steps:**

1. **Request Token:**
   ```typescript
   client.getRequestToken(callbackUrl, callback)
   // Returns: oauthToken, oauthTokenSecret
   ```

2. **User Authorization:**
   - App opens browser to: `{endpoint}/OAuth.action?oauth_token={token}`
   - User authorizes and receives verifier code
   - User copies verifier back to app

3. **Access Token Exchange:**
   ```typescript
   client.getAccessToken(oauthToken, oauthTokenSecret, verifier, callback)
   // Returns: oauthAccessToken (long-lived)
   ```

4. **Token Storage:**
   - Saved to `.evernote-token` file (git-ignored)
   - Plain text storage (user-only permissions)
   - Token format: `S=s1:U=xxx:E=xxx:C=xxx:P=xxx:A=xxx:V=2:H=xxx`

### API Operations

**Notes:**
- `noteStore.createNote(note)` - Create new note with content and attachments
- `noteStore.getNote(guid)` - Fetch note content and metadata
- `noteStore.updateNote(note)` - Update existing note

**Notebooks:**
- `noteStore.listNotebooks()` - Get all notebooks

**Tags:**
- `noteStore.listTags()` - Get all tags (used for AI filtering)

**Search:**
- `noteStore.findNotesMetadata(filter, offset, maxNotes, resultSpec)` - Search/list notes

### Rate Limiting

**Error Code 19:** Rate limit exceeded

**Response includes:**
- `rateLimitDuration` - Seconds to wait before retry
- `parameter` - Which operation was limited (e.g., "Note.create")

**Handling:**
- Store retry time in database
- Automatic retry after duration expires
- User-visible wait time countdown

**Implementation:** `electron/utils/rate-limit-helpers.ts`

### ENML (Evernote Markup Language)

XML-based format for note content. Requirements:

- **DOCTYPE:** `<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">`
- **Root element:** `<en-note>`
- **XML escaping:** All text must escape `& < > " '`
- **Media:** Referenced by MD5 hash via `<en-media type="..." hash="..."/>`

**Helpers:** `electron/evernote/enml-helpers.ts` (pure functions for generation)

### Resource Attachments

**Structure:**
```typescript
const resource = new Evernote.Types.Resource({
  mime: mimeType,
  data: new Evernote.Types.Data({
    size: fileData.length,
    bodyHash: md5Hash,  // Required
    body: fileData      // Raw bytes
  }),
  attributes: new Evernote.Types.ResourceAttributes({
    fileName: fileName
  })
});
```

**MIME Types:** See `electron/evernote/enml-helpers.ts` for mapping

### Error Handling

**Common Errors:**
- `EDAMUserException` - User/permission issues
- `EDAMSystemException` - Server errors
- `EDAMNotFoundException` - Note/notebook not found
- Error code 19 - Rate limit (special handling)

**Strategy:** Catch, extract error details, display user-friendly message, store for retry if applicable.

## Ollama API

### SDK & Version

- **Library:** `ollama` v0.6.0
- **Protocol:** HTTP REST API
- **Default Host:** `http://localhost:11434`

**Environment Variable:** `OLLAMA_HOST` (defaults to localhost)

### Key Operations

**List Models:**
```typescript
const ollama = new Ollama({ host });
const models = await ollama.list();
// Returns: { models: [{ name: string, size: number, ... }] }
```

**Pull Model (Download):**
```typescript
const stream = await ollama.pull({ model, stream: true });
for await (const chunk of stream) {
  console.log(chunk.status, chunk.completed, chunk.total);
}
```

**Generate (AI Analysis):**
```typescript
const response = await ollama.generate({
  model: 'mistral',
  prompt: '...',
  stream: false
});
// Returns: { response: string, ... }
```

### Model Configuration

**Default Model:** `mistral` (multilingual support)

**Alternative Models:**
- `llama3.1:8b` - Latest Llama 3.1
- `llama2` - Original Llama 2
- `codellama` - Code-specialized

**Environment Variable:** `OLLAMA_MODEL`

### Service Management

**Detection:**
1. HTTP request to `/api/tags` endpoint
2. If fails, check CLI with `which ollama`
3. Search common install paths

**Auto-Start:**
- `spawn('ollama', ['serve'], { detached: true })`
- Polls for 30 seconds until service responds
- Tracked via `startedByUs` flag

**Auto-Stop:**
- Only if started by app
- Send SIGTERM on app shutdown

**Implementation:** `electron/ai/ollama-manager.ts`

### Error Handling

**Common Issues:**
- Model not found → Auto-download
- Service not running → Auto-start
- Connection timeout → Check installation
- Out of memory → Suggest smaller model

## Environment Variables

Complete reference in [Configuration](../00-overview/configuration.md).

**Evernote:**
- `EVERNOTE_CONSUMER_KEY` - OAuth consumer key (required)
- `EVERNOTE_CONSUMER_SECRET` - OAuth consumer secret (required)
- `EVERNOTE_ENDPOINT` - API endpoint (default: production)

**Ollama:**
- `OLLAMA_MODEL` - AI model name (default: mistral)
- `OLLAMA_HOST` - API host (default: http://localhost:11434)

**Caching:**
- `NOTE_CACHE_HOURS` - AI analysis cache TTL (default: 24)

## Security Considerations

**Token Storage:**
- `.evernote-token` file is git-ignored
- Plain text (no encryption)
- User-only read permissions (chmod 600)
- Never logged or transmitted except to Evernote

**API Keys:**
- Consumer key/secret in `.env` file
- Git-ignored, must be manually configured
- Never committed to repository

**Local AI:**
- All AI processing via local Ollama
- No file content sent to external services
- Complete privacy for document processing

## Testing with APIs

**Evernote Sandbox:**
- Use `EVERNOTE_ENDPOINT=https://sandbox.evernote.com`
- Separate account from production
- Safe for testing without affecting real notes

**Ollama Local:**
- Always runs locally
- No special test configuration needed
- Can use different models for testing

**Mocking:**
- Unit tests mock Evernote SDK
- Integration tests use sandbox
- See [Testing Strategy](testing-strategy.md)

## API Limits & Quotas

**Evernote Free Tier:**
- Rate limits enforced (error code 19)
- 60 MB monthly upload
- Max note size: 25 MB

**Evernote Premium:**
- Higher rate limits
- 10 GB monthly upload
- Max note size: 200 MB

**Ollama:**
- No quotas (runs locally)
- Limited by system resources (RAM, CPU)
- Model size affects performance

## Troubleshooting

**Evernote Issues:**
- "EDAM_USER_EXCEPTION" → Check token validity
- Rate limit errors → Wait specified duration
- Network errors → Check internet connection
- Authentication errors → Re-authenticate

**Ollama Issues:**
- Service not found → Install Ollama
- Model not available → Auto-downloads
- Out of memory → Use smaller model
- Slow performance → Close other apps

## Source Code Reference

**Evernote Integration:**
- `electron/evernote/oauth-helper.ts` - OAuth flow
- `electron/evernote/client.ts` - Note operations
- `electron/evernote/enml-helpers.ts` - ENML generation
- `electron/evernote/tag-validator.ts` - Tag sanitization

**Ollama Integration:**
- `electron/ai/ollama-manager.ts` - Service management
- `electron/ai/ai-analyzer.ts` - AI analysis
- `electron/utils/ai-response-parser.ts` - Response parsing

**Error Handling:**
- `electron/utils/rate-limit-helpers.ts` - Rate limit utilities
- Various modules implement error handling patterns
