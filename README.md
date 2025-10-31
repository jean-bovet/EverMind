# EverMind

![CI](https://github.com/jean-bovet/evernote-ai-importer/actions/workflows/ci.yml/badge.svg)

An Electron desktop application that analyzes files using local AI (Ollama) and imports them to Evernote with automatically generated descriptions and tags. Also augments existing Evernote notes with AI-powered analysis.

## Features

- **Desktop GUI**: Electron-based interface with drag-and-drop file import
- **Automatic Processing**: Two-stage pipeline with concurrent analysis and sequential uploads
- **File Import**: Drop files to analyze and import to Evernote with AI-generated metadata
- **Note Augmentation**: Enhance existing Evernote notes with AI analysis
- **Local AI Processing**: Uses Ollama for completely private, local AI processing
- **Smart Tagging**: Automatically selects from your existing Evernote tags
- **Multiple File Types**: Supports PDF, TXT, Markdown, DOCX, and images
- **OCR Support**: Extracts text from images using Tesseract.js
- **Queue Management**: SQLite database tracks processing status and progress
- **OAuth Authentication**: Secure Evernote integration with OAuth 1.0a

## Prerequisites

1. **Node.js** (v18 or higher)
2. **Ollama** installed locally
   - Download from: https://ollama.ai
   - Pull a model: `ollama pull mistral`
3. **Evernote API Credentials** (Consumer Key & Secret)
   - Request at: https://dev.evernote.com/support/

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/evermind.git
   cd evermind
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` with your Evernote API credentials:
   ```env
   EVERNOTE_CONSUMER_KEY=your_consumer_key_here
   EVERNOTE_CONSUMER_SECRET=your_consumer_secret_here
   EVERNOTE_ENDPOINT=https://www.evernote.com
   OLLAMA_MODEL=mistral
   OLLAMA_HOST=http://localhost:11434
   OLLAMA_TEMPERATURE=0.3
   ```

## Usage

### Development

Run in development mode:
```bash
npm run dev
```

### Build

Build for production:
```bash
npm run build
```

### First-Time Setup

1. Launch the application
2. The welcome wizard will guide you through Ollama setup
3. Authenticate with Evernote through the settings
4. Select a notebook for importing files

### Importing Files

1. Drag and drop files into the application window
2. Files are automatically analyzed using AI (extracts text, generates description and tags)
3. Processed files are uploaded to your selected Evernote notebook
4. Progress is tracked in real-time with status indicators

### Augmenting Notes

1. Browse notes from your selected notebook
2. Click "Augment" on any note to enhance it with AI analysis
3. The app extracts content, analyzes it, and updates the note with tags and metadata

## Supported File Types

- **PDF**: `.pdf`
- **Text**: `.txt`, `.md`, `.markdown`
- **Word**: `.docx`
- **Images**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.tiff` (with OCR)

## How It Works

### File Import Pipeline

1. **Stage 1 - Analysis** (concurrent, 2-3 files):
   - Extract text from file
   - AI analysis generates title, description, and tags
   - Saves analysis to JSON

2. **Stage 2 - Upload** (sequential, one at a time):
   - Creates Evernote note with AI-generated metadata
   - Attaches original file
   - Handles rate limits and retries automatically

### Note Augmentation

1. Fetches existing note content from Evernote
2. Extracts text from note and attachments
3. AI analyzes content and generates tags
4. Updates note with new metadata while preserving content

## Configuration

### Ollama Models

Change the model in `.env`:
- `mistral` - Fast and efficient (recommended)
- `llama3.1:8b` - Better accuracy
- `qwen2.5:14b` - Excellent multilingual support

### Temperature Control

Adjust `OLLAMA_TEMPERATURE` in `.env`:
- `0.0` - Deterministic (consistent results)
- `0.3` - Slight variation (recommended)
- `0.7` - Balanced creativity

### Evernote Sandbox

For testing, use the sandbox environment:
```env
EVERNOTE_ENDPOINT=https://sandbox.evernote.com
```

## Testing

Run the test suite:
```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

## Privacy & Data

- All AI processing happens **locally** via Ollama
- No data is sent to external AI services
- Only file attachments and generated metadata are sent to Evernote
- SQLite database stored locally in app data directory

## Project Structure

```
electron/
├── main.ts              # Electron main process
├── preload.ts           # IPC API definitions
├── processing/          # File processing and upload workers
├── database/            # SQLite queue management
├── services/            # Evernote, Ollama integrations
└── renderer/            # React UI components

specs/                   # Technical specifications
```

## License

MIT

## Contributing

Issues and pull requests welcome!

## Links

- [Ollama](https://ollama.ai)
- [Evernote API](https://dev.evernote.com/doc/)
- [Electron](https://www.electronjs.org/)
