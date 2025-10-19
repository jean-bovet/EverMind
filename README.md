# Evernote AI Importer

A Node.js CLI application that analyzes files using local AI (Ollama) and imports them to Evernote with automatically generated descriptions and tags.

## Features

- **Multilingual Support**: Native French and English support using Mistral AI - generates descriptions in the same language as your documents
- **Fully Automated**: Auto-starts Ollama and downloads models as needed - no manual setup!
- **Local AI Analysis**: Uses Ollama for completely private, local AI processing
- **OAuth Authentication**: Secure OAuth 1.0a authentication with Evernote
- **Multiple File Types**: Supports PDF, TXT, Markdown, DOCX, and images (PNG, JPG, etc.)
- **OCR Support**: Extracts text from images using Tesseract.js
- **Smart Tagging**: Automatically selects from your existing Evernote tags to maintain consistency
- **Privacy First**: All AI processing happens locally on your machine
- **Easy Integration**: Direct integration with Evernote API

## Prerequisites

1. **Node.js** (v14 or higher)
2. **Ollama** installed locally
   - Download from: https://ollama.ai
   - **No need to start it manually** - the app will auto-start Ollama when needed
   - **No need to pull models** - required models are downloaded automatically
3. **Evernote API Key** (Consumer Key & Secret)
   - Request at: https://dev.evernote.com/support/
   - You'll receive your credentials via email

## Installation

1. Clone or download this project:
   ```bash
   cd /Users/bovet/GitHub/evernote-ai-importer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` and add your Evernote API credentials:
   ```
   EVERNOTE_CONSUMER_KEY=your_consumer_key_here
   EVERNOTE_CONSUMER_SECRET=your_consumer_secret_here
   EVERNOTE_ENDPOINT=https://www.evernote.com
   OLLAMA_MODEL=mistral
   OLLAMA_HOST=http://localhost:11434
   ```

5. **Authenticate with Evernote** (first-time setup):
   ```bash
   node index.js --auth
   ```

   This will:
   - Display an authorization URL
   - Open it in your browser to authorize the app
   - Ask you to enter the verification code
   - Save your access token locally (in `.evernote-token`)

## Usage

### First-Time Setup

Authenticate with Evernote:

```bash
node index.js --auth
```

### Import Files

Import a file to Evernote:

```bash
node index.js /path/to/your/file.pdf
```

### Verbose Mode

Get detailed output during processing:

```bash
node index.js /path/to/your/file.pdf --verbose
```

### List Existing Tags

View all tags in your Evernote account:

```bash
node index.js --list-tags
```

This displays all your existing tags, which the AI will use when tagging imported files.

### Keep Ollama Running

By default, Ollama is automatically stopped after processing if the app started it. To keep it running:

```bash
node index.js /path/to/file.pdf --keep-ollama
```

This is useful if you plan to import multiple files or want to use Ollama for other tasks.

### Logout

Remove stored authentication token:

```bash
node index.js --logout
```

### Examples

```bash
# Import a PDF document
node index.js ~/Documents/report.pdf

# Import a text file
node index.js ~/Notes/meeting-notes.txt

# Import a Word document
node index.js ~/Documents/proposal.docx

# Import an image with OCR
node index.js ~/Screenshots/diagram.png
```

## Supported File Types

- **PDF**: `.pdf`
- **Text**: `.txt`, `.md`, `.markdown`
- **Word**: `.docx`
- **Images**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.tiff`

## How It Works

1. **Auto-Setup**: The application automatically:
   - Detects if Ollama is installed (guides you to install if not)
   - Checks if Ollama is already running
   - Starts Ollama if needed
   - Downloads the required AI model if not available (first run only)

2. **Fetch Tags**: Retrieves your existing tags from Evernote
   - Maintains consistency with your tag vocabulary
   - Prevents tag clutter and duplication

3. **Extract**: The application extracts text content from your file
   - PDFs are parsed for text
   - Images are processed with OCR
   - Word documents are converted to plain text

4. **Analyze**: Ollama AI analyzes the content locally and generates:
   - A concise 2-3 sentence description
   - 3-7 tags selected **only from your existing Evernote tags**
   - **Important**: The AI will NOT create new tags, only use existing ones

5. **Import**: Creates a new Evernote note with:
   - The original file as an attachment
   - AI-generated description
   - AI-selected tags from your existing tags
   - Automatic formatting in ENML

6. **Cleanup**: Automatically stops Ollama if the app started it (unless `--keep-ollama` is used)

## Tag Management

The application intelligently reuses your existing Evernote tags:

- **Automatic Tag Reuse**: Before analyzing files, the app fetches all your existing tags from Evernote
- **AI Selection**: The AI selects the most relevant tags from your existing collection
- **Consistency**: No new tags are created, maintaining a clean tag structure
- **View Tags**: Use `node index.js --list-tags` to see all available tags

## Configuration Options

### Ollama Models

You can use different Ollama models by changing `OLLAMA_MODEL` in `.env`:

- `llama2` - Default, good balance
- `mistral` - Fast and efficient
- `llama2:13b` - More accurate, slower
- `codellama` - Better for code files

**Note**: The required model will be automatically downloaded on first use - no manual setup needed!

### Evernote Sandbox

For testing, use the Evernote sandbox:

```
EVERNOTE_ENDPOINT=https://sandbox.evernote.com
```

You'll need to request separate sandbox API credentials from Evernote for testing.

## Advanced Configuration

### Temperature Control

Control the consistency of AI responses by setting `OLLAMA_TEMPERATURE` in `.env`:

- `0.0` (recommended): Completely deterministic - same file always produces same results
- `0.3`: Slight variation while maintaining consistency
- `0.7`: Balanced creativity and consistency
- `1.0+`: High creativity, useful for diverse tag suggestions

**For consistent detection (e.g., family members, specific keywords), use `OLLAMA_TEMPERATURE=0`**

### Context Window Size

Adjust how much text the AI can process at once with `OLLAMA_NUM_CTX`:

- `2048`: Default, suitable for most documents
- `4096`: Better for longer documents (recommended)
- `8192`: Maximum context for very long files (slower, more memory)

### Using Larger Models

For better accuracy in detecting people, dates, and details:

1. **Llama 3.1 8B** (easy upgrade, similar speed):
   ```bash
   ollama pull llama3.1:8b
   ```
   Then set in `.env`: `OLLAMA_MODEL=llama3.1:8b`

2. **Mixtral 8x7B** (best balance):
   ```bash
   ollama pull mixtral:8x7b
   ```
   Then set in `.env`: `OLLAMA_MODEL=mixtral:8x7b`

3. **Qwen 2.5 14B** (excellent multilingual):
   ```bash
   ollama pull qwen2.5:14b
   ```
   Then set in `.env`: `OLLAMA_MODEL=qwen2.5:14b`

4. **Llama 3 70B** (maximum accuracy, requires more resources):
   ```bash
   ollama pull llama3:70b
   ```
   Then set in `.env`: `OLLAMA_MODEL=llama3:70b`

**Note:** Larger models require more RAM and take longer to process, but provide significantly better accuracy.

## Troubleshooting

### "Not authenticated"

Run the authentication command:
```bash
node index.js --auth
```

### "EVERNOTE_CONSUMER_KEY and EVERNOTE_CONSUMER_SECRET must be set"

Check your `.env` file exists and contains your Consumer Key and Secret.

### "Ollama is not installed"

The app detected that Ollama is not installed. Download and install it from https://ollama.ai

After installation, the app will automatically:
- Start Ollama when needed
- Download required models
- Manage the Ollama process

### "OAuth authentication failed"

1. Check that your Consumer Key and Secret are correct in `.env`
2. Make sure you're using the correct endpoint (production vs sandbox)
3. Try removing the token and re-authenticating:
   ```bash
   node index.js --logout
   node index.js --auth
   ```

### "Unsupported file type"

Check the supported file types list above. The application only processes the listed extensions.

### OCR is slow

Image OCR can take 30-60 seconds depending on image size. Use `--verbose` to see progress.

## Privacy & Data

- All AI processing happens **locally** on your machine via Ollama
- No data is sent to external AI services
- Only file attachments and generated metadata are sent to Evernote
- Evernote's privacy policy applies to data stored in your Evernote account

## License

ISC

## Contributing

Feel free to open issues or submit pull requests for improvements!

## Useful Links

- [Ollama Documentation](https://github.com/jmorganca/ollama)
- [Evernote API Documentation](https://dev.evernote.com/doc/)
- [Tesseract.js Documentation](https://tesseract.projectnaptha.com/)
