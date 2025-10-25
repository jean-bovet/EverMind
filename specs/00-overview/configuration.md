# Configuration Reference

> **Type:** Reference
> **Last Updated:** January 2025

Complete reference for application configuration via environment variables.

## Configuration File

**Location:** `.env` file in project root

**Template:** `.env.example` (committed to repository as template)

**Security:** `.env` file is git-ignored to protect credentials

**Loading:** Automatically loaded via `dotenv` package on app start

## Environment Variables

### Evernote API Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EVERNOTE_CONSUMER_KEY` | **Yes** | None | OAuth consumer key (format: `appname-1234`) |
| `EVERNOTE_CONSUMER_SECRET` | **Yes** | None | OAuth consumer secret (64-char hex string) |
| `EVERNOTE_ENDPOINT` | No | Production | API endpoint URL (production or sandbox) |

**Obtaining API Credentials:**
1. Visit https://dev.evernote.com/support/
2. Request API access for your application
3. Receive consumer key and secret via email

**Example `.env`:**
```bash
EVERNOTE_CONSUMER_KEY=notelytics-3327
EVERNOTE_CONSUMER_SECRET=511c92235c7d8c25ae6ac7736337985947fe7302c5cf6423baad1034
EVERNOTE_ENDPOINT=https://www.evernote.com  # Optional, defaults to production
```

**Endpoints:**
- **Production:** `https://www.evernote.com` (default)
- **Sandbox:** `https://sandbox.evernote.com` (testing only)

### Ollama Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OLLAMA_MODEL` | No | `mistral` | AI model name to use for analysis |
| `OLLAMA_HOST` | No | `http://localhost:11434` | Ollama API endpoint |

**Example `.env`:**
```bash
OLLAMA_MODEL=llama3.1:8b
OLLAMA_HOST=http://localhost:11434
```

**Available Models:**
- `mistral` - Multilingual support (French/English), recommended
- `llama3.1:8b` - Latest Llama 3.1 (8 billion parameters)
- `llama2` - Original Llama 2
- `codellama` - Code-specialized model

### Cache Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NOTE_CACHE_HOURS` | No | `24` | Hours to cache AI analysis results |

**Example `.env`:**
```bash
NOTE_CACHE_HOURS=48  # Cache for 2 days
```

**How it works:**
- AI analysis results cached in SQLite database by content hash
- Cache valid for specified hours
- Reduces re-analysis time for unchanged notes
- Set to `0` to disable caching (not recommended)

## Runtime Configuration

These settings are stored via `electron-store` and configured through the Settings UI (not in `.env`):

**Ollama Settings:**
- Model selection (default: from `OLLAMA_MODEL` env var)
- Host URL (default: from `OLLAMA_HOST` env var)

**Evernote Settings:**
- Authentication state (token stored in `.evernote-token` file)

**Location:** Platform-specific app data directory
- macOS: `~/Library/Application Support/evernote-ai-importer/`
- Linux: `~/.config/evernote-ai-importer/`
- Windows: `%APPDATA%/evernote-ai-importer/`

## File Storage

### Token File

**Location:** `.evernote-token` (project root)

**Format:** Plain text OAuth access token

**Security:**
- Git-ignored
- User-only read permissions (chmod 600)
- Never logged or transmitted except to Evernote API

**Token Format:**
```
S=s1:U=xxxxx:E=xxxxxxx:C=xxxxxxx:P=xxx:A=xxxxxxx:V=2:H=xxxxxxxxxxxxxxxxxxxxxxxx
```

### Database File

**Location:** Platform-specific app data directory + `queue.db`

**Purpose:** SQLite database for file queue and note cache

**Contents:**
- File processing queue
- AI analysis cache
- Augmented notes tracking

**Backup:** No automatic backup (local-only storage)

## Security Best Practices

### API Credentials

**DO:**
- ✅ Keep `.env` file git-ignored
- ✅ Use `.env.example` as template (without real values)
- ✅ Treat consumer key/secret as passwords
- ✅ Use sandbox endpoint for testing
- ✅ Regenerate credentials if compromised

**DON'T:**
- ❌ Commit `.env` to version control
- ❌ Share credentials publicly
- ❌ Hardcode credentials in source code
- ❌ Use production credentials for testing
- ❌ Email credentials unencrypted

### Token Storage

**Current:** Plain text file (`.evernote-token`)

**Justification:**
- Simple implementation
- User-only permissions
- Never transmitted except to Evernote
- Matches common OAuth patterns

**Future Enhancement:** Encrypt tokens using OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)

## Configuration Examples

### Development Setup

```bash
# .env
EVERNOTE_CONSUMER_KEY=myapp-dev-1234
EVERNOTE_CONSUMER_SECRET=abc123...
EVERNOTE_ENDPOINT=https://sandbox.evernote.com  # Use sandbox for dev
OLLAMA_MODEL=mistral
OLLAMA_HOST=http://localhost:11434
NOTE_CACHE_HOURS=1  # Short cache for testing
```

### Production Setup

```bash
# .env
EVERNOTE_CONSUMER_KEY=myapp-prod-5678
EVERNOTE_CONSUMER_SECRET=def456...
EVERNOTE_ENDPOINT=https://www.evernote.com  # Production (or omit, same default)
OLLAMA_MODEL=mistral
OLLAMA_HOST=http://localhost:11434
NOTE_CACHE_HOURS=24  # 24-hour cache
```

### Custom Ollama Server

```bash
# .env
EVERNOTE_CONSUMER_KEY=myapp-1234
EVERNOTE_CONSUMER_SECRET=abc123...
OLLAMA_MODEL=llama3.1:8b  # Different model
OLLAMA_HOST=http://192.168.1.100:11434  # Remote Ollama server
NOTE_CACHE_HOURS=48  # Longer cache
```

## Troubleshooting

### "Missing API Credentials" Error

**Cause:** `EVERNOTE_CONSUMER_KEY` or `EVERNOTE_CONSUMER_SECRET` not set

**Solution:**
1. Create `.env` file in project root
2. Copy from `.env.example`
3. Fill in your API credentials
4. Restart app

### "Ollama Not Found" Error

**Cause:** Ollama not installed or `OLLAMA_HOST` incorrect

**Solution:**
1. Install Ollama from https://ollama.ai
2. Verify service running: `curl http://localhost:11434/api/tags`
3. Check `OLLAMA_HOST` matches Ollama location
4. Restart app

### "Invalid Token" Error

**Cause:** Stored token expired or invalid

**Solution:**
1. Delete `.evernote-token` file
2. Re-authenticate via Settings → Connect Evernote
3. Complete OAuth flow

### "Sandbox vs Production" Issues

**Cause:** Authenticated with wrong endpoint

**Solution:**
- Sandbox and production are separate accounts
- Use different tokens for each
- Delete `.evernote-token` when switching endpoints
- Re-authenticate after endpoint change

## Environment Variable Loading Order

1. **Process environment** (system environment variables)
2. **`.env` file** (overrides system vars)
3. **App defaults** (used if not set anywhere)

**Example:**
```bash
# System env: OLLAMA_MODEL=llama2
# .env file: OLLAMA_MODEL=mistral
# Result: Uses "mistral" from .env file
```

## Validation

**On App Start:**
- Checks for required variables (`EVERNOTE_CONSUMER_KEY`, `EVERNOTE_CONSUMER_SECRET`)
- Validates URL formats
- Displays helpful errors if missing

**Runtime:**
- Ollama status checked when needed
- Token validated on first API call
- Cache expiry checked on access

## Source Code

**Environment Loading:** `electron/main.ts` (loads dotenv)

**Configuration Access:**
- `process.env['VARIABLE_NAME']` - Read environment variable
- `electron-store` - Runtime settings storage

**Token Management:** `electron/evernote/oauth-helper.ts`

**Database:** `electron/database/queue-db.ts`
