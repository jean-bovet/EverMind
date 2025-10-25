# User Experience Flows

> **Type:** User Guide
> **Last Updated:** October 2025

## Overview

This document outlines the complete user experience flows for the Electron app, from first launch to daily use.

## Primary User Flows

> **Note:** For detailed implementation of Note Augmentation feature, see [note-augmentation-feature.md](./note-augmentation-feature.md)

### 1. First-Time Setup Flow

**User Goal:** Get the app running and ready to import files

```
Launch App (First Time)
    |
    v
Ollama Status Check
    |
    +-> Ollama Running -> Skip to Evernote Auth
    |
    +-> Ollama Not Found
         |
         v

 +--------------------------------------+
 | Welcome Wizard - Step 1              |
 |                                      |
 | Welcome to Evernote AI Importer      |
 |                                      |
 | This app uses Ollama to analyze your |
 | files locally with AI. Let's get you |
 | set up in just a few steps.          |
 |                                      |
 | 1. Install Ollama <- YOU ARE HERE    |
 | 2. Download AI Model                 |
 | 3. Connect Evernote                  |
 |                                      |
 |  [Install Ollama]  [Skip Setup]      |
 +--------------------------------------+
         |
         v (Install Ollama clicked)

Open Browser -> https://ollama.com/download/mac
         |
         v

 +--------------------------------------+
 | Installing Ollama                    |
 |                                      |
 | Follow the installation instructions |
 | in your browser. Once you've         |
 | completed the installation and       |
 | Ollama is running, click "Check      |
 | Again" below.                        |
 |                                      |
 |  [Check Again]  [I'll Do This Later] |
 +--------------------------------------+
         |
         v (Check Again clicked)

Re-check Ollama Status
         |
         +-> Not Found -> Repeat prompt
         |
         +-> Found and Running
              |
              v

 +--------------------------------------+
 | Welcome Wizard - Step 2              |
 |                                      |
 | Download AI Model                    |
 |                                      |
 | Ollama is ready! Now let's download  |
 | the Mistral model (~4GB). This will  |
 | take a few minutes depending on your |
 | connection.                          |
 |                                      |
 | Mistral (Recommended)                |
 | Fast and efficient, great for        |
 | document analysis. Size: ~4GB        |
 |                                      |
 |  [Download Mistral]  [I Already Have]|
 +--------------------------------------+
         |
         v (Download Mistral clicked)

 +--------------------------------------+
 | Downloading Mistral                  |
 |                                      |
 | [################......] 67%         |
 |                                      |
 | 2.7GB / 4.1GB                        |
 | Downloading...                       |
 +--------------------------------------+
         |
         v Download Complete

 +--------------------------------------+
 | Welcome Wizard - Step 3 (Future)     |
 |                                      |
 | Connect Evernote                     |
 |                                      |
 | Connect your Evernote account to     |
 | start importing files.               |
 |                                      |
 |  [Connect Evernote]  [Do This Later] |
 +--------------------------------------+
         |
         v
Setup Complete -> Main App Screen
```

### 2. Daily Use Flow - Import Single File

**User Goal:** Import a PDF document to Evernote with AI analysis

```
Main App Screen
    |
    v

 +--------------------------------------+
 | Evernote AI Importer          [gear]|
 |                                      |
 |  Drop files or folders here          |
 |                                      |
 |  Drag and drop your files to get     |
 |  started                             |
 |                                      |
 |                                      |
 | [check] Ollama: Running | 3 models   |
 +--------------------------------------+
         |
         v User drags "report.pdf" from Finder

Drop Zone Highlights (blue border)
         |
         v User drops file

File Added to Queue
         |
         v

 +--------------------------------------+
 | Evernote AI Importer          [gear]|
 |                                      |
 |  1 file in queue                     |
 |                                      |
 |  [Process 1 file]  [Clear All]       |
 |                                      |
 |  +--------------------------------+  |
 |  | [file] report.pdf              |  |
 |  | [clock] Pending                |  |
 |  +--------------------------------+  |
 |                                      |
 | [check] Ollama: Running | 3 models   |
 +--------------------------------------+
         |
         v User clicks [Process 1 file]

Processing Starts
         |
         v

 +--------------------------------+
 | [file] report.pdf              |
 | [gear] Processing              |
 | [##############......] 35%     |
 +--------------------------------+
         |
         v Processing Complete

 +--------------------------------+
 | [file] report.pdf              |
 | [check] Complete               |
 |                                |
 | Q3 2024 Financial Report       |
 | Comprehensive financial        |
 | analysis for Q3 2024           |
 | including revenue...           |
 |                                |
 | [tag] finance | reports | 2024 |
 |                                |
 | View in Evernote ->            |
 +--------------------------------+
```

### 3. Batch Import Flow - Process Folder

**User Goal:** Import multiple documents from a folder

```
Main App Screen
    |
    v User drags "Documents/Projects" folder from Finder

Drop Zone Highlights (blue border)
    |
    v User drops folder

Folder Contents Scanned
    |
    v

 +--------------------------------------+
 | 15 files in queue (0 pending)        |
 |                                      |
 |  [Process 15 files]  [Clear All]     |
 |                                      |
 |  +--------------------------------+  |
 |  | [file] proposal.pdf            |  |
 |  | [clock] Pending                |  |
 |  +--------------------------------+  |
 |  | [file] contract.docx           |  |
 |  | [clock] Pending                |  |
 |  +--------------------------------+  |
 |  | [file] diagram.png             |  |
 |  | [clock] Pending                |  |
 |  +--------------------------------+  |
 |  | [file] notes.txt               |  |
 |  | [clock] Pending                |  |
 |  +--------------------------------+  |
 |  | ... (11 more files)            |  |
 |  +--------------------------------+  |
 +--------------------------------------+
         |
         v User clicks [Process 15 files]

Batch Processing Starts
         |
         v

 +--------------------------------+
 | [file] proposal.pdf            |
 | [gear] Processing              |
 | [##################......] 70% |
 +--------------------------------+
 | [file] contract.docx           |
 | [clock] Pending                |
 +--------------------------------+
 | [file] diagram.png             |
 | [clock] Pending                |
 +--------------------------------+
         |
         v Files Process Sequentially
         |
         v All Complete

 +--------------------------------------+
 | 15 files in queue                    |
 |                                      |
 |  [Clear Completed]  [Clear All]      |
 |                                      |
 |  +--------------------------------+  |
 |  | [file] proposal.pdf            |  |
 |  | [check] Complete               |  |
 |  | Project Proposal 2024          |  |
 |  +--------------------------------+  |
 |  | [file] contract.docx           |  |
 |  | [check] Complete               |  |
 |  | Service Agreement...           |  |
 |  +--------------------------------+  |
 |  | [file] diagram.png             |  |
 |  | [check] Complete               |  |
 |  | System Architecture Diagram    |  |
 |  +--------------------------------+  |
 |  | ... (12 more complete)         |  |
 |  +--------------------------------+  |
 +--------------------------------------+
```

### 4. Settings Configuration Flow

**User Goal:** Configure Ollama model and Evernote connection

```
Main App Screen
    |
    v User clicks [gear] Settings Button

Settings Modal Opens
    |
    v

 +--------------------------------------+
 | Settings                       [X]   |
 +--------------------------------------+
 |                                      |
 | Ollama Model                         |
 | +----------------------------------+ |
 | | Mistral (Recommended)      [v]   | |
 | +----------------------------------+ |
 | Make sure the model is downloaded   |
 | before using it                      |
 |                                      |
 |                                      |
 | Evernote Account                     |
 | +----------------------------------+ |
 | | [check] Connected to Evernote    | |
 | +----------------------------------+ |
 | [Logout]                             |
 |                                      |
 |                                      |
 | Ollama Status                        |
 | [Refresh Status]                     |
 |                                      |
 +--------------------------------------+
         |
         v User selects "Llama 3.1 8B"

Check if Model Installed
         |
         +-> Installed -> Use it immediately
         |
         +-> Not Installed
              |
              v

 +--------------------------------------+
 | Download Llama 3.1 8B?               |
 |                                      |
 | Size: ~4.7GB                         |
 | This will take a few minutes         |
 |                                      |
 |  [Download]  [Cancel]                |
 +--------------------------------------+
         |
         v (Download clicked)

Model Download Progress
         |
         v Complete

Model Ready to Use
```

### 5. Evernote Authentication Flow

**User Goal:** Connect Evernote account for the first time

```
Settings Modal
    |
    v Evernote Not Connected

 +--------------------------------------+
 | Evernote Account                     |
 |                                      |
 | Connect your Evernote account to     |
 | start importing files                |
 |                                      |
 |  [Connect Evernote]                  |
 +--------------------------------------+
         |
         v User clicks [Connect Evernote]

OAuth Flow Starts (via OAuth Helper)
         |
         +-> Browser Opens
         |   |
         |   v User logs in to Evernote
         |   |
         |   v User authorizes app
         |   |
         |   v Verification code shown
         |
         +-> Terminal Prompt (in background)
              Enter verification code: _____
              |
              v User enters code
              |
              v Token Saved
              |
              v

 +--------------------------------------+
 | Evernote Account                     |
 | +----------------------------------+ |
 | | [check] Connected to Evernote    | |
 | +----------------------------------+ |
 | [Logout]                             |
 +--------------------------------------+
```

### 6. Note Augmentation Flow

**User Goal:** Augment existing Evernote notes with AI analysis

```
Main App Screen
    |
    v User clicks "Augment Notes" tab

Tab Switches to Augment View
    |
    v

 +--------------------------------------+
 | Evernote AI Importer          [gear]|
 |                                      |
 | [Import Files] [Augment Notes]       |
 |     (active tab underlined)          |
 |                                      |
 | Notebook: [Documents v]      [🔄]    |
 |                                      |
 | Loading notes...                     |
 +--------------------------------------+
         |
         v Notebooks and notes loaded

 +--------------------------------------+
 | Augment Existing Notes               |
 |                                      |
 | Notebook: [Documents v]      [🔄]    |
 |                                      |
 | +----------------------------------+ |
 | | Meeting Notes Q4 2024            | |
 | | 📅 Created: Oct 15, 2025         | |
 | | 🔄 Updated: Oct 20, 2025         | |
 | | 🏷️ meetings | planning           | |
 | |                                  | |
 | | Content: Discussed Q4 plans...   | |
 | |                                  | |
 | |              [🤖 Augment with AI]| |
 | +----------------------------------+ |
 | | Financial Report 2025            | |
 | | 📅 Created: Sep 30, 2025         | |
 | | 🏷️ finance                       | |
 | | ✓ AI Augmented (10/22/2025)     | |
 | |              [Already Augmented] | |
 | +----------------------------------+ |
 | | Vacation Photos                  | |
 | | 📅 Created: Aug 12, 2025         | |
 | |                                  | |
 | |              [🤖 Augment with AI]| |
 | +----------------------------------+ |
 +--------------------------------------+
         |
         v User clicks [Augment with AI] on first note

Augmentation Starts
         |
         v

 +--------------------------------------+
 | [################......] 65%         |
 | Analyzing content with AI...         |
 +--------------------------------------+
         |
         v Progress updates in real-time:
         |
         +-> Fetching note from Evernote... (10%)
         +-> Extracting text from note... (20%)
         +-> Analyzing content with AI... (30-70%)
         +-> Building augmented note... (80%)
         +-> Updating note in Evernote... (90%)
         +-> Complete! (100%)

Note Updated
         |
         v Card refreshes automatically

 +----------------------------------+
 | Meeting Notes Q4 2024            |
 | 📅 Created: Oct 15, 2025         |
 | 🔄 Updated: Oct 22, 2025         |
 | 🏷️ meetings | planning           |
 | ✓ AI Augmented (10/22/2025)     |
 |                                  |
 | Content: Discussed Q4 plans...   |
 |                                  |
 |              [Already Augmented] |
 +----------------------------------+
```

**What Happens Behind the Scenes:**
1. App fetches the complete note from Evernote (including attachments)
2. Converts ENML (Evernote's XML format) to plain text
3. Extracts text from PDF/image attachments via OCR if present
4. Sends combined text to Ollama for AI analysis
5. AI generates summary, description, and suggested tags
6. App appends AI analysis to the original note content
7. Updates note in Evernote with:
   - Augmented content (original + AI analysis)
   - Metadata tracking (aiAugmented: true, date stamp)
8. Badge appears showing "AI Augmented" status

**Error Handling:**
- Network errors: "Unable to connect to Evernote. Check your connection."
- Rate limits: "Rate limit exceeded. Retrying in 60 seconds..."
- AI errors: "AI analysis failed. Please try again."

## Secondary User Flows

### 7. Error Recovery Flow - Ollama Crash

**Scenario:** Ollama crashes while processing files

```
Processing Files
    |
    v Ollama Crashes

Files in Queue Show Error
    |
    v

 +--------------------------------+
 | [file] document.pdf            |
 | [X] Error                      |
 | Connection to Ollama lost      |
 +--------------------------------+

 [X] Ollama: Stopped
         |
         v User clicks Settings -> Refresh Status

App Detects Ollama Stopped
         |
         v

 +--------------------------------------+
 | Ollama Not Running                   |
 |                                      |
 | Ollama has stopped. Would you like   |
 | to restart it?                       |
 |                                      |
 |  [Restart Ollama]  [Cancel]          |
 +--------------------------------------+
         |
         v (Restart clicked)

App Starts Ollama
         |
         v Started Successfully

User Can Retry Failed Files
```

### 8. Drag-and-Drop Flow

**User Goal:** Quick file import via drag-and-drop

```
User Drags File from Finder
    |
    v File Hovers Over App Window

Drop Zone Highlights
    |
    v

 +--------------------------------------+
 |  Drop files or folders here          |
 |  [HIGHLIGHTED - blue border]         |
 |  Drag and drop your files to get     |
 |  started                             |
 +--------------------------------------+
         |
         v User Drops File

File Added to Queue
```

### 9. Clear Queue Flow

**User Goal:** Remove processed files from queue

```
Queue with Completed Files
    |
    v User clicks [Clear Completed]

Completed Files Removed
    |
    v
Only Pending/Processing Files Remain
    |
    v User clicks [Clear All]

Confirmation Dialog (Future Enhancement)
    |
    v
All Files Removed from Queue
```

## User Interface States

### App States

1. **Loading State**
   - App window visible but content loading
   - Duration: ~1-2 seconds on launch

2. **Welcome State**
   - First-time setup wizard
   - Ollama not installed

3. **Ready State**
   - Ollama running, Evernote connected
   - Drop zone visible, ready for files

4. **Processing State**
   - Files in queue being processed
   - Progress bars visible
   - Process button disabled

5. **Error State**
   - Ollama disconnected or errors occurred
   - Error messages displayed
   - Recovery actions available

### File States

1. **Pending** ([clock])
   - File added to queue but not started
   - Grey background

2. **Processing** ([gear])
   - File currently being processed
   - Blue border, progress bar visible

3. **Complete** ([check])
   - Processing successful
   - Green border, results shown

4. **Error** ([X])
   - Processing failed
   - Red border, error message shown

## Keyboard Shortcuts (Future Enhancement)

| Shortcut | Action |
|----------|--------|
| Cmd+, | Open settings |
| Cmd+R | Refresh Ollama status |
| Cmd+W | Close settings modal |
| Esc | Close modals |
| Cmd+Delete | Clear completed files |

## Accessibility Considerations

### Screen Reader Support

- Alt text for all icons and images
- Aria labels for interactive elements
- Keyboard navigation support

### Visual Accessibility

- High contrast colors
- Clear status indicators (not color-only)
- Scalable text (respects system settings)

### Motor Accessibility

- Large click targets (buttons min 44x44px)
- Drag-and-drop is the primary input method
- No time-sensitive interactions

## Performance Expectations

### Response Times

| Action | Expected Time | User Feedback |
|--------|---------------|---------------|
| App Launch | 2-3 seconds | Splash screen |
| Ollama Status Check | <1 second | Instant |
| Model Download | 3-10 minutes | Progress bar |
| File Processing | 10-60 seconds | Progress updates |
| Settings Save | Instant | Visual confirmation |

### Processing Speed

| File Type | Size | Expected Time |
|-----------|------|---------------|
| PDF (10 pages) | 1MB | 15-20 seconds |
| DOCX | 500KB | 10-15 seconds |
| Image (PNG) | 2MB | 20-30 seconds |
| Text | 100KB | 5-10 seconds |

## Error Messages

### User-Friendly Error Messages

**Technical:** "ECONNREFUSED localhost:11434"
**User Sees:** "Can't connect to Ollama. Is it running?"

**Technical:** "Model 'mistral' not found"
**User Sees:** "Model not available. Would you like to download it?"

**Technical:** "Rate limit exceeded (429)"
**User Sees:** "Evernote rate limit reached. We'll retry automatically."

**Technical:** "File not found"
**User Sees:** "Could not find this file. It may have been moved or deleted."

## Future Enhancements

### Planned

- [ ] Menu bar shortcut for quick import
- [ ] Recent files list
- [ ] Custom tag creation
- [ ] Notebook selection
- [ ] Dark mode toggle

### Considered

- [ ] Batch processing with parallel processing
- [ ] File preview before import
- [ ] Export metadata to JSON
- [ ] Processing history/logs
- [ ] Custom AI prompts per file type
