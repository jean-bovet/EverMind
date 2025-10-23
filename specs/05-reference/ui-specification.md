# UI Components Reference

> **Type:** Reference
> **Last Updated:** October 2025

## Overview

This document describes the user interface components and their behavior for the Electron app.

## Icon System

The app uses **Lucide React** for all icons throughout the interface.

**Benefits:**
- **Professional appearance** - Consistent, clean design language
- **SVG-based** - Crisp and sharp at any size, scalable without pixelation
- **Customizable** - Easy to adjust size, color, and stroke width
- **Accessible** - Better screen reader support than emoji
- **Animated** - Supports animations (e.g., spinning loader)

**Key Icons Used:**
- `FileText` - Documents and notes
- `Loader` - Processing states (animated spin)
- `CheckCircle2` - Success and completion
- `XCircle` - Errors
- `RotateCw` - Retry actions
- `Check` - Checkmarks and confirmation
- `AlertTriangle` - Warnings
- `Settings` - Settings button
- `FolderOpen` - Drop zones and file operations

All icons are React components imported from the `lucide-react` package and rendered as inline SVG elements.

---

## Layout Structure

### Overview
The app uses a vertical flex layout with three main structural components at the root level:

```
┌─────────────────────────────────────────────────────┐
│ Title Bar (52px fixed height)                      │ ← Top level
├─────────────────────────────────────────────────────┤
│                                                     │
│  Main Content Area (flexible, scrollable)          │ ← Middle level
│                                                     │
│  - Rate limit warnings (conditional)               │
│  - Unified list of notes/files                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│ Status Bar (fixed height)                          │ ← Bottom level
└─────────────────────────────────────────────────────┘
```

### Structural Benefits
- **Full-width header and footer**: Title bar and status bar span the entire window width, creating clear visual boundaries
- **Maximized content area**: Main content has 20px padding on all sides, with the list taking all available vertical space
- **Space optimization**: By moving controls to the title bar and status bar, more vertical space is available for content
- **Clear hierarchy**: Three-tier structure (header/content/footer) provides intuitive visual organization

### Technical Implementation
```
.app (height: 100vh, flex column)
├── .title-bar (flex-shrink: 0, no padding around it)
├── .main-content (flex: 1, padding: 20px, gap: 20px)
│   ├── .rate-limit-warning (conditional)
│   └── .unified-list (flex: 1, scrollable)
└── .status-bar (flex-shrink: 0, no padding around it)
```

---

## Drop Zone Component

### Purpose
The drop zone is the primary entry point for users to add files to the import queue. It accepts files via drag-and-drop interaction.

### Location
- Positioned in the center of the main app screen
- Visible when the app is in "Ready" state (Ollama installed and running)
- Hidden when the Welcome Wizard is displayed

### Visual Design

#### Default State
```
┌─────────────────────────────────────┐
│                                     │
│              📁                     │
│                                     │
│    Drop files or folders here       │
│                                     │
│  Drag and drop your files to get    │
│           started                   │
│                                     │
└─────────────────────────────────────┘
```

**Styling:**
- Background: Light grey (#f5f5f5 in light mode, #2a2a2a in dark mode)
- Border: 2px dashed grey (#cccccc)
- Border radius: 8px
- Padding: 60px
- Text alignment: Center
- Icon: 📁 (large, centered)
- Title: "Drop files or folders here" (24px, bold)
- Subtitle: "Drag and drop your files to get started" (16px, regular)

#### Drag Over State (Active)
```
┌═════════════════════════════════════┐
║                                     ║
║              📁                     ║
║                                     ║
║    Drop files or folders here       ║
║                                     ║
║  Drag and drop your files to get    ║
║           started                   ║
║                                     ║
└═════════════════════════════════════┘
```

**Styling Changes:**
- Background: Light blue (#e3f2fd)
- Border: 2px solid blue (#2196f3)
- Border becomes solid (not dashed)
- Slight scale transform (1.02) for visual feedback

#### Disabled State
When files are being processed (`isProcessing === true`):
- Opacity: 0.6
- Cursor: not-allowed
- No hover or drag effects
- All interactions disabled

### Behavior

#### Accepted File Types
The drop zone accepts all file types but the app processes:
- **Documents**: PDF, TXT, MD, Markdown, DOCX
- **Images**: PNG, JPG, JPEG, GIF, BMP, TIFF

#### Drag-and-Drop Interaction

1. **Drag Enter**
   - User drags file(s) from Finder/Explorer over the app window
   - Drop zone transitions to "Drag Over" state
   - Visual feedback appears immediately

2. **Drag Over**
   - While hovering with dragged files
   - Drop zone remains highlighted
   - Cursor shows "copy" indication

3. **Drag Leave**
   - User drags files away from the drop zone
   - Drop zone returns to default state
   - Highlight removed

4. **Drop**
   - User releases the mouse button to drop files
   - Drop zone returns to default state
   - Files are extracted and added to the queue
   - File paths are logged to console for debugging
   - If no valid file paths extracted, a warning is logged

#### File Path Extraction
- Uses Electron's `webUtils.getPathForFile()` API
- Handles both single and multiple file drops
- Filters out empty or invalid paths
- Supports both files and folders (folder support may process all files within)

#### Error Handling
- If file path extraction fails: Log error to console
- If no valid files dropped: Display warning "No file paths extracted from dropped files"
- Invalid file types: Currently accepted, will fail during processing with appropriate error message

### Technical Implementation

#### Component: `DropZone.tsx`
Located at: `electron/renderer/components/DropZone.tsx`

**Props:**
```typescript
interface DropZoneProps {
  onFilesAdded: (filePaths: string[]) => void;
  disabled?: boolean;
}
```

**State:**
```typescript
const [isDragOver, setIsDragOver] = useState(false);
```

**Event Handlers:**
- `handleDragOver`: Prevents default, sets drag over state
- `handleDragLeave`: Removes drag over state
- `handleDrop`: Extracts file paths and calls `onFilesAdded` callback

**CSS Classes:**
- `.drop-zone`: Base styling
- `.drop-zone.drag-over`: Applied during drag over
- `.drop-zone.disabled`: Applied when disabled

### User Feedback

#### Success Indicators
- Files appear immediately in the file queue below the drop zone
- No success message (presence in queue is confirmation)

#### Error Indicators
- Console warnings for debugging (not shown to user)
- Future: Toast notification for invalid file types

### Accessibility

#### Keyboard Support
- Future enhancement: Allow keyboard shortcut to trigger file picker
- Current: Drag-and-drop only (mouse/trackpad required)

#### Screen Reader
- ARIA label: "Drop zone for file import"
- Role: "region"
- Aria-label describes current state (default/active/disabled)

#### Visual
- High contrast border for visibility
- Clear text labels (not icon-only)
- Size is large enough for easy targeting (minimum 300x200px)

---

## File Queue Component

### Purpose
Displays all files that have been added for processing, showing their current status and results.

### Location
- Appears below the drop zone
- Only visible when files are present (`files.length > 0`)
- Scrollable if queue exceeds viewport height

### Visual Design

#### Queue Header
```
┌─────────────────────────────────────┐
│  1 file in queue                    │
│                                     │
│  [Process 1 file]  [Clear All]      │
└─────────────────────────────────────┘
```

#### File Item States

**Pending**
```
┌─────────────────────────────────────┐
│ 📄 report.pdf                       │
│ ⏳ Pending                          │
└─────────────────────────────────────┘
```

**Processing**
```
┌─────────────────────────────────────┐
│ 📄 report.pdf                       │
│ ⚙️ Processing                       │
│ [████████████░░░░░░] 60%            │
└─────────────────────────────────────┘
```

**Complete**
```
┌─────────────────────────────────────┐
│ 📄 report.pdf                       │
│ ✅ Complete                         │
│                                     │
│ Q3 2024 Financial Report            │
│ Comprehensive financial analysis    │
│ for Q3 2024...                      │
│                                     │
│ 🏷️ finance | reports | 2024        │
│                                     │
│ [View in Evernote →]                │
└─────────────────────────────────────┘
```

**Error**
```
┌─────────────────────────────────────┐
│ 📄 report.pdf                       │
│ ❌ Error                            │
│                                     │
│ Failed to process file: Connection  │
│ to Ollama lost                      │
│                                     │
│ [Retry]                             │
└─────────────────────────────────────┘
```

### Behavior

#### File Addition
- Files appear at the bottom of the queue
- Queue scrolls to show newly added files
- Counter updates to show total file count

#### Processing
- Files process sequentially (one at a time)
- Progress bar updates in real-time
- Status messages update during processing phases:
  - "Extracting text..."
  - "Analyzing with AI..."
  - "Creating note..."

#### Completion
- File remains in queue with results visible
- "Clear Completed" button becomes available
- Result can be clicked to view in Evernote

#### Queue Management
- **Process Button**: Starts processing all pending files
- **Clear Completed**: Removes only files with "Complete" status
- **Clear All**: Removes all files from queue

---

## Title Bar

### Purpose
Provides window drag functionality and houses the notebook selector control.

### Location
- Fixed at the top of the app window
- Spans the full width of the window
- Serves as the draggable area for moving the window

### Visual Design
```
┌─────────────────────────────────────────────────────┐
│                              [Notebook: ... ▾]      │
└─────────────────────────────────────────────────────┘
```

**Layout Components:**
- **Notebook Label**: "Notebook:" text label
- **Notebook Selector**: Dropdown showing current notebook with available options

### Styling
- Height: 52px
- Background: Dark grey (#252525)
- Padding: 0 20px
- Notebook selector positioned on the right side
- Controls are non-draggable (allow interaction), rest of title bar is draggable

**Notebook Selector Styling:**
- Padding: 6px 10px
- Background: Slightly lighter grey (#2a2a2a)
- Border: 1px solid #444
- Border radius: 5px
- Font size: 13px
- Minimum width: 200px
- Focus state: Blue border (#4a9eff)

### Behavior
- Title bar area allows window dragging (macOS/Windows behavior)
- Notebook selector shows loading state when notebooks are being fetched
- Dropdown displays all notebooks with "(Default)" label for the default notebook
- Selecting a notebook updates the notes list immediately

---

## Settings Modal

### Purpose
Configure Ollama model selection, view Evernote connection status, and check system status.

### Trigger
- Click the ⚙️ (Settings) button in the status bar at the bottom of the screen

### Visual Design
```
┌─────────────────────────────────────┐
│ Settings                       [×]   │
├─────────────────────────────────────┤
│                                     │
│ Ollama Model                        │
│ ┌─────────────────────────────────┐ │
│ │ Mistral (Recommended)        ▼  │ │
│ └─────────────────────────────────┘ │
│ Make sure the model is downloaded   │
│ before using it                     │
│                                     │
│                                     │
│ Evernote Account                    │
│ ┌─────────────────────────────────┐ │
│ │ ✅ Connected to Evernote        │ │
│ └─────────────────────────────────┘ │
│ [Logout]                            │
│                                     │
│                                     │
│ Ollama Status                       │
│ [Refresh Status]                    │
│                                     │
└─────────────────────────────────────┘
```

### Behavior

#### Model Selection
- Dropdown shows available/downloadable models
- If model not downloaded: Prompt to download
- Model switch: Immediate (no restart required)

#### Evernote Connection
- Shows connection status
- Logout button available when connected
- Connect button when disconnected

#### Status Refresh
- Re-checks Ollama installation and running status
- Updates model list
- Shows success/error feedback

---

## Status Bar

### Purpose
Displays real-time status of Ollama and provides quick access to settings at the bottom of the app.

### Location
- Fixed at the bottom of the app window, at the same structural level as the title bar
- Spans the full width of the window with no margins
- Always visible (except in Welcome Wizard)
- Separated from main content area by a top border

### Visual Design
```
┌─────────────────────────────────────────────────────┐
│ ● Ollama: Running  │  3 models available  │  [⚙]  │
└─────────────────────────────────────────────────────┘
```

**Layout Components:**
- **Status Indicator**: Colored dot + "Ollama: [status]" text
- **Models Count**: Number of available models (when models exist)
- **Version Display**: Ollama version (grayed out, when available)
- **Spacer**: Flexible space to push settings button to the right
- **Settings Button**: Gear icon button to open settings modal

**Status Indicator States:**
- 🟢 **Running**: Ollama detected and responding (green dot)
- 🟡 **Stopped**: Ollama not running or not found (orange dot)

### Styling
- Background: Dark grey (#252525)
- Border: 1px solid #333 (top only)
- Padding: 12px 20px
- Font size: 12px
- Gap between elements: 16px
- Settings button: Transparent background with border, hover effect

### Behavior
- Updates automatically when Ollama status changes
- Settings button opens the Settings modal when clicked
- Full-width footer design provides visual grounding to the interface

---

## Welcome Wizard

### Purpose
Guide first-time users through setup (Ollama installation and model download).

### Visual Design

#### Step 1: Ollama Installation
```
┌─────────────────────────────────────┐
│                                     │
│  Welcome to Evernote AI Importer    │
│                                     │
│  This app uses Ollama to analyze    │
│  your files locally with AI.        │
│                                     │
│  1. Install Ollama ← YOU ARE HERE   │
│  2. Download AI Model               │
│  3. Connect Evernote                │
│                                     │
│  [Install Ollama]  [Skip Setup]     │
│                                     │
└─────────────────────────────────────┘
```

#### Step 2: Model Download
```
┌─────────────────────────────────────┐
│                                     │
│  📥 Download AI Model               │
│                                     │
│  Ollama is ready! Now let's         │
│  download the Mistral model (~4GB). │
│                                     │
│  Mistral (Recommended)              │
│  Fast and efficient, great for      │
│  document analysis.                 │
│                                     │
│  [Download Mistral]  [Skip]         │
│                                     │
└─────────────────────────────────────┘
```

### Behavior
- Shows only on first launch if Ollama not detected
- Can be dismissed with "Skip Setup"
- Progress through steps automatically
- Closes when Ollama is running and model available

---

## Design Tokens

### Colors
```css
/* Light Mode */
--background: #ffffff
--surface: #f5f5f5
--border: #cccccc
--text-primary: #000000
--text-secondary: #666666
--accent: #2196f3
--success: #4caf50
--warning: #ff9800
--error: #f44336

/* Dark Mode */
--background: #1e1e1e
--surface: #2a2a2a
--border: #444444
--text-primary: #ffffff
--text-secondary: #aaaaaa
--accent: #2196f3
--success: #66bb6a
--warning: #ffa726
--error: #ef5350
```

### Typography
```css
--font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
--font-size-title: 24px
--font-size-body: 16px
--font-size-small: 14px
--font-weight-bold: 600
--font-weight-regular: 400
```

### Spacing
```css
--spacing-xs: 4px
--spacing-sm: 8px
--spacing-md: 16px
--spacing-lg: 24px
--spacing-xl: 32px
--spacing-xxl: 48px
```

### Borders
```css
--border-radius-sm: 4px
--border-radius-md: 8px
--border-radius-lg: 12px
--border-width: 2px
```

---

## Responsive Behavior

### Minimum Window Size
- Width: 800px
- Height: 600px

### Layout Adaptation
- Drop zone: Shrinks proportionally but maintains minimum height of 200px
- File queue: Becomes scrollable when exceeds available height
- Settings modal: Remains centered, scrollable on small screens

---

## Animation & Transitions

### Drop Zone
- Drag over transition: 150ms ease-in-out
- Scale transform: 1.0 → 1.02

### File Queue
- File addition: Slide in from bottom (200ms)
- Status change: Fade transition (300ms)
- Progress bar: Smooth fill animation

### Modals
- Open: Fade in + scale up (200ms)
- Close: Fade out + scale down (150ms)

---

## Future Enhancements

### Drop Zone
- [ ] Visual preview of file icons (PDF, DOCX, etc.)
- [ ] File type filtering with clear error messages
- [ ] Paste from clipboard support
- [ ] Keyboard shortcut to open file picker (Cmd+O)

### File Queue
- [ ] Drag to reorder files
- [ ] Search/filter queue
- [ ] Export queue results to CSV
- [ ] Batch edit tags before processing

### General UI
- [ ] Dark mode toggle in settings
- [ ] Customizable color themes
- [ ] Menu bar quick access
- [ ] Notification badges for completed files
