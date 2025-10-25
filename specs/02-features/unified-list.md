# Unified List View

> **Type:** Feature
> **Last Updated:** October 2025
> **Implemented:** Yes

## What It Is

The app displays all your content in a single, unified list view. This list seamlessly combines files being processed (new uploads) with existing Evernote notes (available for augmentation). You can see everything in one place: files currently being analyzed, notes ready to augment, completed uploads, and any errors that need attention.

## How It Works

When you open the app, you see one list that contains both:
- **Files you're importing** - New files being processed and uploaded to Evernote
- **Existing notes** - Notes already in Evernote that can be enhanced with AI

The list automatically merges these two types of content and displays them together with a smart sorting system that keeps the most important items at the top.

## What You See

The interface uses a compact list design to maximize visible items:

```
┌────────────────────────────────────────────────────────────────┐
│  Unified List                                                  │
│  ──────────────────────────────────────────────────────────── │
│  🔄 file1.pdf                                        45%       │
│  ████████████████████░░░░░░░░░░░ Analyzing with AI...         │
│                                                                │
│  ❌ file2.pdf                                      [Retry]     │
│     Error: Failed to extract content from encrypted PDF       │
│                                                                │
│  📝 Meeting Notes Q4 2024           Oct 15, 2024  [Augment]   │
│     work • planning • finance                                  │
│                                                                │
│  📄 report.pdf                                                 │
│     Uploaded to Evernote successfully     View in Evernote →  │
│                                                                │
│  📝 Financial Summary                   Sep 28, 2024           │
│     finance • reports • ✓ AI Augmented (Oct 22, 2024)         │
│                                                                │
│  [Drop files anywhere to import]                              │
└────────────────────────────────────────────────────────────────┘
```

## Item Display

Each item in the list shows different information depending on what it is:

### Files Being Processed

New files being uploaded to Evernote display:
- File name (e.g., "report.pdf")
- Processing status (Extracting, Analyzing, Uploading)
- Progress bar showing completion percentage
- Status message explaining current step

### Error Display

When an error occurs, the row maintains its structure:
- **Row 1:** Error icon, title, date, retry button
- **Row 2:** Error message

Both files and notes show retry buttons in error state. This ensures users can always see what failed and when, with easy access to retry.

### Existing Notes

Notes already in Evernote use a compact two-row layout:

**Row 1:** Icon, title, creation date, and action button
**Row 2:** Tags (inline with bullet separators) and augmentation status

Information shown:
- Note title
- Tags applied to the note (displayed inline)
- Creation date
- Augmentation status badge (if already enhanced with AI)
- Augment button (for notes not yet augmented)

## Compact Design

The list uses a space-efficient design that fits more items on screen while maintaining readability.

### Note Card Layout

Each note card uses exactly two rows of information:

```
┌──────────────────────────────────────────────────────────────┐
│ 📝 Meeting Notes Q4 2024           Oct 15, 2024  [Augment]   │
│    work • planning • finance                                  │
└──────────────────────────────────────────────────────────────┘
```

**First Row:**
- Document icon (📝)
- Note title
- Creation date
- Action button (if not augmented)

**Second Row:**
- Tags displayed inline with bullet separators (•)
- Augmentation badge (if already enhanced)

For augmented notes, the layout looks like this:

```
┌──────────────────────────────────────────────────────────────┐
│ 📝 Financial Summary                   Sep 28, 2024           │
│    finance • reports • ✓ AI Augmented (Oct 22, 2024)         │
└──────────────────────────────────────────────────────────────┘
```

### Space Efficiency

The compact layout achieves:
- **45% height reduction** compared to traditional multi-row cards
- **2-3x more visible items** on screen at once
- All essential information still visible at a glance
- Clean, scannable design

## Smart Sorting

The list automatically organizes items to keep important things visible:

1. **Ready to Work** (⏸️) - Items ready for action appear at the very top, sorted by date (newest first):
   - Newly dropped files (pending)
   - Files analyzed and ready to upload to Evernote
   - Notes ready to augment
2. **Active Processing** (🔄) - Files currently being worked on appear next so you can monitor progress
3. **Errors** (❌) - Any failures appear after processing items, requiring your attention
4. **Completed** (✅) - Successfully processed items appear at the bottom, sorted by date (newest first)

This means newly dropped files and files ready to upload immediately appear at the top for instant visual feedback, followed by active work, errors that need attention, and completed items at the bottom.

## Interactions

### Title Bar Controls

The title bar provides quick access to common actions:

**Searchable Notebook Selector** - Choose which notebook to view notes from
- Type to filter notebooks by name
- Keyboard navigation support (arrow keys, enter, escape)
- Shows selected notebook with checkmark

**Refresh Button** - Manually refresh the notes list
- Icon spins during refresh
- Disabled while loading
- Useful after making changes in Evernote

**Clear Completed Button** - Remove completed files from the list
- Only visible when completed files exist
- Shows count of completed files (e.g., "Clear 3")
- Removes files from database after successful upload

### Drag and Drop Files

You can drop files anywhere on the list at any time:
- When the list is empty, you see a drop zone invitation
- When the list has items, dragging files over it shows a drop overlay
- Files automatically start processing when dropped

### Work with Notes

For existing Evernote notes in the list:
- Click "Augment" button to enhance a note with AI-generated analysis
- See augmentation status badges showing which notes have been enhanced
- View note metadata like tags and creation date at a glance

### Manage Files

For files being processed:
- Watch real-time progress as files are analyzed
- See status messages explaining each step
- Retry failed files or notes with one click
- View complete results including generated titles, descriptions, and tags

### Auto-Refresh Behavior

The list automatically refreshes in these scenarios:
- After a file completes uploading to Evernote (1.5s delay)
- After a note completes augmentation
- This ensures newly created/updated notes appear without manual refresh

## Visual Indicators

The interface uses clear visual indicators to show status. All icons are provided by **Lucide React**, a professional icon library that renders SVG-based icons. This ensures icons are crisp, scalable, and consistent across the interface.

### Status Badges
- 🔄 **Processing** - Blue, shows work in progress
- ✅ **Complete** - Green, indicates successful completion
- ❌ **Error** - Red, signals something went wrong
- ⏸️ **Ready** - Gray, waiting for the next step
- ⏱️ **Rate Limited** - Orange, temporary delay from Evernote

### Progress Bars
Files being processed show a progress bar that fills from left to right:
```
████████████████░░░░░░░░░░░░░░░░ 45%
```

### Status Messages
Each item shows a brief message explaining its current state:
- "Extracting content from PDF..."
- "Analyzing with AI..."
- "Uploading to Evernote..."
- "Complete - view in Evernote →"
- "Waiting 45s before retry..."

## Empty State

When you first open the app or after clearing all items, you see a friendly drop zone:

```
┌────────────────┐
│                │
│       📁       │
│                │
│  Drop files    │
│     here       │
│                │
│  Drag and drop │
│  your files to │
│   get started  │
│                │
└────────────────┘
```

This immediately shows you how to get started - just drag files into the window.

## Always Available

The drop zone functionality is always present, even when the list contains items. You can drop new files at any time without needing to navigate to a different screen or clear the existing list.

## Data Flow

The unified list pulls data from two sources and merges them for display:

```
┌─────────────────────────────────────────┐
│         Data Sources                    │
│                                         │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │ Evernote API │  │ Upload Queue DB │ │
│  └──────┬───────┘  └────────┬────────┘ │
│         │                   │          │
│         ▼                   ▼          │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │   Notes      │  │     Files       │ │
│  └──────┬───────┘  └────────┬────────┘ │
└─────────┼──────────────────┼───────────┘
          │                  │
          │   Merge & Sort   │
          │                  │
          ▼                  ▼
    ┌─────────────────────────────┐
    │    Unified List             │
    │  (merged & sorted)          │
    └─────────┬───────────────────┘
              │
              ▼
    ┌─────────────────────────────┐
    │   Display as Cards          │
    │  ┌─────────────────────┐    │
    │  │ File Card           │    │
    │  │ Note Card           │    │
    │  │ File Card           │    │
    │  └─────────────────────┘    │
    └─────────────────────────────┘
```

The app fetches your existing notes from Evernote and files from the local processing queue, combines them into a single list, sorts them intelligently, and displays each one as an appropriate card.

## User Benefits

This unified approach provides several advantages:

**Single View** - See all your content in one place without switching between different screens or sections

**Smart Prioritization** - Important items (active work, errors) automatically appear at the top where you'll notice them

**Space Efficiency** - Compact two-row layout lets you see 2-3x more items on screen at once while keeping all essential information visible

**Consistent Experience** - All items use the same card design, status indicators, and interaction patterns

**Flexible Workflow** - Drop files to start new imports while monitoring existing work and augmenting notes - all in the same view

**Clear Status** - Visual indicators and progress bars make it obvious what's happening with each item

## Performance

The list efficiently handles both small and large collections:
- Items update in real-time as processing progresses
- Only changed items refresh, keeping the interface responsive
- The unified view uses less memory than separate lists
- React efficiently tracks each item by its unique identifier

This architecture ensures the interface stays fast and responsive even when processing multiple files simultaneously.
