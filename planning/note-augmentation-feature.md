# Note Augmentation Feature

**Status:** Planning
**Created:** 2025-10-22
**Goal:** Add ability to browse existing Evernote notes and augment them with AI analysis

## Overview

Add a new page to the Electron app that allows users to:
1. Browse existing notes in their Evernote notebooks
2. View note content and attachments
3. Augment notes with AI-generated analysis (title, description, tags)
4. Track which notes have been augmented

## User Flow

1. User switches to "Augment Notes" tab
2. Selects a notebook (default: Documents)
3. Browses list of notes with previews
4. Clicks "Augment with AI" on a note
5. App downloads note content & attachments
6. AI analyzes the content (reusing existing pipeline)
7. App appends AI analysis to note content
8. App updates note in Evernote with augmentation metadata
9. User sees success confirmation

## Architecture

### 1. Navigation System

**File:** `electron/renderer/App.tsx`

Add tab/view switching:
```typescript
type View = 'import' | 'augment';
const [activeView, setActiveView] = useState<View>('import');

// Render different components based on activeView
```

**UI Design:**
- Tab bar at top with two tabs: "Import Files" | "Augment Notes"
- Active tab highlighted
- Each tab renders its respective component

---

### 2. Note Augmenter Component

**File:** `electron/renderer/components/NoteAugmenter.tsx`

**State:**
```typescript
interface NoteAugmenterState {
  notebooks: Notebook[];
  selectedNotebook: string | null;
  notes: NotePreview[];
  loading: boolean;
  error: string | null;
}

interface NotePreview {
  guid: string;
  title: string;
  contentPreview: string;
  thumbnailUrl?: string;
  created: number;
  updated: number;
  tags: string[];
  isAugmented: boolean;
  augmentedDate?: string;
}
```

**Layout:**
```
┌─────────────────────────────────────────┐
│ Notebook: [Documents ▼]     [Refresh]  │
├─────────────────────────────────────────┤
│ ┌───────────────────────────────────┐   │
│ │ Note Title                        │   │
│ │ Created: 2025-10-20               │   │
│ │ Tags: receipt, healthcare         │   │
│ │                                   │   │
│ │ Content preview: Lorem ipsum...   │   │
│ │ [Image thumbnail]                 │   │
│ │                                   │   │
│ │ [Badge: AI Augmented ✓ 2025-10-21]│   │
│ │                    [Augment AI ➜] │   │
│ └───────────────────────────────────┘   │
│ ┌───────────────────────────────────┐   │
│ │ Another Note...                   │   │
```

**Features:**
- Notebook selector dropdown
- Scrollable list of note cards
- Each card shows preview, metadata, augmentation status
- Individual "Augment with AI" button per note
- Loading states during operations
- Error notifications

---

### 3. Note Card Component

**File:** `electron/renderer/components/NoteCard.tsx`

**Props:**
```typescript
interface NoteCardProps {
  note: NotePreview;
  onAugment: (noteGuid: string) => void;
  augmenting: boolean;
}
```

**Displays:**
- Title (truncated to 1 line)
- Content preview (first 200 chars, ENML → plain text)
- First image attachment as thumbnail (or file icon for PDFs/docs)
- Created/updated dates
- Tags as chips
- Augmentation badge (if already augmented)
- "Augment with AI" button (disabled if augmenting or already augmented)

---

### 4. Evernote Client Extensions

**File:** `electron/evernote-client.ts`

Add new exported functions:

#### 4.1 List Notebooks
```typescript
export async function listNotebooks(): Promise<Notebook[]>
```
- Returns all notebooks with name, GUID, isDefault
- Uses `noteStore.listNotebooks()`

#### 4.2 List Notes in Notebook
```typescript
export async function listNotesInNotebook(
  notebookGuid: string,
  offset: number = 0,
  limit: number = 50
): Promise<NoteMetadata[]>
```
- Returns note metadata: guid, title, created, updated, tags
- Uses `noteStore.findNotesMetadata()` with filter
- Includes pagination support

#### 4.3 Get Note Content
```typescript
export async function getNoteWithContent(
  noteGuid: string
): Promise<FullNote>
```
- Returns complete note: content (ENML), resources, attributes
- Uses `noteStore.getNote()` with all flags true

#### 4.4 Update Note
```typescript
export async function updateNote(
  noteGuid: string,
  updatedContent?: string,
  updatedAttributes?: NoteAttributes
): Promise<Note>
```
- Updates note content and/or attributes
- Fetches current note first to get update sequence number
- Uses `noteStore.updateNote()`
- Handles version conflicts

#### 4.5 Check Note Attributes
```typescript
export async function getNoteApplicationData(
  noteGuid: string
): Promise<Record<string, string>>
```
- Returns note's applicationData (custom attributes)
- Used to check if note is already augmented

---

### 5. ENML Parser

**File:** `electron/enml-parser.ts`

ENML (Evernote Markup Language) is XML-based format for note content.

#### 5.1 ENML to Plain Text
```typescript
export function enmlToPlainText(enml: string): string
```
- Strip XML tags
- Extract text content
- Handle `<en-media>` tags (show "[Image]" or "[Attachment]")
- Remove CDATA sections properly
- Preserve line breaks and paragraphs

#### 5.2 ENML to HTML Preview
```typescript
export function enmlToHtml(enml: string): string
```
- Convert ENML tags to HTML equivalents
- `<en-note>` → `<div>`
- `<en-media>` → placeholder or thumbnail
- Preserve basic formatting (bold, italic, lists)
- Safe for React dangerouslySetInnerHTML

#### 5.3 Append Content to ENML
```typescript
export function appendToEnml(
  originalEnml: string,
  additionalContent: string
): string
```
- Parse original ENML
- Add horizontal rule `<hr/>`
- Add new section with AI analysis
- Maintain valid ENML structure
- Return updated ENML

Example:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
<en-note>
  <!-- Original content -->
  <div>Original note content here...</div>
  <en-media type="application/pdf" hash="..."/>

  <!-- Augmentation separator -->
  <hr/>

  <!-- AI Analysis Section -->
  <div>
    <strong>AI Analysis (2025-10-22)</strong>
  </div>
  <div>
    <strong>Summary:</strong> AI-generated title here
  </div>
  <div>
    <strong>Description:</strong> AI-generated description here
  </div>
  <div>
    <strong>Suggested Tags:</strong> tag1, tag2, tag3
  </div>
</en-note>
```

---

### 6. Note Augmentation Flow

**File:** `electron/note-augmenter.ts` (new)

#### Main Orchestration Function
```typescript
export async function augmentNote(
  noteGuid: string,
  mainWindow: BrowserWindow | null
): Promise<AugmentationResult>
```

**Steps:**

1. **Fetch Note** (10%)
   - Call `getNoteWithContent(noteGuid)`
   - Send progress: `{ status: 'fetching', progress: 10 }`

2. **Extract Text** (20%)
   - Convert ENML to plain text
   - If has attachments with images/PDFs: run OCR/text extraction
   - Combine all text for AI analysis
   - Send progress: `{ status: 'extracting', progress: 20 }`

3. **AI Analysis** (30-70%)
   - Reuse `analyzeContent()` from `ai-analyzer.ts`
   - Pass extracted text, filename, existing tags
   - Send progress updates from Ollama
   - Progress: 30% → 70%

4. **Build Augmented Content** (80%)
   - Use `appendToEnml()` to add AI analysis
   - Format analysis nicely (title, description, tags)
   - Add timestamp
   - Send progress: `{ status: 'building', progress: 80 }`

5. **Update Note** (90%)
   - Create updated attributes with augmentation metadata:
     ```typescript
     {
       applicationData: {
         aiAugmented: "true",
         aiAugmentedDate: new Date().toISOString()
       }
     }
     ```
   - Call `updateNote()` with new content & attributes
   - Send progress: `{ status: 'uploading', progress: 90 }`

6. **Complete** (100%)
   - Send success: `{ status: 'complete', progress: 100, noteUrl }`

**Error Handling:**
- Wrap in try-catch
- Handle rate limits (same as upload queue)
- Send error status to UI
- Return error details

---

### 7. IPC Communication

**Files:** `electron/main.ts`, `electron/preload.ts`

#### New IPC Handlers (`main.ts`)

```typescript
// List all notebooks
ipcMain.handle('list-notebooks', async () => {
  return await listNotebooks();
});

// List notes in specific notebook
ipcMain.handle('list-notes-in-notebook', async (_event, notebookGuid, offset, limit) => {
  return await listNotesInNotebook(notebookGuid, offset, limit);
});

// Get full note content
ipcMain.handle('get-note-content', async (_event, noteGuid) => {
  return await getNoteWithContent(noteGuid);
});

// Augment a note with AI
ipcMain.handle('augment-note', async (_event, noteGuid) => {
  return await augmentNote(noteGuid, mainWindow);
});
```

#### Preload API Exposure (`preload.ts`)

```typescript
const electronAPI = {
  // ... existing APIs ...

  // Note augmentation
  listNotebooks: () => ipcRenderer.invoke('list-notebooks'),
  listNotesInNotebook: (notebookGuid: string, offset?: number, limit?: number) =>
    ipcRenderer.invoke('list-notes-in-notebook', notebookGuid, offset, limit),
  getNoteContent: (noteGuid: string) =>
    ipcRenderer.invoke('get-note-content', noteGuid),
  augmentNote: (noteGuid: string) =>
    ipcRenderer.invoke('augment-note', noteGuid),

  // Progress listener for augmentation
  onAugmentProgress: (callback: (data: AugmentProgressData) => void) => {
    const subscription = (_event: unknown, data: AugmentProgressData) => callback(data);
    ipcRenderer.on('augment-progress', subscription);
    return () => ipcRenderer.removeListener('augment-progress', subscription);
  }
};
```

#### Progress Event Type
```typescript
export interface AugmentProgressData {
  noteGuid: string;
  status: 'fetching' | 'extracting' | 'analyzing' | 'building' | 'uploading' | 'complete' | 'error';
  progress: number;  // 0-100
  message?: string;
  error?: string;
  noteUrl?: string;
}
```

---

### 8. Augmentation Tracking

**Method:** Use Evernote note attributes (applicationData)

**Why note attributes?**
- ✅ Not visible to user in normal UI (cleaner)
- ✅ Queryable via API
- ✅ Doesn't clutter tags or content
- ✅ Proper data structure (key-value)

**Attributes Stored:**
```typescript
{
  applicationData: {
    aiAugmented: "true",
    aiAugmentedDate: "2025-10-22T15:30:00.000Z"
  }
}
```

**Checking if Augmented:**
```typescript
const attributes = await getNoteApplicationData(noteGuid);
const isAugmented = attributes.aiAugmented === "true";
const augmentedDate = attributes.aiAugmentedDate;
```

---

## UI/UX Considerations

### Loading States
- Show spinner when loading notebooks
- Show skeleton cards while loading notes
- Disable augment button during processing
- Show progress bar/percentage during augmentation

### Error Handling
- Network errors: "Unable to connect to Evernote"
- Rate limit errors: "Rate limit exceeded, try again in X seconds"
- AI errors: "AI analysis failed, please try again"
- Toast notifications for errors

### Success Feedback
- Show checkmark animation on success
- Update card to show augmented badge
- Optional: Link to view note in Evernote

### Empty States
- No notebooks: "No notebooks found"
- No notes in notebook: "This notebook is empty"
- No attachments: Show text icon instead

---

## File Structure

```
electron/
├── renderer/
│   ├── App.tsx                          [MODIFY] Add navigation
│   └── components/
│       ├── NoteAugmenter.tsx           [NEW] Main augmentation view
│       └── NoteCard.tsx                [NEW] Individual note card
├── evernote-client.ts                   [MODIFY] Add note reading/updating
├── enml-parser.ts                       [NEW] ENML conversion utilities
├── note-augmenter.ts                    [NEW] Augmentation orchestration
├── main.ts                              [MODIFY] Add IPC handlers
└── preload.ts                           [MODIFY] Expose new APIs

tests/
└── unit/
    ├── enml-parser.test.ts             [NEW] ENML parsing tests
    ├── evernote-client.test.ts         [MODIFY] Add note update tests
    ├── note-augmenter.test.ts          [NEW] Augmentation logic tests
    └── note-card.test.ts               [NEW] Component tests
```

---

## Testing Strategy

### Testing Philosophy

**Minimize Mocks:**
- Only mock external dependencies (Evernote API, Ollama API, file system)
- Test pure functions without mocks (parsers, formatters, utilities)
- Use real implementations for business logic when possible

**Test Isolation:**
- Unit tests should be fast and independent
- Integration tests can use real Evernote API (sandbox account)

---

### Unit Tests

#### 1. ENML Parser Tests
**File:** `tests/unit/enml-parser.test.ts`
**Mocks:** NONE (pure functions)

```typescript
describe('enml-parser', () => {
  describe('enmlToPlainText', () => {
    it('should extract text from basic ENML', () => {
      const enml = `<?xml version="1.0"?>
        <!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd">
        <en-note>Hello World</en-note>`;

      expect(enmlToPlainText(enml)).toBe('Hello World');
    });

    it('should remove XML tags', () => {
      const enml = `<en-note><div>Text with <strong>bold</strong></div></en-note>`;
      expect(enmlToPlainText(enml)).toBe('Text with bold');
    });

    it('should handle en-media tags', () => {
      const enml = `<en-note>Before<en-media type="image/png" hash="abc"/>After</en-note>`;
      expect(enmlToPlainText(enml)).toContain('[Image]');
      expect(enmlToPlainText(enml)).toContain('Before');
      expect(enmlToPlainText(enml)).toContain('After');
    });

    it('should preserve line breaks', () => {
      const enml = `<en-note><div>Line 1</div><div>Line 2</div></en-note>`;
      const text = enmlToPlainText(enml);
      expect(text).toContain('Line 1');
      expect(text).toContain('Line 2');
    });

    it('should handle empty ENML', () => {
      const enml = `<en-note></en-note>`;
      expect(enmlToPlainText(enml)).toBe('');
    });

    it('should unescape XML entities', () => {
      const enml = `<en-note>&lt;div&gt; &amp; &quot;test&quot;</en-note>`;
      expect(enmlToPlainText(enml)).toContain('<div>');
      expect(enmlToPlainText(enml)).toContain('&');
      expect(enmlToPlainText(enml)).toContain('"test"');
    });
  });

  describe('enmlToHtml', () => {
    it('should convert ENML to safe HTML', () => {
      const enml = `<en-note><div><strong>Bold</strong> text</div></en-note>`;
      const html = enmlToHtml(enml);
      expect(html).toContain('<strong>Bold</strong>');
      expect(html).toContain('text');
    });

    it('should handle media tags as placeholders', () => {
      const enml = `<en-note><en-media type="application/pdf" hash="xyz"/></en-note>`;
      const html = enmlToHtml(enml);
      expect(html).toMatch(/\[PDF Attachment\]|\[Attachment\]/);
    });

    it('should preserve lists', () => {
      const enml = `<en-note><ul><li>Item 1</li><li>Item 2</li></ul></en-note>`;
      const html = enmlToHtml(enml);
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>Item 1</li>');
    });
  });

  describe('appendToEnml', () => {
    it('should append content to existing ENML', () => {
      const original = `<?xml version="1.0"?>
        <en-note><div>Original content</div></en-note>`;

      const additional = `<div><strong>AI Analysis</strong></div>`;

      const result = appendToEnml(original, additional);

      expect(result).toContain('Original content');
      expect(result).toContain('AI Analysis');
      expect(result).toContain('<hr/>');
    });

    it('should maintain valid ENML structure', () => {
      const original = `<en-note><div>Test</div></en-note>`;
      const additional = `<div>More</div>`;
      const result = appendToEnml(original, additional);

      // Should still have en-note wrapper
      expect(result).toMatch(/<en-note>.*<\/en-note>/s);

      // Should have proper doctype
      expect(result).toContain('<!DOCTYPE en-note');
    });

    it('should handle ENML with media', () => {
      const original = `<en-note><en-media type="image/png" hash="abc"/></en-note>`;
      const additional = `<div>AI says: This is an image</div>`;
      const result = appendToEnml(original, additional);

      expect(result).toContain('en-media');
      expect(result).toContain('AI says');
    });
  });
});
```

---

#### 2. Evernote Client Extension Tests
**File:** `tests/unit/evernote-client.test.ts` (extend existing)
**Mocks:** Evernote API (via existing mock)

```typescript
describe('evernote-client - Note Augmentation', () => {

  describe('listNotebooks', () => {
    it('should return list of notebooks', async () => {
      // Mock noteStore.listNotebooks()
      mockListNotebooks.mockResolvedValueOnce([
        { guid: 'nb1', name: 'Documents', defaultNotebook: true },
        { guid: 'nb2', name: 'Work', defaultNotebook: false }
      ]);

      const notebooks = await listNotebooks();

      expect(notebooks).toHaveLength(2);
      expect(notebooks[0].name).toBe('Documents');
      expect(notebooks[0].defaultNotebook).toBe(true);
    });

    it('should handle authentication error', async () => {
      vi.mocked(getToken).mockResolvedValueOnce(null);

      await expect(listNotebooks()).rejects.toThrow(/Not authenticated/);
    });
  });

  describe('listNotesInNotebook', () => {
    it('should return notes from notebook', async () => {
      mockFindNotesMetadata.mockResolvedValueOnce({
        notes: [
          { guid: 'n1', title: 'Note 1', created: 1234567890 },
          { guid: 'n2', title: 'Note 2', created: 1234567891 }
        ],
        totalNotes: 2
      });

      const notes = await listNotesInNotebook('nb1');

      expect(notes).toHaveLength(2);
      expect(notes[0].title).toBe('Note 1');
    });

    it('should handle pagination', async () => {
      const notes = await listNotesInNotebook('nb1', 50, 25);

      expect(mockFindNotesMetadata).toHaveBeenCalledWith(
        expect.any(Object), // filter
        50, // offset
        25  // limit
      );
    });
  });

  describe('getNoteWithContent', () => {
    it('should return full note with content', async () => {
      mockGetNote.mockResolvedValueOnce({
        guid: 'n1',
        title: 'Test Note',
        content: '<en-note>Content</en-note>',
        resources: [],
        attributes: {}
      });

      const note = await getNoteWithContent('n1');

      expect(note.content).toContain('Content');
      expect(mockGetNote).toHaveBeenCalledWith('n1', true, true, true, true);
    });

    it('should include resources', async () => {
      mockGetNote.mockResolvedValueOnce({
        guid: 'n1',
        title: 'Note with Image',
        resources: [
          { mime: 'image/png', data: { body: Buffer.from('...') } }
        ]
      });

      const note = await getNoteWithContent('n1');

      expect(note.resources).toHaveLength(1);
      expect(note.resources[0].mime).toBe('image/png');
    });
  });

  describe('updateNote', () => {
    it('should update note content', async () => {
      // Mock getting current note (for update sequence)
      mockGetNote.mockResolvedValueOnce({
        guid: 'n1',
        title: 'Original',
        content: '<en-note>Old</en-note>',
        updateSequenceNum: 123
      });

      // Mock update
      mockUpdateNote.mockResolvedValueOnce({
        guid: 'n1',
        title: 'Original',
        content: '<en-note>Updated</en-note>',
        updateSequenceNum: 124
      });

      const updated = await updateNote('n1', '<en-note>Updated</en-note>');

      expect(updated.content).toContain('Updated');
      expect(mockUpdateNote).toHaveBeenCalled();
    });

    it('should update note attributes', async () => {
      mockGetNote.mockResolvedValueOnce({ guid: 'n1', updateSequenceNum: 100 });
      mockUpdateNote.mockResolvedValueOnce({ guid: 'n1' });

      await updateNote('n1', undefined, {
        applicationData: { aiAugmented: 'true' }
      });

      const updateCall = mockUpdateNote.mock.calls[0][0];
      expect(updateCall.attributes.applicationData).toEqual({
        aiAugmented: 'true'
      });
    });

    it('should handle version conflicts', async () => {
      mockGetNote.mockResolvedValueOnce({ guid: 'n1', updateSequenceNum: 100 });
      mockUpdateNote.mockRejectedValueOnce(new Error('Version conflict'));

      await expect(updateNote('n1', '<en-note>New</en-note>'))
        .rejects.toThrow(/Version conflict/);
    });
  });

  describe('getNoteApplicationData', () => {
    it('should return note attributes', async () => {
      mockGetNote.mockResolvedValueOnce({
        guid: 'n1',
        attributes: {
          applicationData: {
            aiAugmented: 'true',
            aiAugmentedDate: '2025-10-22'
          }
        }
      });

      const data = await getNoteApplicationData('n1');

      expect(data.aiAugmented).toBe('true');
      expect(data.aiAugmentedDate).toBe('2025-10-22');
    });

    it('should return empty object if no attributes', async () => {
      mockGetNote.mockResolvedValueOnce({
        guid: 'n1',
        attributes: {}
      });

      const data = await getNoteApplicationData('n1');

      expect(data).toEqual({});
    });
  });
});
```

---

#### 3. Note Augmentation Logic Tests
**File:** `tests/unit/note-augmenter.test.ts`
**Mocks:** Evernote API, Ollama API (for orchestration), NONE for pure functions

```typescript
describe('note-augmenter', () => {

  describe('buildAugmentedContent', () => {
    // This is a pure function - NO MOCKS
    it('should build augmented ENML from AI results', () => {
      const originalEnml = '<en-note><div>Original</div></en-note>';
      const aiResult = {
        title: 'AI Title',
        description: 'AI description here',
        tags: ['tag1', 'tag2']
      };

      const augmented = buildAugmentedContent(originalEnml, aiResult);

      expect(augmented).toContain('Original');
      expect(augmented).toContain('AI Title');
      expect(augmented).toContain('AI description');
      expect(augmented).toContain('tag1, tag2');
      expect(augmented).toContain('<hr/>');
    });

    it('should include timestamp', () => {
      const originalEnml = '<en-note>Test</en-note>';
      const aiResult = { title: 'T', description: 'D', tags: [] };

      const augmented = buildAugmentedContent(originalEnml, aiResult);

      // Should contain date in format 2025-10-22
      expect(augmented).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  describe('extractAugmentationStatus', () => {
    // Pure function - NO MOCKS
    it('should detect augmented notes', () => {
      const attributes = {
        aiAugmented: 'true',
        aiAugmentedDate: '2025-10-22T15:30:00Z'
      };

      const status = extractAugmentationStatus(attributes);

      expect(status.isAugmented).toBe(true);
      expect(status.augmentedDate).toBe('2025-10-22T15:30:00Z');
    });

    it('should detect non-augmented notes', () => {
      const status = extractAugmentationStatus({});

      expect(status.isAugmented).toBe(false);
      expect(status.augmentedDate).toBeUndefined();
    });
  });

  describe('augmentNote', () => {
    // Orchestration - MOCK Evernote and Ollama
    beforeEach(() => {
      resetAllMocks();
    });

    it('should complete full augmentation flow', async () => {
      // Mock getNoteWithContent
      mockGetNoteWithContent.mockResolvedValueOnce({
        guid: 'n1',
        title: 'Original Title',
        content: '<en-note>Original content</en-note>',
        resources: []
      });

      // Mock AI analysis
      mockAnalyzeContent.mockResolvedValueOnce({
        title: 'AI Generated Title',
        description: 'AI description',
        tags: ['ai-tag1', 'ai-tag2']
      });

      // Mock updateNote
      mockUpdateNote.mockResolvedValueOnce({
        guid: 'n1',
        title: 'Original Title'
      });

      const result = await augmentNote('n1', null);

      expect(result.success).toBe(true);
      expect(mockGetNoteWithContent).toHaveBeenCalledWith('n1');
      expect(mockAnalyzeContent).toHaveBeenCalled();
      expect(mockUpdateNote).toHaveBeenCalled();
    });

    it('should send progress events', async () => {
      mockGetNoteWithContent.mockResolvedValueOnce({
        guid: 'n1',
        content: '<en-note>Test</en-note>'
      });
      mockAnalyzeContent.mockResolvedValueOnce({
        title: 'T', description: 'D', tags: []
      });

      const progressEvents: AugmentProgressData[] = [];
      const mockSend = vi.fn((event, data) => {
        if (event === 'augment-progress') {
          progressEvents.push(data);
        }
      });

      const mockWindow = {
        webContents: { send: mockSend }
      } as any;

      await augmentNote('n1', mockWindow);

      // Should have progress events for each stage
      expect(progressEvents.length).toBeGreaterThan(3);
      expect(progressEvents[0].status).toBe('fetching');
      expect(progressEvents[progressEvents.length - 1].status).toBe('complete');
    });

    it('should handle errors gracefully', async () => {
      mockGetNoteWithContent.mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await augmentNote('n1', null);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle rate limit errors', async () => {
      mockUpdateNote.mockRejectedValueOnce({
        errorCode: 19,
        rateLimitDuration: 60
      });

      const result = await augmentNote('n1', null);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit');
    });

    it('should extract text from attachments via OCR', async () => {
      mockGetNoteWithContent.mockResolvedValueOnce({
        guid: 'n1',
        content: '<en-note>Note content</en-note>',
        resources: [
          {
            mime: 'image/png',
            data: { body: Buffer.from('fake-image-data') },
            attributes: { fileName: 'receipt.png' }
          }
        ]
      });

      mockExtractTextFromImage.mockResolvedValueOnce('OCR extracted text');
      mockAnalyzeContent.mockResolvedValueOnce({
        title: 'Receipt', description: 'D', tags: []
      });

      await augmentNote('n1', null);

      // Should have called OCR
      expect(mockExtractTextFromImage).toHaveBeenCalled();

      // Should have passed combined text to AI
      const aiCall = mockAnalyzeContent.mock.calls[0];
      expect(aiCall[0]).toContain('Note content');
      expect(aiCall[0]).toContain('OCR extracted text');
    });
  });
});
```

---

#### 4. UI Component Tests
**File:** `tests/unit/note-card.test.ts`
**Mocks:** NONE (React component testing with @testing-library/react)

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import NoteCard from '../../electron/renderer/components/NoteCard';

describe('NoteCard', () => {
  const mockNote: NotePreview = {
    guid: 'n1',
    title: 'Test Note',
    contentPreview: 'This is a preview of the note content...',
    created: 1697990400000, // Oct 22, 2023
    updated: 1697990400000,
    tags: ['tag1', 'tag2'],
    isAugmented: false
  };

  it('should render note title', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={false} />);

    expect(screen.getByText('Test Note')).toBeInTheDocument();
  });

  it('should render content preview', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={false} />);

    expect(screen.getByText(/This is a preview/)).toBeInTheDocument();
  });

  it('should render tags', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={false} />);

    expect(screen.getByText('tag1')).toBeInTheDocument();
    expect(screen.getByText('tag2')).toBeInTheDocument();
  });

  it('should call onAugment when button clicked', () => {
    const onAugment = vi.fn();
    render(<NoteCard note={mockNote} onAugment={onAugment} augmenting={false} />);

    const button = screen.getByRole('button', { name: /augment/i });
    fireEvent.click(button);

    expect(onAugment).toHaveBeenCalledWith('n1');
  });

  it('should disable button when augmenting', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={true} />);

    const button = screen.getByRole('button', { name: /augment/i });
    expect(button).toBeDisabled();
  });

  it('should show augmented badge when augmented', () => {
    const augmentedNote = {
      ...mockNote,
      isAugmented: true,
      augmentedDate: '2025-10-22T15:30:00Z'
    };

    render(<NoteCard note={augmentedNote} onAugment={vi.fn()} augmenting={false} />);

    expect(screen.getByText(/AI Augmented/i)).toBeInTheDocument();
    expect(screen.getByText(/2025-10-22/)).toBeInTheDocument();
  });

  it('should disable button for already augmented notes', () => {
    const augmentedNote = {
      ...mockNote,
      isAugmented: true
    };

    render(<NoteCard note={augmentedNote} onAugment={vi.fn()} augmenting={false} />);

    const button = screen.getByRole('button', { name: /augment/i });
    expect(button).toBeDisabled();
  });

  it('should render thumbnail if provided', () => {
    const noteWithImage = {
      ...mockNote,
      thumbnailUrl: 'data:image/png;base64,...'
    };

    render(<NoteCard note={noteWithImage} onAugment={vi.fn()} augmenting={false} />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', noteWithImage.thumbnailUrl);
  });

  it('should truncate long content previews', () => {
    const longNote = {
      ...mockNote,
      contentPreview: 'A'.repeat(300)
    };

    const { container } = render(
      <NoteCard note={longNote} onAugment={vi.fn()} augmenting={false} />
    );

    const preview = container.querySelector('.content-preview');
    expect(preview?.textContent?.length).toBeLessThan(250);
  });

  it('should format dates correctly', () => {
    render(<NoteCard note={mockNote} onAugment={vi.fn()} augmenting={false} />);

    // Should show formatted date (not raw timestamp)
    expect(screen.queryByText('1697990400000')).not.toBeInTheDocument();
    expect(screen.getByText(/2023|Oct/)).toBeInTheDocument();
  });
});
```

---

## Testing Checklist

### Unit Tests
- [ ] ENML to plain text conversion
- [ ] ENML to HTML conversion
- [ ] ENML content appending
- [ ] List notebooks
- [ ] List notes in notebook
- [ ] Get note with content
- [ ] Update note content
- [ ] Update note attributes
- [ ] Get note application data
- [ ] Build augmented content (pure function)
- [ ] Extract augmentation status (pure function)
- [ ] Full augmentation orchestration
- [ ] Progress event emission
- [ ] Error handling (network, rate limit, AI)
- [ ] OCR integration for attachments
- [ ] NoteCard rendering
- [ ] NoteCard interactions
- [ ] NoteCard augmentation badge

### Integration Tests (Optional)
- [ ] Full augmentation flow with sandbox Evernote account
- [ ] ENML roundtrip (parse → modify → save → read)
- [ ] Multi-note batch augmentation

### Manual Testing
- [ ] Navigate between Import/Augment views
- [ ] Select different notebooks
- [ ] View note previews
- [ ] Augment a simple text note
- [ ] Augment a note with PDF attachment
- [ ] Augment a note with image attachment
- [ ] Verify augmented badge appears after augmentation
- [ ] Try augmenting already-augmented note (should be disabled)
- [ ] Handle rate limiting gracefully
- [ ] Handle network errors gracefully
- [ ] Verify augmented content in Evernote web UI

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Create ENML parser with tests
- [ ] Add Evernote client functions (list notebooks, notes, get note)
- [ ] Add IPC handlers
- [ ] Write unit tests for new functions

### Phase 2: UI Components
- [ ] Create NoteAugmenter component
- [ ] Create NoteCard component
- [ ] Add navigation to App.tsx
- [ ] Wire up IPC calls
- [ ] Add loading/error states

### Phase 3: Augmentation Logic
- [ ] Create note-augmenter.ts orchestration
- [ ] Integrate with existing AI analyzer
- [ ] Add updateNote function
- [ ] Implement progress events
- [ ] Write augmentation tests

### Phase 4: Polish & Testing
- [ ] Add augmentation badge/tracking
- [ ] Improve error messages
- [ ] Add loading animations
- [ ] Manual testing with real Evernote account
- [ ] Fix bugs
- [ ] Documentation

---

## Future Enhancements

- **Batch augmentation:** Select multiple notes and augment all at once
- **Filter by augmentation status:** Show only non-augmented notes
- **Search notes:** Add search bar to filter notes by title/content
- **Preview AI analysis before saving:** Show diff/preview before committing changes
- **Custom AI instructions per note:** Allow user to provide context for specific notes
- **Undo augmentation:** Remove AI analysis section and revert to original content
- **Export augmentation report:** CSV/JSON of all augmented notes with metadata
