# Electron App Architecture

> **Type:** Architecture
> **Last Updated:** October 2025

## Overview

This document describes the architecture of the Evernote AI Importer Electron application, which provides a graphical interface for importing files to Evernote with AI-generated metadata using local Ollama models.

## Design Principles

1. **Modular Architecture**: Clean separation between UI, business logic, and data layers
2. **Dependency Injection**: Interface-based design for testability and flexibility
3. **Security**: Use Electron's context isolation and IPC for secure communication
4. **User Transparency**: No silent installations; guide users through setup
5. **Privacy First**: All AI processing happens locally via Ollama
6. **Platform Native**: macOS-first design with native UI conventions
7. **Type Safety**: Full TypeScript coverage with strict mode

## Architecture Layers

### 0. Core Abstractions (`electron/core/`)

**Purpose:** Decouple business logic from Electron IPC using dependency injection

**Components:**

**ProgressReporter Interface**
- Abstracts progress reporting from Electron IPC
- Implementations: IPCProgressReporter (production), MockProgressReporter (testing), NullProgressReporter (CLI)
- Injected into all business logic functions
- **Source:** `electron/core/progress-reporter.ts`

**EventBus**
- Centralized, type-safe event management
- Event logging for debugging
- Subscribe/unsubscribe with cleanup functions
- **Source:** `electron/core/event-bus.ts`

**FileStateManager**
- Atomic database updates + event emission
- Ensures UI and database always in sync
- Single source of truth for state changes
- **Source:** `electron/core/state-manager.ts`

**Architecture Benefits:**
- Business logic testable without Electron (658 tests passing)
- Can swap IPC with WebSockets, HTTP, CLI, etc.
- Clear separation of concerns
- Type-safe interfaces

**Dependency Injection Flow:**
```
Main Process
  ├── Create IPCProgressReporter(mainWindow)
  ├── Create UploadWorker(progressReporter)
  └── Inject progressReporter into IPC handlers
        ├── analyzeFile(path, options, progressReporter)
        ├── uploadFile(json, path, progressReporter)
        └── augmentNote(guid, progressReporter)

Tests
  ├── Create MockProgressReporter()
  └── Inject into business logic
        └── Verify events captured by mock
```

See [Implementation Details](../03-development/implementation-details.md#core-abstractions) for complete documentation.

### 1. Main Process (`electron/main.ts`)

**Responsibilities:**
- Application lifecycle management
- Window creation and management
- IPC handler registration
- Native OS integration (file dialogs, menu bar)
- Settings persistence (via electron-store)

**Key Components:**
- Window Manager: Creates and manages BrowserWindow instances
- IPC Handlers: Bridge between UI and backend logic
- Settings Store: Persistent user preferences
- Ollama Manager: Delegates to `ollama-manager.ts`
- File Processor: Delegates to `file-processor.ts`

### 2. Preload Script (`electron/preload.ts`)

**Responsibilities:**
- Expose secure IPC API to renderer process
- Context isolation bridge
- Type-safe API definitions

**Security Features:**
- Context isolation enabled
- No node integration in renderer
- Sandboxed environment (partial - required for native modules)
- Explicit API surface via `contextBridge`

### 3. Renderer Process (`electron/renderer/`)

**Technology Stack:**
- React 19+ for UI components
- TypeScript for type safety
- CSS for styling (no framework dependencies)
- Lucide React for icons (professional SVG icon library)
- Vite for development and bundling

**Component Hierarchy:**

```
App.tsx (Root - 191 lines)
├── WelcomeWizard.tsx (First-time setup)
├── DropZone.tsx (File/folder selection)
├── UnifiedList.tsx (Files and notes display)
├── StatusBar.tsx (Ollama status)
└── Settings.tsx (Configuration modal)
```

**Custom Hooks Architecture:**

The renderer uses custom React hooks for better state management and separation of concerns:

```
electron/renderer/hooks/
├── useFileProcessing.ts    - File upload queue state and IPC
├── useNotebooks.ts          - Notebook selection and notes fetching
├── useNoteAugmentation.ts   - Note augmentation progress tracking
└── useOllamaStatus.ts       - Ollama installation status
```

**Hook Responsibilities:**

**`useFileProcessing(onFileComplete?)`**
- Manages file upload queue state
- Subscribes to `file-progress` IPC events
- Auto-processes pending files via ProcessingScheduler
- Syncs with SQLite database
- Provides retry functionality
- Returns: `{ files, addFiles, retryFile, reloadFiles }`

**`useNotebooks()`**
- Fetches notebooks via React Query
- Manages selected notebook state
- Fetches notes for selected notebook
- Handles rate limit warnings
- Auto-selects default notebook
- Returns: `{ notebooks, selectedNotebook, notes, notesLoading, refetchNotes, ... }`

**`useNoteAugmentation(onComplete?, onRateLimitError?)`**
- Tracks augmentation progress for multiple notes (Map)
- Subscribes to `augment-progress` IPC events
- Calls completion/error callbacks
- Updates progress in real-time
- Returns: `{ augmentingNotes, augmentNote }`

**`useOllamaStatus()`**
- Checks Ollama installation on mount
- Manages welcome wizard visibility
- Provides status refresh
- Returns: `{ ollamaStatus, showWelcome, setShowWelcome, checkOllamaStatus }`

**Impact:** App.tsx reduced from 433 to 191 lines (56% smaller) with better separation of concerns and testability.

### 4. Ollama Integration (`electron/ai/ollama-manager.ts`)

**Detection Strategy:**
1. Check API endpoint (`http://localhost:11434/api/tags`)
2. If API fails, check CLI (`ollama --version`)
3. Search common installation paths

**Installation Flow:**
1. Detect if Ollama is missing
2. Show user dialog with explanation
3. Open official download page
4. Provide platform-specific instructions
5. User completes installation manually
6. App verifies installation on retry

### 5. File Processing (`electron/processing/`)

**Core Modules:**
- `file-processor.ts` - Main file processing orchestration
- `processing-scheduler.ts` - Auto-processing of pending files
- `upload-queue.ts` - Upload retry logic

**Process Flow:**
```
1. Receive file path from renderer
2. Extract text (pdf-parse, mammoth, tesseract.js)
3. Analyze with AI (Ollama via ai-analyzer.ts)
4. Filter tags (tag-validator.ts)
5. Upload to Evernote (evernote/client.ts)
6. Emit progress events via IPC
```

## Code Organization

### Pure Function Modules

The codebase uses pure function modules for better testability and maintainability:

**ENML Helpers** (`electron/evernote/enml-helpers.ts`)
- Pure functions for ENML generation
- XML escaping, MIME types, MD5 hashing
- 100% test coverage (42 tests)
- No side effects, easy to test

**Progress Helpers** (`electron/utils/progress-helpers.ts`)
- Pure functions for progress calculation
- Stage messages, error formatting, duration formatting
- File type validation
- 100% test coverage (54 tests)

**File State Reducers** (`electron/utils/file-state-reducer.ts`)
- Pure state transformation functions
- Immutable array operations (Redux-style)
- 100% test coverage (30 tests)

**Benefits:**
- Pure functions = easy to test and reason about
- No side effects = predictable behavior
- Type-safe = catch errors at compile time
- Reusable = DRY principle

## Inter-Process Communication (IPC)

### Communication Pattern

```
                IPC                      Inject
  Renderer  -------> Main Process  ----------------> Core Modules
 (React UI) <-------   (Node.js)   <----------------  (electron/)
              Events     │                Results
                         │
                         └── ProgressReporter Interface
                              └── IPCProgressReporter
                                    └── Sends events to Renderer
```

**Architecture:**
- Main process creates `IPCProgressReporter(mainWindow)`
- Business logic depends on `ProgressReporter` interface (not `BrowserWindow`)
- `IPCProgressReporter` translates interface calls to Electron IPC
- Renderer subscribes to IPC events via `electronAPI`

**IPC Events:**
- `file-progress` - File processing progress updates
- `file-removed-from-queue` - File removed from database after upload
- `augment-progress` - Note augmentation progress
- `batch-progress` - Batch processing status
- `download-progress` - Model download status

**IPC Handlers:**
- `analyze-file` - Stage 1: Extract and analyze (injects `ProgressReporter`)
- `processFile()` - Process single file (injects `ProgressReporter`)
- `processBatch()` - Process folder (injects `ProgressReporter`)
- `augment-note` - Augment existing note (injects `ProgressReporter`)
- `authenticateEvernote()` - OAuth flow
- `checkOllamaStatus()` - Ollama installation check
- `getAllItems()` - Get files and notes from database

**Abstraction Benefits:**
- Business logic never directly accesses `BrowserWindow`
- Can test without Electron (use `MockProgressReporter`)
- Can replace IPC with other transports (WebSockets, HTTP, etc.)
- Type-safe event payloads

See [IPC API Reference](../05-reference/electron-ipc-api.md) for complete API.

## Technology Stack

### Core Technologies
- **Electron 38+**: Desktop app framework
- **React 19+**: UI library with hooks
- **TypeScript 5+**: Type safety
- **Vite 7+**: Build tool and dev server
- **Node.js**: Runtime for main process

### Key Dependencies
- **electron-builder**: macOS packaging and distribution
- **electron-store**: Settings persistence
- **vite-plugin-electron**: Electron + Vite integration
- **better-sqlite3**: SQLite database for queue management
- **@tanstack/react-query**: Server state management

### Processing Dependencies
- **ollama**: AI model interaction
- **evernote**: Evernote API SDK
- **pdf-parse**: PDF text extraction
- **tesseract.js**: OCR for images
- **mammoth**: Word document parsing
- **@napi-rs/canvas**: Native canvas for PDF rendering

## File Structure

```
evernote-ai-importer/
├── electron/                    # Electron-specific code
│   ├── main.ts                  # Main process entry
│   ├── preload.ts               # IPC bridge
│   ├── ai/
│   │   ├── ai-analyzer.ts       # AI analysis orchestration
│   │   ├── ollama-manager.ts    # Ollama service management
│   │   └── content-analysis-workflow.ts  # Shared AI pipeline
│   ├── evernote/
│   │   ├── client.ts            # Note operations
│   │   ├── oauth-helper.ts      # OAuth authentication
│   │   ├── tag-cache.ts         # Tag caching service
│   │   ├── tag-validator.ts     # Tag validation
│   │   ├── enml-helpers.ts      # Pure ENML functions
│   │   └── note-augmenter.ts    # Note augmentation logic
│   ├── processing/
│   │   ├── file-processor.ts    # File processing
│   │   ├── processing-scheduler.ts  # Auto-processing
│   │   ├── upload-queue.ts      # Upload retry logic
│   │   └── progress-helpers.ts  # Pure progress functions
│   ├── database/
│   │   ├── queue-db.ts          # SQLite database operations
│   │   └── schema.sql           # Database schema
│   ├── utils/
│   │   ├── file-state-reducer.ts    # Pure state functions
│   │   ├── db-to-ui-mapper.ts       # Database to UI mapping
│   │   └── ai-response-parser.ts    # AI response parsing
│   └── renderer/                # React UI
│       ├── main.tsx             # React entry point
│       ├── App.tsx              # Root component (191 lines)
│       ├── hooks/               # Custom React hooks
│       │   ├── useFileProcessing.ts
│       │   ├── useNotebooks.ts
│       │   ├── useNoteAugmentation.ts
│       │   └── useOllamaStatus.ts
│       ├── components/          # UI components
│       │   ├── UnifiedList.tsx
│       │   ├── UnifiedItemCard.tsx
│       │   ├── SearchableNotebookSelector.tsx
│       │   ├── WelcomeWizard.tsx
│       │   ├── DropZone.tsx
│       │   ├── Settings.tsx
│       │   └── StatusBar.tsx
│       └── styles.css           # Global styles
│
├── build/                       # Build assets
│   └── entitlements.mac.plist   # macOS code signing
│
├── specs/                       # Documentation
│
├── tests/                       # Test files
│   ├── unit/                    # Unit tests
│   └── integration/             # Integration tests
│
├── index.html                   # Vite HTML template
├── vite.config.ts               # Vite configuration
├── tsconfig.json                # TypeScript config
├── electron-builder.json        # Packaging config
└── package.json                 # Dependencies and scripts
```

## Security Considerations

### Context Isolation
- ✅ Enabled: Renderer has no direct access to Node.js
- ✅ Preload script as controlled bridge
- ✅ Explicit API surface via contextBridge

### Code Signing (Production)
- macOS: Developer ID certificate required
- Hardened runtime enabled
- Notarization for Gatekeeper approval
- Entitlements file for required permissions

### Data Security
- Settings stored in OS-appropriate location
- Evernote tokens stored in `.evernote-token` file (user-only permissions)
- No data sent to external services (except Evernote API)
- All AI processing local via Ollama

## Performance Considerations

### App Size
- **Base app**: ~180-200MB (Electron + React + dependencies)
- **With Ollama**: N/A (user installs separately)
- **With models**: N/A (downloaded on-demand)

### Memory Usage
- Electron overhead: ~100-150MB
- React renderer: ~50-100MB
- Ollama (separate process): 1-4GB (model-dependent)
- Peak during file processing: ~500MB-1GB

### Startup Time
- Cold start: ~2-3 seconds
- Warm start: ~1-2 seconds
- First-time setup: Variable (depends on Ollama/model download)

## Error Handling

### User-Facing Errors
- Ollama not installed → Welcome wizard with instructions
- Ollama not running → Status bar warning + auto-start attempt
- Model not available → Download prompt in settings
- Evernote auth failed → Re-authentication prompt
- File processing failed → Error shown in queue with retry option

## Testing

**Test Coverage:**
- Pure functions: 100% (ENML helpers, progress helpers, state reducers)
- Database operations: 90%+ (queue-db.ts)
- Core processing: 85%+ (file-processor, ai-analyzer)
- React components: 70%+ (critical paths)

**Test Types:**
- **Unit tests**: Pure functions, utilities, isolated logic
- **Integration tests**: Full processing flows, IPC communication
- **E2E tests**: User workflows (planned)

**Key Test Files:**
- `tests/unit/enml-helpers.test.ts` (42 tests)
- `tests/unit/progress-helpers.test.ts` (54 tests)
- `tests/unit/file-state-reducer.test.ts` (30 tests)
- `tests/unit/queue-db.test.ts` (32 tests)

See [Testing Strategy](../03-development/testing-strategy.md) for details.

## Future Enhancements

### Planned Features
- [ ] Menu bar (tray) icon for quick access
- [ ] Batch folder processing with concurrent limits
- [ ] Custom model selection per file type
- [ ] Dark mode support
- [ ] Auto-updater integration
- [ ] Windows/Linux support

### Potential Improvements
- [ ] Model download progress in welcome wizard
- [ ] Custom tag creation
- [ ] File preview before processing
- [ ] Processing history/logs
- [ ] Export processed metadata to JSON
- [ ] Keyboard shortcuts
