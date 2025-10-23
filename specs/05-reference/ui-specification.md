# UI Components Reference

> **Type:** Reference
> **Last Updated:** January 2025

## Overview

This document describes the user interface components and their behavior for the Electron app.

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

## Settings Modal

### Purpose
Configure Ollama model selection, view Evernote connection status, and check system status.

### Trigger
- Click the ⚙️ icon in the top-right corner of the main screen

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
Show real-time status of Ollama at the bottom of the app.

### Location
- Fixed at the bottom of the app window
- Always visible (except in Welcome Wizard)

### Visual Design
```
┌─────────────────────────────────────┐
│ 🟢 Ollama: Running | 3 models       │
└─────────────────────────────────────┘
```

**States:**
- 🟢 **Running**: Ollama detected and responding
- 🟡 **Starting**: Ollama detected but not responding yet
- 🔴 **Stopped**: Ollama not running or not found

### Behavior
- Updates automatically every 30 seconds
- Clickable to refresh status immediately
- Future: Click to open Settings

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
