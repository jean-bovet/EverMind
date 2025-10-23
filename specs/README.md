# Evernote AI Importer Documentation

Welcome to the comprehensive documentation for the Evernote AI Importer. This app automatically analyzes files using local AI (Ollama) and imports them to Evernote with intelligent metadata.

## Quick Start

- **[What is this app?](00-overview/README.md)** - Overview and key features
- **[Configuration](00-overview/configuration.md)** - Environment variables and settings
- **[User Guide](06-user-docs/electron-user-flows.md)** - How to use the Electron app

## Architecture

Learn how the app is built:

- **[System Architecture](01-architecture/system-architecture.md)** - CLI architecture and components
- **[Electron Architecture](01-architecture/electron-architecture.md)** - Desktop app architecture

## Features

Documentation for each major feature:

- **[Auto-Processing Pipeline](02-features/auto-processing-pipeline.md)** - Concurrent file processing
- **[Note Augmentation](02-features/note-augmentation.md)** - Enhance existing notes with AI
- **[SQLite Database Queue](02-features/sqlite-database.md)** - File queue management
- **[Unified List View](02-features/unified-list.md)** - Combined files and notes interface

## Development

Guides for developers working on the codebase:

- **[Implementation Details](03-development/implementation-details.md)** - Technical implementation specifics
- **[API Integrations](03-development/api-integrations.md)** - Evernote and Ollama APIs
- **[Ollama Integration Strategy](03-development/electron-ollama-integration.md)** - Local AI integration approach
- **[Testing Strategy](03-development/testing-strategy.md)** - Test coverage and approach

## Deployment

Instructions for building and releasing:

- **[Build & Deploy Guide](04-deployment/electron-build-deploy.md)** - Complete deployment instructions

## API Reference

Technical references for developers:

- **[IPC API Reference](05-reference/electron-ipc-api.md)** - Complete IPC API documentation
- **[UI Components Reference](05-reference/ui-specification.md)** - UI component specifications

## User Documentation

End-user guides:

- **[User Experience Flows](06-user-docs/electron-user-flows.md)** - Complete UX walkthrough

---

## Documentation Organization

The documentation is organized into clear categories:

### 00-overview/
Project overview, what the app is and does, configuration reference

### 01-architecture/
System architecture diagrams and design decisions

### 02-features/
Individual feature documentation describing what the app can do

### 03-development/
Development guides, implementation details, and integration strategies

### 04-deployment/
Build, packaging, and release instructions

### 05-reference/
API references and technical specifications

### 06-user-docs/
End-user guides and workflows

---

## Key Concepts

### Two Modes: CLI and GUI

The app is available in two modes:
- **CLI (Command-line)**: Node.js script for terminal users
- **GUI (Electron app)**: Desktop application with visual interface

Both modes share the same core processing logic.

### Local AI Processing

All AI analysis happens locally using [Ollama](https://ollama.ai):
- **Complete privacy**: No data sent to external AI services
- **Multiple models**: Mistral (default), Llama, CodeLlama, etc.
- **Multilingual**: Native French and English support with Mistral

### Two-Stage Processing

Files are processed in two concurrent stages:
1. **Stage 1**: Extract content + AI analysis (runs concurrently)
2. **Stage 2**: Upload to Evernote (independent worker)

This architecture prevents rate limits from blocking the entire pipeline.

---

## Contributing

When updating documentation:

1. **Maintain present tense**: Describe what the app *is* and *does*, not what it *will be*
2. **Update "Last Updated"**: Change the date in the file header
3. **Cross-reference**: Link to related documentation
4. **Be specific**: Use concrete examples and code snippets

---

## Questions?

- Check the relevant documentation section above
- Review the [Overview](00-overview/README.md) for general understanding
- Consult [API Reference](05-reference/electron-ipc-api.md) for technical details
- See [User Flows](06-user-docs/electron-user-flows.md) for usage guidance
