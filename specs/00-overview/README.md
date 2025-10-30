# EverMind

> **Type:** Overview
> **Last Updated:** October 2025

## What It Is

EverMind is an Electron desktop application that automatically analyzes files using local AI and imports them into Evernote with intelligently generated metadata. The application prioritizes user privacy by processing all AI analysis locally through Ollama, ensuring no file content is sent to external services.

## Problem Statement

Manual document organization in Evernote requires users to:
- Read through documents to understand their content
- Manually write descriptions
- Remember and apply consistent tags
- Manage tag vocabulary to avoid duplication

This process is time-consuming and often leads to inconsistent tagging and incomplete metadata.

## Solution

EverMind automates this entire workflow by:
1. Extracting text content from various file formats (PDF, Word, images, text files)
2. Analyzing content using local AI (Ollama) to generate concise descriptions
3. Intelligently selecting tags from existing Evernote tags to maintain consistency
4. Creating Evernote notes with the original file attached and AI-generated metadata

## Key Features

### 1. Multilingual AI Analysis
- **French and English native support** using Mistral AI model
- Preserves source document language in generated descriptions
- Tested and verified with French financial documents
- Extracts important details: dates, amounts, names, locations
- No language bias (unlike English-only models)

### 2. Multi-Format Support
- **PDF**: Text extraction using pdf-parse library
- **Microsoft Word**: DOCX parsing with Mammoth.js
- **Text Files**: Direct reading of TXT, MD, Markdown files
- **Images**: OCR text extraction using Tesseract.js (PNG, JPG, JPEG, GIF, BMP, TIFF)

### 3. Local AI Processing
- Uses Ollama for completely private, local AI analysis
- **Mistral AI as default**: Native French/English multilingual support
- Generates descriptions in the same language as source documents
- Auto-starts Ollama service when needed
- Auto-downloads required AI models on first use
- No data sent to external AI services
- Supports multiple models (mistral, llama2, codellama, etc.)
- Extracts key details: dates, amounts, names, locations

### 4. Smart Tag Management
- Fetches existing tags from Evernote before analysis
- AI selects only from existing tags to maintain consistency
- Prevents tag proliferation and duplication
- Validates all selected tags against existing tags
- Command to view all existing tags

### 5. OAuth Authentication
- Secure OAuth 1.0a authentication with Evernote
- Token stored locally for persistent access
- Support for both production and sandbox environments
- Interactive authentication flow with browser-based authorization

### 6. Automated Ollama Management
- Detects if Ollama is installed
- Checks if Ollama is already running
- Auto-starts Ollama if needed
- Downloads required models automatically
- Auto-stops Ollama after processing (configurable)
- Cleanup on interruption or errors

## Target Users

- **Personal Knowledge Managers**: Individuals maintaining large document collections in Evernote
- **Researchers**: Academics organizing papers and research materials
- **Business Professionals**: People managing receipts, contracts, and business documents
- **Privacy-Conscious Users**: Those who want AI assistance without cloud processing
- **Power Users**: Evernote users seeking automation and consistent organization

## Use Cases

### 1. Receipt Organization
Import scanned receipts with automatic extraction of vendor, amount, and date information, tagged with existing categories like "expense", "business", "receipt".

### 2. Research Paper Management
Import PDF research papers with AI-generated summaries and automatic tagging by field, methodology, or topic using existing academic tags.

### 3. Contract Management
Import legal documents with descriptions of contract type, parties, and key terms, tagged with existing categories like "legal", "contract", "business".

### 4. Photo Documentation
Import photos of diagrams, whiteboards, or documents with OCR-extracted text and contextual descriptions.

### 5. Email Archival
Convert saved emails (as text/PDF) to Evernote notes with summaries and appropriate tags.

## Technology Stack

### Core Technologies
- **Node.js**: Runtime environment (v14+)
- **JavaScript**: Primary programming language (CommonJS modules)

### Key Dependencies
- **electron**: Desktop application framework
- **ollama**: Ollama API client for local AI inference
- **evernote**: Official Evernote SDK for API integration
- **pdf-parse**: PDF text extraction
- **mammoth**: Microsoft Word document parsing
- **tesseract.js**: OCR engine for image text extraction
- **dotenv**: Environment variable management
- **oauth**: OAuth 1.0a authentication
- **react**: UI component library

### External Services
- **Evernote API**: Cloud note storage and synchronization
- **Ollama**: Local AI inference engine (runs on user's machine)

## Design Principles

### 1. Privacy First
All sensitive file content is processed locally. Only the final note (with file attachment) is sent to Evernote. AI analysis happens entirely on the user's machine.

### 2. Zero Manual Setup
The application automatically manages Ollama installation checks, service startup, and model downloads, minimizing user configuration burden.

### 3. Tag Consistency
By only using existing Evernote tags, the application maintains the user's carefully curated tag vocabulary and prevents tag sprawl.

### 4. Fail-Safe Defaults
The application handles errors gracefully, cleans up resources automatically, and provides clear error messages with remediation steps.

### 5. User Control
Users retain full control through the UI settings panel, environment variables, and the ability to review AI-generated content before manual adjustments if needed.

## Success Metrics

- **Time Savings**: Reduce document import time from 2-5 minutes to under 30 seconds
- **Consistency**: 95%+ tag reuse rate (minimal new tag creation)
- **Accuracy**: AI-generated descriptions accurately reflect file content
- **Privacy**: 100% local processing of sensitive content
- **Reliability**: Successfully process common file formats with minimal errors

### 7. Batch Processing & Rate Limit Handling
- **Folder processing**: Process entire folders recursively
- **Smart rate limiting**: Respects Evernote API rate limits without blocking
- **Upload queue system**: Decouples file processing from upload
- **Resume capability**: Restarting skips already-processed files
- **Automatic retries**: Failed uploads automatically retry when ready
- **JSON audit trail**: Complete record of all processed files
- **Non-blocking workflow**: Rate limits don't prevent processing other files

## Roadmap

Potential future enhancements under consideration:

- Watch folder for automatic import
- Integration with additional note-taking platforms
- Custom AI prompts for specialized use cases
- Web interface for easier use
- Plugin system for custom file processors
