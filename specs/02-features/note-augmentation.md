# Note Augmentation

> **Type:** Feature
> **Last Updated:** October 2025
> **Status:** Implemented

## What It Is

The Note Augmentation feature allows you to browse existing notes in your Evernote notebooks and enhance them with AI-generated analysis. The app downloads the note content, analyzes it with local AI (Ollama), and appends the analysis back to the note.

## Key Features

- Browse notes across all Evernote notebooks
- Filter by notebook using searchable dropdown selector
- Manual refresh button to update notes list
- Intelligent caching with React Query for fast browsing
- One-click augmentation with real-time progress tracking
- Tag cache service - tags fetched once at startup
- AI-suggested tags filtered against existing Evernote tags only
- Note titles and tags updated during augmentation
- Augmentation status badges show which notes have been augmented
- Rate limit handling with automatic retries
- Works with note content and attachments (PDFs, images with OCR)

## How It Works

When you augment a note:

1. **Download** - App downloads note content and attachments from Evernote
2. **Extract** - Text extracted from attachments (OCR for images, parsing for PDFs)
3. **Analyze** - Combined content analyzed with Ollama AI
4. **Filter Tags** - AI-suggested tags matched against existing Evernote tags (case-insensitive)
5. **Update** - Note title and valid tags updated from AI analysis
6. **Augment** - AI analysis appended to original note content
7. **Upload** - Updated note saved to Evernote with augmentation metadata
8. **Confirm** - Success message displayed with note URL

## Tag Cache & Filtering

**Tag Cache Service** (`electron/evernote/tag-cache.ts`)
- Fetches all Evernote tags once at app startup
- Stored in memory for fast lookups
- Automatically initialized after authentication
- Can be manually refreshed if needed

**AI Tag Filtering** (`electron/ai/content-analysis-workflow.ts`)
- AI suggests tags based on content
- Suggested tags filtered against cached Evernote tags (case-insensitive)
- Only matching tags applied to notes
- Prevents creation of unwanted/invalid tags
- Works for both fresh analysis and cached results

## User Flow

1. User switches to "Augment Notes" tab
2. Selects notebook from dropdown (default: first notebook)
3. Browses notes list with previews (title, date, content snippet, tags)
4. Clicks "Augment with AI" button on a note
5. Progress indicator shows stages: Fetching → Extracting → Analyzing → Building → Uploading
6. On success: Green checkmark, "View Note" link appears
7. Note marked as "Augmented" with timestamp
8. User can click "View Note" to open in Evernote

## Architecture

### Key Components

**NoteAugmenter** (`electron/renderer/components/NoteAugmenter.tsx`)
- Main container component
- Uses custom hooks for state management
- Renders notebook selector and notes list

**SearchableNotebookSelector** (`electron/renderer/components/SearchableNotebookSelector.tsx`)
- Dropdown with search/filter capability
- Keyboard navigation (arrow keys, enter, escape)
- Auto-focus on open

**UnifiedItemCard** (`electron/renderer/components/UnifiedItemCard.tsx`)
- Displays both files and notes in consistent format
- Shows augmentation status badge
- Handles augmentation button click

### Custom Hooks

**useNotebooks** (`electron/renderer/hooks/useNotebooks.ts`)
- Manages notebook selection
- Fetches notes for selected notebook via React Query
- Handles rate limit warnings
- Auto-selects default notebook on mount

**useNoteAugmentation** (`electron/renderer/hooks/useNoteAugmentation.ts`)
- Tracks augmentation progress for multiple notes
- Subscribes to `augment-progress` IPC events
- Triggers note list refresh on completion

### Backend Services

**Note Augmenter** (`electron/evernote/note-augmenter.ts`)
- Main orchestration logic for augmentation workflow
- Downloads note, analyzes with AI, updates in Evernote
- Uses shared `ContentAnalysisWorkflow` for AI analysis

**Content Analysis Workflow** (`electron/ai/content-analysis-workflow.ts`)
- Shared AI analysis pipeline used by both file import and note augmentation
- Handles caching, tag filtering, and error handling
- Ensures consistent analysis behavior across features

**Tag Cache** (`electron/evernote/tag-cache.ts`)
- Singleton service for tag management
- Initialized once, used throughout session
- Provides `getTags()` for tag filtering operations

## UI/UX Considerations

**Loading States:**
- Skeleton loaders while fetching notebooks/notes
- Progress bars during augmentation (0-100%)
- Inline status messages for each stage

**Error Handling:**
- Red error messages with retry button
- Rate limit errors show wait time
- Network errors prompt to check connection
- Already-augmented notes can be re-augmented

**Visual Feedback:**
- Green "Augmented" badge on completed notes
- Timestamp shows when augmentation occurred
- "View Note" link opens note in Evernote
- Disabled state while augmentation in progress

## Performance & Optimization

### React Query Caching
- Notebooks cached for 5 minutes
- Notes cached per notebook (5 minutes)
- Stale-while-revalidate strategy
- Background refetch on focus/reconnect

### Tag Cache
- Tags fetched once at startup
- No repeated API calls during augmentation
- **100× reduction** in tag API calls vs per-note fetching

### Note Content Caching
- AI analysis cached in SQLite database by content hash
- Cache valid for 24 hours (configurable)
- Skips re-analysis for unchanged notes
- **Significant time savings** for re-augmentation

### Lazy Loading
- Notes list virtualized for large notebooks
- Only visible notes rendered
- Smooth scrolling for 1000+ notes

## File Structure

```
electron/
├── evernote/
│   ├── note-augmenter.ts        # Main augmentation logic
│   ├── tag-cache.ts             # Tag caching service
│   └── client.ts                # Evernote API client
├── ai/
│   └── content-analysis-workflow.ts  # Shared AI pipeline
├── renderer/
│   ├── components/
│   │   ├── NoteAugmenter.tsx
│   │   ├── SearchableNotebookSelector.tsx
│   │   └── UnifiedItemCard.tsx
│   └── hooks/
│       ├── useNotebooks.ts
│       └── useNoteAugmentation.ts
└── database/
    └── queue-db.ts              # Note cache storage
```

## Testing

See [Testing Strategy](../03-development/testing-strategy.md) for detailed test coverage.

**Unit Tests:**
- Note augmenter workflow (15 tests)
- Tag cache service (10 tests)
- Content analysis workflow (15 tests)
- React hooks (useNotebooks, useNoteAugmentation)

**Integration Tests:**
- Full augmentation flow (download → analyze → upload)
- Tag filtering with cache
- Error handling and retries
- Rate limit scenarios

**Key Test Coverage:**
- AI analysis result caching
- Tag filtering (cached and fresh)
- Note content extraction (with attachments)
- ENML generation and updates
- Progress event emission

## Rate Limit Handling

**Evernote API Limits:**
- Error code 19 indicates rate limit
- Includes `rateLimitDuration` (seconds to wait)

**Handling Strategy:**
- Display error message with wait time
- Store retry time in note metadata
- Automatic retry after duration expires
- User can manually retry before wait time

**Implementation:** See `electron/evernote/note-augmenter.ts` and rate limit helpers in `electron/utils/rate-limit-helpers.ts`

## Future Enhancements

- **Batch augmentation** - Augment multiple notes at once
- **Smart suggestions** - Recommend notes that would benefit from augmentation
- **Tag management** - Bulk edit tags across augmented notes
- **Selective updates** - Choose which fields to update (title only, tags only, etc.)
- **Templates** - Customizable augmentation templates
- **Export** - Export augmented notes with analysis

## Technical Notes

**Note GUID Tracking:** Augmented notes tracked in SQLite database with guid, title, tags, and augmentation timestamp.

**Cache Invalidation:** Note cache cleared when note is augmented to force fresh data on next fetch.

**Concurrent Augmentation:** Multiple notes can be augmented simultaneously (tracked via Map<noteGuid, progress>).

**Source Implementation:** For implementation details, see source files listed in File Structure section above.
