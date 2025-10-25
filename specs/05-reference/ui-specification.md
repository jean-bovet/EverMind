# UI Components Reference

> **Type:** Reference
> **Last Updated:** October 2025

Reference for UI components, design system, and layout patterns.

## Icon System

**Library:** Lucide React (professional SVG icons)

**Key Icons:**
- `FileText` - Documents and notes
- `Loader` - Processing (animated spin)
- `CheckCircle2` - Success
- `XCircle` - Errors
- `RotateCw` - Retry/refresh
- `Trash2` - Delete/clear
- `AlertTriangle` - Warnings
- `Settings` - Settings
- `FolderOpen` - File operations
- `Search`, `ChevronDown`, `ChevronUp` - UI controls

**Benefits:** Consistent design, scalable SVG, customizable, accessible

## Layout Structure

### App Structure

```
┌─────────────────────────────────────┐
│ Title Bar (52px fixed)              │
├─────────────────────────────────────┤
│                                     │
│ Main Content Area (flex, scroll)   │
│   - Rate limit warnings             │
│   - Unified list (files & notes)   │
│                                     │
├─────────────────────────────────────┤
│ Status Bar (fixed)                  │
└─────────────────────────────────────┘
```

**Technical:**
- `.app` - 100vh, flex column
- `.title-bar` - Fixed height, no shrink
- `.main-content` - Flex: 1, 20px padding
- `.status-bar` - Fixed height, no shrink

**Benefits:**
- Full-width header/footer for clear boundaries
- Maximized content area with proper scrolling
- Clear visual hierarchy

## Key Components

### Title Bar

**Purpose:** App-level navigation and controls

**Elements:**
- Tab navigation: "Import Files" | "Augment Notes"
- Settings button (right-aligned)
- Selected tab highlighted with accent color

**File:** `electron/renderer/App.tsx`

### Drop Zone

**Purpose:** Primary entry point for file imports

**States:**
- **Default:** Dashed border, "Drop files or folders here" message
- **Drag Over:** Solid border, accent color, "Drop to add files" message
- **Disabled:** Grayed out when Ollama not ready

**Interactions:**
- Drag & drop files/folders
- Click "Select Files" button
- Click "Select Folder" button

**File:** `electron/renderer/components/DropZone.tsx`

### Unified List (Files & Notes)

**Purpose:** Shows all items (imported files and augmented notes)

**Features:**
- Combined view of files and notes
- Status-based filtering/sorting
- Search functionality
- "Clear Completed" button (removes successful uploads)
- "Refresh Notes" button (syncs augmented notes from Evernote)

**Item Card Displays:**
- Title and description
- Tags (inline, separated by •)
- Status badge (pending, analyzing, complete, error, augmented)
- Progress bar (0-100%)
- Action buttons (Retry, Augment, View Note)
- Timestamp (created/augmented date)

**Files:**
- `electron/renderer/components/UnifiedList.tsx`
- `electron/renderer/components/UnifiedItemCard.tsx`

### Searchable Notebook Selector

**Purpose:** Dropdown for selecting Evernote notebook

**Features:**
- Search/filter notebooks by name
- Keyboard navigation (arrow keys, enter, escape)
- Auto-focus on open
- Shows selected notebook name
- Chevron icon indicates open/closed state

**File:** `electron/renderer/components/SearchableNotebookSelector.tsx`

### Settings Modal

**Purpose:** Configure app settings

**Settings:**
- Ollama Model (text input, default: mistral)
- Ollama Host (text input, default: http://localhost:11434)
- Evernote Authentication (Connect/Logout button)

**Actions:**
- Save button (stores settings via electron-store)
- Cancel button (closes without saving)
- Escape key closes modal

**File:** `electron/renderer/components/Settings.tsx`

### Status Bar

**Purpose:** Show Ollama status and connection state

**Displays:**
- Ollama status: "Running", "Not Installed", "Stopped"
- Connection indicator (green dot for connected)
- Error messages when applicable

**File:** `electron/renderer/components/StatusBar.tsx`

### Welcome Wizard

**Purpose:** First-time setup guide for Ollama

**Screens:**
1. **Ollama Check:** Detect installation status
2. **Install Guide:** Instructions + download button
3. **Verification:** Confirm installation successful

**Flow:**
- Shown when Ollama not detected
- User downloads/installs Ollama
- User clicks "I've Installed Ollama"
- App verifies installation
- Wizard closes, main UI appears

**File:** `electron/renderer/components/WelcomeWizard.tsx`

## Design System

### Colors

**Brand/Accent:** `#007aff` (Blue)

**Status Colors:**
- Success: `#28a745` (Green)
- Error: `#dc3545` (Red)
- Warning: `#ffc107` (Yellow)
- Info: `#17a2b8` (Cyan)

**Neutrals:**
- Background: `#ffffff` (White)
- Text Primary: `#1a1a1a` (Near Black)
- Text Secondary: `#6c757d` (Gray)
- Border: `#dee2e6` (Light Gray)

**Dark Mode:** Not currently implemented (future enhancement)

### Typography

**Font Family:** System fonts (-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, etc.)

**Sizes:**
- Headings: 18-24px
- Body: 14-16px
- Small: 12-13px
- Tiny: 11px (timestamps, badges)

**Weights:**
- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700

### Spacing

**Scale:** 4px base unit

Common values: 4px, 8px, 12px, 16px, 20px, 24px, 32px

**Padding:**
- Containers: 20px
- Cards: 16px
- Buttons: 8px 16px
- Inline elements: 4px 8px

**Gaps:**
- Card lists: 12px
- Form fields: 12px
- Icon + text: 8px

### Border Radius

- Small: 4px (buttons, badges)
- Medium: 8px (cards, inputs)
- Large: 12px (modals, drop zones)
- Circle: 50% (status indicators)

### Shadows

**Subtle:** `0 1px 3px rgba(0,0,0,0.1)` (cards)
**Medium:** `0 4px 6px rgba(0,0,0,0.1)` (modals)
**Strong:** `0 10px 20px rgba(0,0,0,0.15)` (dropdowns)

## Component States

### Interactive States

**Buttons:**
- Default: Base color
- Hover: Slightly darker
- Active: Even darker
- Disabled: 50% opacity, no pointer

**Inputs:**
- Default: Border `#dee2e6`
- Focus: Border accent color, blue outline
- Error: Border `#dc3545`, red outline
- Disabled: Gray background, no pointer

**Cards:**
- Default: White background, subtle shadow
- Hover: Slight shadow increase
- Selected: Accent border

### Loading States

**Spinners:**
- Animated rotation (Lucide `Loader` icon)
- Used for: Ollama status, note fetching, processing

**Progress Bars:**
- Linear progress (0-100%)
- Accent color fill
- Used for: File processing, uploads

**Skeleton Loaders:**
- Gray placeholder rectangles
- Subtle pulse animation
- Used for: Loading notes list, notebooks

## Responsive Behavior

**Window Size:** Minimum 800x600, optimized for 1200x800

**Scrolling:**
- Title bar and status bar fixed
- Main content area scrollable
- Unified list scrolls independently

**Overflow:**
- Long titles: Truncated with ellipsis
- Many tags: Wrapped to multiple lines
- Large lists: Virtual scrolling (future enhancement)

## Animations

**Transitions:**
- Hover effects: 150ms ease
- Modal open/close: 200ms ease-in-out
- Tab switch: 200ms ease
- Progress bars: Smooth interpolation

**Micro-interactions:**
- Button press: Scale 0.98
- Success pulse: Scale 1.05 → 1.0
- Spinner rotation: Continuous 1s linear

**Performance:** CSS transitions preferred over JavaScript animations

## Accessibility

**Keyboard Navigation:**
- Tab: Move focus between elements
- Enter/Space: Activate buttons
- Escape: Close modals
- Arrow keys: Notebook selector navigation

**Screen Readers:**
- Semantic HTML (button, input, label)
- ARIA labels for icons
- Focus indicators visible
- Error messages announced

**Contrast:**
- All text meets WCAG AA standards
- 4.5:1 minimum contrast ratio
- Focus outlines clearly visible

## Future Enhancements

- **Dark mode** - System theme detection + manual toggle
- **Virtual scrolling** - For large lists (1000+ items)
- **Drag reordering** - Rearrange files in queue
- **Multi-select** - Batch operations on files/notes
- **Keyboard shortcuts** - Power user commands
- **Custom themes** - User-configurable color schemes

## Source Files

**Styles:** `electron/renderer/styles.css` (global styles)

**Components:**
- `electron/renderer/App.tsx` - Main app structure
- `electron/renderer/components/DropZone.tsx`
- `electron/renderer/components/UnifiedList.tsx`
- `electron/renderer/components/UnifiedItemCard.tsx`
- `electron/renderer/components/SearchableNotebookSelector.tsx`
- `electron/renderer/components/Settings.tsx`
- `electron/renderer/components/StatusBar.tsx`
- `electron/renderer/components/WelcomeWizard.tsx`

**Hooks:** `electron/renderer/hooks/` (custom React hooks)
