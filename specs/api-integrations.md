# API Integrations

## Evernote API Integration

### API Version
- **Cloud API SDK:** Evernote JavaScript SDK v2.0.5
- **API Version:** EDAM (Evernote Data Access and Management) Protocol
- **Authentication:** OAuth 1.0a

### API Endpoints

#### Production
- **Base URL:** `https://www.evernote.com`
- **Service Host:** `www.evernote.com`
- **OAuth Endpoint:** `https://www.evernote.com/OAuth.action`

#### Sandbox (Testing)
- **Base URL:** `https://sandbox.evernote.com`
- **Service Host:** `sandbox.evernote.com`
- **OAuth Endpoint:** `https://sandbox.evernote.com/OAuth.action`

### Authentication Flow

#### 1. Request Token

**Endpoint:** Handled by Evernote SDK
```javascript
client.getRequestToken(callbackUrl, callback)
```

**Parameters:**
- `callbackUrl`: `http://localhost` (required but unused for desktop apps)

**Response:**
```javascript
{
  oauthToken: string,        // Temporary request token
  oauthTokenSecret: string,  // Secret for token exchange
  results: object            // Additional metadata
}
```

**Example:**
```
oauthToken: "notelytics-3327.199FD4E4E24.687474703A2F2F6C6F63616C686F7374.B417DE12220D5C42C07798CBF04929F2"
```

#### 2. User Authorization

**Authorization URL Format:**
```
https://www.evernote.com/OAuth.action?oauth_token={oauthToken}
```

**User Actions:**
1. Visit authorization URL in browser
2. Sign in to Evernote (if not already)
3. Review permissions requested by application
4. Click "Authorize"
5. Receive verification code (oauth_verifier)

**Redirect URL:**
```
http://localhost/?oauth_token={token}&oauth_verifier={verifier}&sandbox_lnb=false
```

**Example:**
```
oauth_verifier: "112F17B9AE9C8134A3E0B49E74C188E0"
```

#### 3. Access Token Exchange

**Endpoint:** Handled by Evernote SDK
```javascript
client.getAccessToken(oauthToken, oauthTokenSecret, verifier, callback)
```

**Parameters:**
- `oauthToken`: From step 1
- `oauthTokenSecret`: From step 1
- `verifier`: From step 2 (user-provided)

**Response:**
```javascript
{
  oauthAccessToken: string,  // Long-lived access token
  oauthAccessTokenSecret: string,
  results: object
}
```

**Access Token Format:**
```
S=s1:U=xxxxx:E=xxxxxxx:C=xxxxxxx:P=xxx:A=xxxxxxx:V=2:H=xxxxxxxxxxxxxxxxxxxxxxxx
```

**Token Characteristics:**
- Long-lived (typically years)
- Grants full access to user's account
- Can be revoked by user via Evernote settings

### API Methods Used

#### getNoteStore()

**Purpose:** Get NoteStore client for note operations

```javascript
const client = new Evernote.Client({
  token: accessToken,
  sandbox: false,
  serviceHost: 'www.evernote.com'
});

const noteStore = client.getNoteStore();
```

**Returns:** NoteStore instance

#### listTags()

**Purpose:** Fetch all tags for authenticated user

```javascript
const tags = await noteStore.listTags();
```

**Request:**
- No parameters
- Requires valid access token

**Response:**
```javascript
[
  {
    guid: string,           // Unique tag identifier
    name: string,           // Tag name (user-visible)
    parentGuid: string,     // Parent tag GUID (for hierarchies)
    updateSequenceNum: number
  },
  // ... more tags
]
```

**Example Response:**
```javascript
[
  { guid: "abc-123", name: "work", parentGuid: null },
  { guid: "def-456", name: "personal", parentGuid: null },
  { guid: "ghi-789", name: "taxes", parentGuid: "abc-123" }
]
```

**Usage in Application:**
```javascript
const tagNames = tags.map(tag => tag.name);
// ["work", "personal", "taxes"]
```

#### createNote()

**Purpose:** Create new note with content and attachments

```javascript
const note = new Evernote.Types.Note({
  title: string,
  content: string,      // ENML format
  tagNames: string[],
  resources: Resource[]
});

const createdNote = await noteStore.createNote(note);
```

**Request:**

**Note Object:**
```javascript
{
  title: "document.pdf",
  content: "<en-note>...</en-note>",  // ENML
  tagNames: ["invoice", "business", "2024"],
  resources: [resourceObject]
}
```

**Resource Object:**
```javascript
{
  mime: "application/pdf",
  data: {
    size: 123456,
    bodyHash: "a1b2c3d4...",  // MD5 hash
    body: Buffer              // File bytes
  },
  attributes: {
    fileName: "document.pdf"
  }
}
```

**Response:**
```javascript
{
  guid: string,              // Unique note identifier
  title: string,
  contentLength: number,
  created: timestamp,
  updated: timestamp,
  // ... other metadata
}
```

**Example:**
```javascript
{
  guid: "47f1bdbc-877d-4c15-a29e-8ab3b3b9f3f4",
  title: "MDC-Payment-Proof.pdf",
  contentLength: 542,
  created: 1697825400000,
  updated: 1697825400000
}
```

**Note URL Construction:**
```javascript
const noteUrl = `https://www.evernote.com/Home.action#n=${createdNote.guid}`;
```

### ENML (Evernote Markup Language)

**Specification:** XML-based markup language

**Required Structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>
  <!-- Content here -->
</en-note>
```

**Allowed Elements:**
- Basic formatting: `<div>`, `<span>`, `<br/>`, `<strong>`, `<em>`
- Lists: `<ul>`, `<ol>`, `<li>`
- Tables: `<table>`, `<tr>`, `<td>`, `<th>`
- Links: `<a href="...">`
- Media: `<en-media type="..." hash="..."/>`

**Disallowed Elements:**
- Scripts: `<script>`
- Styles: `<style>` (inline CSS allowed)
- Forms: `<form>`, `<input>`
- External resources: `<img src="http://...">`

**Character Escaping:**
Required for XML compliance:
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&apos;`

**Media References:**
```xml
<en-media type="application/pdf" hash="a1b2c3d4e5f6..."/>
```

**Hash:** MD5 hash of resource body (hex-encoded)

### Rate Limits

**Production:**
- API calls: 10,000 per hour
- Note uploads: 250 per day (free), unlimited (premium)
- Resource size: 25 MB per note (free), 200 MB (premium)

**Sandbox:**
- More relaxed limits for testing
- Data reset periodically

**Handling:**
- Application makes minimal API calls (2-3 per import)
- No batch operations currently implemented
- Unlikely to hit rate limits in normal use

### Error Handling

**Common Errors:**

**EDAMUserException:**
```javascript
{
  errorCode: 2,  // BAD_DATA_FORMAT
  parameter: 'authenticationToken'
}
```
**Cause:** Invalid or expired access token
**Resolution:** Re-authenticate using `--auth`

**EDAMSystemException:**
```javascript
{
  errorCode: 19,  // RATE_LIMIT_REACHED
  rateLimitDuration: 3600
}
```
**Cause:** Too many API requests
**Resolution:** Wait specified duration, retry

**EDAMNotFoundException:**
```javascript
{
  identifier: 'Note.guid',
  key: 'abc-123'
}
```
**Cause:** Referenced resource doesn't exist
**Resolution:** Verify GUIDs, refresh data

**Application Error Handling:**
```javascript
try {
  const result = await noteStore.createNote(note);
  return result;
} catch (error) {
  const errorMessage = error.message ||
                       error.errorMessage ||
                       JSON.stringify(error) ||
                       'Unknown error';

  throw new Error(`Failed to create Evernote note: ${errorMessage}`);
}
```

---

## Ollama API Integration

### API Version
- **Library:** ollama npm package v0.6.0
- **Protocol:** HTTP REST API
- **Default Endpoint:** `http://localhost:11434`

### API Endpoints

#### List Models

**Endpoint:** `GET /api/tags`

```javascript
const ollama = new Ollama({ host: 'http://localhost:11434' });
const response = await ollama.list();
```

**Response:**
```javascript
{
  models: [
    {
      name: "llama2:latest",
      modified_at: "2024-01-15T10:30:00Z",
      size: 3825819519,
      digest: "sha256:abc123...",
      details: {
        format: "gguf",
        family: "llama",
        parameter_size: "7B",
        quantization_level: "Q4_0"
      }
    },
    // ... more models
  ]
}
```

#### Pull Model (Download)

**Endpoint:** `POST /api/pull`

```javascript
const stream = await ollama.pull({ model: 'llama2', stream: true });

for await (const chunk of stream) {
  console.log(chunk.status);  // "downloading", "verifying", "success"
}
```

**Request:**
```javascript
{
  name: "llama2",
  stream: true
}
```

**Response (Streaming):**
```javascript
{
  status: "downloading digestname",
  digest: "sha256:...",
  total: 3825819519,
  completed: 1234567
}
```

**Final Chunk:**
```javascript
{
  status: "success"
}
```

#### Generate Response

**Endpoint:** `POST /api/generate`

```javascript
const response = await ollama.generate({
  model: 'llama2',
  prompt: 'Your prompt here',
  stream: false
});
```

**Request:**
```javascript
{
  model: "llama2",
  prompt: "Analyze this content...",
  stream: false,
  options: {
    temperature: 0.7,    // Optional: creativity (0-1)
    top_p: 0.9,         // Optional: nucleus sampling
    top_k: 40           // Optional: top-k sampling
  }
}
```

**Response:**
```javascript
{
  model: "llama2",
  created_at: "2024-01-15T12:34:56.789Z",
  response: "{\n  \"description\": \"...\",\n  \"tags\": [...]\n}",
  done: true,
  context: [...],      // Token context
  total_duration: 5234567890,
  load_duration: 123456789,
  prompt_eval_count: 45,
  prompt_eval_duration: 234567890,
  eval_count: 89,
  eval_duration: 4567890123
}
```

**Key Fields:**
- `response`: Generated text (contains JSON in our case)
- `done`: true when generation complete
- `total_duration`: Nanoseconds taken

### Service Health Check

**Endpoint:** `GET /api/tags`

**Purpose:** Verify Ollama is running and responsive

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

**Success Response:** 200 OK
**Failure:** Connection refused, timeout

### Model Management

**Model Naming:**
- `mistral` → Recommended (multilingual French/English support)
- `llama2` → Latest version (llama2:latest), English-biased
- `llama2:7b` → Specific size variant
- `llama2:13b` → Larger variant
- `codellama` → Specialized for code

**Model Selection Rationale:**

The application defaults to **Mistral** for the following reasons:

1. **Multilingual Capability**: Mistral AI (France-based) provides native French language support
2. **Language Preservation**: Maintains source document language in generated descriptions
3. **No English Bias**: Unlike llama2, Mistral doesn't default to English for non-English content
4. **Proven Performance**: Successfully tested with French documents, correctly extracting:
   - Amounts (CHF 540,00)
   - Dates (05.09.2024)
   - Names (Audrey Bovet, Jean Bovet)
   - Organizations (Académie MDC, Banque Cantonale Neuchâteloise)
   - All in original French language

**Testing Results:**
- **llama2**: Generated English descriptions for French documents (language bias issue)
- **mistral**: Generated French descriptions for French documents (correct behavior)

**Model Storage:**
- Location: `~/.ollama/models/`
- Format: GGUF (GPT-Generated Unified Format)
- Sizes: 2-7 GB typical

**Application Configuration:**
```javascript
const model = process.env.OLLAMA_MODEL || 'mistral';  // Changed from llama2
```

### Performance Characteristics

**Model Loading:**
- First request: ~5-10 seconds (load model to RAM)
- Subsequent requests: Immediate (model cached)

**Inference Time:**
- Depends on prompt length and model size
- Typical: 5-15 seconds for 4000 character analysis
- CPU-bound operation

**Resource Usage:**
- RAM: 4-8 GB (model size dependent)
- CPU: High utilization during inference
- Disk: Model storage only

### Error Handling

**Connection Errors:**
```javascript
Error: connect ECONNREFUSED 127.0.0.1:11434
```
**Cause:** Ollama not running
**Resolution:** Start Ollama via `ollama serve` or auto-start

**Model Not Found:**
```javascript
{
  error: "model 'llama2' not found"
}
```
**Cause:** Model not downloaded
**Resolution:** Pull model via `ollama pull llama2` or auto-download

**Context Length Exceeded:**
```javascript
{
  error: "context length exceeded"
}
```
**Cause:** Prompt too long
**Resolution:** Truncate input (we limit to 4000 chars)

### Local vs Remote

**Local (Default):**
```
OLLAMA_HOST=http://localhost:11434
```
- Runs on user's machine
- Complete privacy
- No network dependency (except model download)
- Free

**Remote (Possible):**
```
OLLAMA_HOST=http://remote-server:11434
```
- Runs on different machine/server
- Requires network connection
- Faster if remote has better hardware
- Privacy depends on server trust

**Application Design:**
- Defaults to local
- Supports remote via configuration
- No cloud service dependency

---

## API Security Considerations

### Evernote
- **Access Token:** Stored locally, never logged
- **Transmission:** HTTPS only
- **Scope:** Full account access (read/write)
- **Revocation:** User can revoke via Evernote settings

### Ollama
- **Network:** Local-only by default (127.0.0.1)
- **Authentication:** None (localhost trusted)
- **Data Privacy:** All processing local
- **No telemetry:** No data sent to external services

### Best Practices

**Credential Storage:**
- Environment variables for API keys
- Separate token file for OAuth token
- Git-ignored sensitive files
- No hardcoded credentials

**Data Minimization:**
- Only send final notes to Evernote
- All file analysis happens locally
- No unnecessary API calls

**Error Logging:**
- Never log credentials or tokens
- Sanitize error messages before display
- Avoid exposing system paths in errors
