# Configuration Reference

## Environment Variables

All configuration is managed through environment variables stored in the `.env` file.

### Configuration File

**Location:** `/Users/bovet/GitHub/evernote-ai-importer/.env`

**Template:** `.env.example` (committed to repository)

**Security:** `.env` file is git-ignored to protect credentials

### Variable Reference

#### EVERNOTE_CONSUMER_KEY

**Purpose:** OAuth consumer key for Evernote API authentication

**Type:** String

**Required:** Yes

**Format:** Application name followed by numeric ID
```
notelytics-3327
```

**How to Obtain:**
1. Visit https://dev.evernote.com/support/
2. Request API access
3. Receive consumer key via email

**Example:**
```bash
EVERNOTE_CONSUMER_KEY=notelytics-3327
```

---

#### EVERNOTE_CONSUMER_SECRET

**Purpose:** OAuth consumer secret for Evernote API authentication

**Type:** String

**Required:** Yes

**Format:** Hexadecimal string (64 characters)
```
511c92235c7d8c25ae6ac7736337985947fe7302c5cf6423baad1034
```

**How to Obtain:**
1. Provided together with consumer key via email
2. Keep secret - acts as password for your application

**Example:**
```bash
EVERNOTE_CONSUMER_SECRET=511c92235c7d8c25ae6ac7736337985947fe7302c5cf6423baad1034
```

**Security Notes:**
- Never commit to version control
- Never share publicly
- Treat as application password

---

#### EVERNOTE_ENDPOINT

**Purpose:** Evernote API endpoint (production or sandbox)

**Type:** URL

**Required:** No (defaults to production)

**Default:** `https://www.evernote.com`

**Valid Values:**
```bash
https://www.evernote.com           # Production
https://sandbox.evernote.com       # Testing/Sandbox
```

**When to Use Sandbox:**
- Testing during development
- Experimenting without affecting real data
- Separate credentials required for sandbox

**Example:**
```bash
# Production (default)
EVERNOTE_ENDPOINT=https://www.evernote.com

# Sandbox for testing
EVERNOTE_ENDPOINT=https://sandbox.evernote.com
```

---

#### OLLAMA_MODEL

**Purpose:** AI model to use for content analysis

**Type:** String

**Required:** No (defaults to llama2)

**Default:** `llama2`

**Valid Values:**
```bash
llama2           # 7B parameter model, balanced performance
llama2:13b       # 13B parameter model, more accurate, slower
mistral          # Alternative model, faster
codellama        # Specialized for code analysis
phi              # Smaller, faster model
```

**Model Characteristics:**

| Model | Size | Speed | Accuracy | Use Case |
|-------|------|-------|----------|----------|
| llama2 | ~4GB | Medium | Good | General purpose (default) |
| llama2:13b | ~7GB | Slow | Excellent | Best quality |
| mistral | ~4GB | Fast | Good | Quick processing |
| codellama | ~4GB | Medium | Good | Code files |
| phi | ~2GB | Very Fast | Fair | Resource-constrained |

**Example:**
```bash
# Default balanced option
OLLAMA_MODEL=llama2

# For best quality
OLLAMA_MODEL=llama2:13b

# For speed
OLLAMA_MODEL=mistral
```

**Automatic Download:**
- Models auto-download on first use
- Download size varies (2-7 GB)
- One-time download, persists across sessions

---

#### OLLAMA_HOST

**Purpose:** Ollama API endpoint URL

**Type:** URL

**Required:** No (defaults to localhost)

**Default:** `http://localhost:11434`

**Valid Values:**
```bash
http://localhost:11434              # Local Ollama (default)
http://192.168.1.100:11434         # Remote Ollama on LAN
http://remote-server.com:11434     # Remote Ollama server
```

**Local vs Remote:**

**Local (Default):**
- Runs on your machine
- Complete privacy
- No network dependency
- Free
- Slower on low-end hardware

**Remote:**
- Runs on server/different machine
- Network dependency
- Potentially faster (if better hardware)
- Privacy depends on server trust
- Requires Ollama running on remote host

**Example:**
```bash
# Local (default)
OLLAMA_HOST=http://localhost:11434

# Remote server
OLLAMA_HOST=http://192.168.1.50:11434
```

---

## Runtime Configuration Files

### .evernote-token

**Purpose:** Stores OAuth access token after successful authentication

**Location:** `/Users/bovet/GitHub/evernote-ai-importer/.evernote-token`

**Format:** Plain text, single line

**Created By:** `node index.js --auth` command

**Example Content:**
```
S=s1:U=12345:E=17abc:C=18def:P=1:A=notelytics-3327:V=2:H=a1b2c3d4e5f6
```

**Token Structure:**
- `S=s1` - Schema version
- `U=` - User ID
- `E=` - Expiration timestamp
- `C=` - Timestamp (created)
- `P=` - Privilege level
- `A=` - Application identifier
- `V=2` - Version
- `H=` - Authentication hash

**Security:**
- Git-ignored (in `.gitignore`)
- Should have user-only permissions (600)
- Never share or commit this file
- Equivalent to your Evernote password

**Management:**
```bash
# Create/refresh token
node index.js --auth

# Remove token (logout)
node index.js --logout

# Verify token exists
ls -la .evernote-token
```

---

## Command-Line Options

### File Import

```bash
node index.js <file-path> [options]
```

**Arguments:**
- `<file-path>` - Path to file to import (required)

**Options:**

#### -v, --verbose

**Purpose:** Enable detailed output during processing

**Default:** Off (minimal output)

**Example:**
```bash
node index.js document.pdf --verbose
```

**Output Difference:**

**Normal:**
```
📄 Processing file: document.pdf

Analyzing content with Ollama (llama2)...

📝 AI Analysis Results:
   Description: A business proposal...
   Tags: business, proposal

✅ Successfully imported to Evernote!
```

**Verbose:**
```
📄 Processing file: document.pdf

Step 1: Fetching existing tags from Evernote...
  - Found 103 existing tags

Step 2: Extracting file content...
  - File type: pdf
  - Content length: 2847 characters
  - Preview: Introduction This document...

Step 3: Analyzing content with AI...
Analyzing content with Ollama (llama2)...
AI analysis completed successfully.

📝 AI Analysis Results:
   Description: A business proposal...
   Tags: business, proposal

Step 4: Creating Evernote note...
Creating note in Evernote...
Note created successfully!

✅ Successfully imported to Evernote!
```

---

#### --keep-ollama

**Purpose:** Keep Ollama running after import completes

**Default:** Auto-stop if we started it

**Behavior:**
- Without flag: Ollama stopped if app started it
- With flag: Ollama kept running

**Use Cases:**
- Importing multiple files in sequence
- Using Ollama for other tasks after
- Avoiding startup overhead

**Example:**
```bash
# Import and keep Ollama running
node index.js document.pdf --keep-ollama

# Then import another file (Ollama already running)
node index.js report.pdf
```

---

### Authentication Commands

#### --auth

**Purpose:** Authenticate with Evernote (first-time setup)

**Usage:**
```bash
node index.js --auth
```

**Process:**
1. Generates OAuth request token
2. Displays authorization URL
3. Waits for user to provide verification code
4. Exchanges code for access token
5. Saves token to `.evernote-token`

**When to Use:**
- First time using the application
- After logout
- Token expired or invalid

---

#### --logout

**Purpose:** Remove stored OAuth token

**Usage:**
```bash
node index.js --logout
```

**Effect:**
- Deletes `.evernote-token` file
- Requires re-authentication before next import

**When to Use:**
- Switching Evernote accounts
- Security cleanup
- Troubleshooting auth issues

---

### Utility Commands

#### --list-tags

**Purpose:** Display all existing tags from Evernote account

**Usage:**
```bash
node index.js --list-tags
```

**Output:**
```
📋 Fetching tags from Evernote...

Found 103 tags:

  1. 1st grade
  2. 2013
  3. 2014
  ...
  102. woodworking
  103. work
```

**Use Cases:**
- Review available tags before importing
- Verify tag vocabulary
- Check tag count
- Debugging tag selection

---

## Configuration Best Practices

### Initial Setup

1. **Copy template:**
   ```bash
   cp .env.example .env
   ```

2. **Edit .env:**
   ```bash
   nano .env
   # or
   vim .env
   ```

3. **Set required variables:**
   ```bash
   EVERNOTE_CONSUMER_KEY=your_key_here
   EVERNOTE_CONSUMER_SECRET=your_secret_here
   ```

4. **Authenticate:**
   ```bash
   node index.js --auth
   ```

### Security Checklist

- [ ] `.env` file is git-ignored
- [ ] `.evernote-token` file is git-ignored
- [ ] Never commit credentials to version control
- [ ] Never share consumer secret publicly
- [ ] Use sandbox for testing
- [ ] Regularly rotate credentials if needed

### Performance Tuning

**For Speed:**
```bash
OLLAMA_MODEL=mistral
```

**For Quality:**
```bash
OLLAMA_MODEL=llama2:13b
```

**For Low RAM:**
```bash
OLLAMA_MODEL=phi
```

**For Code Files:**
```bash
OLLAMA_MODEL=codellama
```

### Troubleshooting Configuration

**Authentication Errors:**
```bash
# Check credentials
cat .env | grep EVERNOTE

# Verify token exists
ls -la .evernote-token

# Re-authenticate
node index.js --logout
node index.js --auth
```

**Ollama Connection Errors:**
```bash
# Verify Ollama host
echo $OLLAMA_HOST

# Check Ollama is running
curl http://localhost:11434/api/tags

# Test with different model
OLLAMA_MODEL=llama2 node index.js file.pdf
```

**Endpoint Issues:**
```bash
# Verify endpoint
cat .env | grep EVERNOTE_ENDPOINT

# Switch to sandbox for testing
# Edit .env:
EVERNOTE_ENDPOINT=https://sandbox.evernote.com
```

---

## Configuration Precedence

Configuration loaded in this order (later overrides earlier):

1. **Hardcoded defaults** in code
   ```javascript
   const model = process.env.OLLAMA_MODEL || 'llama2';
   ```

2. **Environment variables** from `.env` file
   ```bash
   OLLAMA_MODEL=mistral
   ```

3. **System environment variables** (if set)
   ```bash
   export OLLAMA_MODEL=codellama
   ```

**Example:**
```javascript
// Code default
const model = process.env.OLLAMA_MODEL || 'llama2';

// .env file sets
OLLAMA_MODEL=mistral

// System environment overrides
$ export OLLAMA_MODEL=codellama
$ node index.js file.pdf  # Uses codellama
```

---

## Configuration Validation

**On Startup:**

The application validates configuration:

1. **OAuth Credentials:**
   - Checks if `EVERNOTE_CONSUMER_KEY` is set
   - Checks if `EVERNOTE_CONSUMER_SECRET` is set
   - Error if missing

2. **OAuth Token:**
   - Checks if `.evernote-token` file exists
   - Prompts to run `--auth` if missing

3. **Ollama:**
   - Checks if Ollama is installed
   - Checks if specified model is available
   - Auto-downloads model if missing

**Error Messages:**

```bash
# Missing credentials
Error: EVERNOTE_CONSUMER_KEY and EVERNOTE_CONSUMER_SECRET must be set in .env file

# Not authenticated
Error: Not authenticated. Please run: node index.js --auth

# Ollama not installed
Error: Ollama is not installed. Download from https://ollama.ai
```

---

## Example Configurations

### Basic Setup (Default)

```bash
# .env
EVERNOTE_CONSUMER_KEY=notelytics-3327
EVERNOTE_CONSUMER_SECRET=511c92235c7d8c25ae6ac7736337985947fe7302c5cf6423baad1034
EVERNOTE_ENDPOINT=https://www.evernote.com
OLLAMA_MODEL=llama2
OLLAMA_HOST=http://localhost:11434
```

### Sandbox Testing

```bash
# .env
EVERNOTE_CONSUMER_KEY=sandbox-app-1234
EVERNOTE_CONSUMER_SECRET=abcdef123456789...
EVERNOTE_ENDPOINT=https://sandbox.evernote.com
OLLAMA_MODEL=llama2
OLLAMA_HOST=http://localhost:11434
```

### High Performance Setup

```bash
# .env
EVERNOTE_CONSUMER_KEY=notelytics-3327
EVERNOTE_CONSUMER_SECRET=511c92235c7d8c25ae6ac7736337985947fe7302c5cf6423baad1034
EVERNOTE_ENDPOINT=https://www.evernote.com
OLLAMA_MODEL=mistral
OLLAMA_HOST=http://gpu-server:11434
```

### Maximum Quality Setup

```bash
# .env
EVERNOTE_CONSUMER_KEY=notelytics-3327
EVERNOTE_CONSUMER_SECRET=511c92235c7d8c25ae6ac7736337985947fe7302c5cf6423baad1034
EVERNOTE_ENDPOINT=https://www.evernote.com
OLLAMA_MODEL=llama2:13b
OLLAMA_HOST=http://localhost:11434
```
