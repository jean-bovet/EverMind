# Evernote API Ghost Notes Investigation

## Problem Statement
The Evernote API returns **6 notes** for the Documents notebook when only **4 notes** are actually visible in the Evernote UI.

---

## Console Log Data

**Notebook GUID:** `66232af5-49df-4c11-b611-310a1db4c66d`
**Total notes returned by API:** 6

### 4 CORRECT Notes (visible in Evernote UI)
1. "Cancer Screening Follow-up..." - Created Oct 22, 2025 | Updated Oct 24, 2025
2. "Bordereau d'Impôt Cantonal..." - Created Oct 22, 2025 | Updated Oct 24, 2025
3. "Nouvelle Debit Mastercard..." - Created Oct 22, 2025 | Updated Oct 24, 2025
4. "Invoice for iPhone Battery..." - Created Oct 23, 2025 | Updated Oct 24, 2025

### 2 EXTRA Notes (NOT visible in Evernote UI)
5. "Scannable Document"
   - Created: Sept 28, 2024 | Updated: Sept 28, 2024 (never updated since creation)
   - Source: `mobile.ios` / `scannable.ios`
   - `noteTitleQuality: 0`

6. "09282024_؛İst ofServİces Avatlable 247"
   - Created: Sept 28, 2024 | Updated: Sept 28, 2024 (never updated since creation)
   - Garbled characters in title
   - `noteTitleQuality: null`

---

## Current Code Behavior

**API Call Location:** `electron/evernote/client.ts` (lines 293-333)

```typescript
const filter = new Evernote.NoteStore.NoteFilter({
  notebookGuid: notebookGuid,
  inactive: false,  // Intended to exclude trashed notes
  order: Evernote.Types.NoteSortOrder.UPDATED,
  ascending: false
});
```

**Observation:** All 6 notes returned have `Active: undefined` in the console logs, indicating this field is not being populated by the API.

---

## Evernote API Documentation Findings

**Source:** https://dev.evernote.com/doc/reference/NoteStore.html

### `inactive` Parameter Documentation
> "If true, then only notes that are not active (i.e. notes in the Trash) will be returned. Otherwise, only active notes will be returned. There is no way to find both active and inactive notes in a single query."

> "Notes in the trash are omitted by default from searches."

**Expected behavior:** Setting `inactive: false` should return only active (non-trashed) notes.

**Actual behavior:** The filter does not exclude the 2 old notes from September 2024.

---

## Web Research Findings

### Ghost Notes Phenomenon
Multiple user forum discussions found:
- Users report "ghost notes" that appear in API results but behave oddly in UI
- Notes that show as "Loading..." or "Note unavailable" in clients
- Often cannot be deleted, moved, or properly viewed
- Reported as sync issues or database inconsistencies

### Orphaned Resources (from Evernote Developer Docs)
> "If you add a resource to Note.resources without including a corresponding `<en-media>` tag in the Note.content ENML, then there is no way for users to view such resources from Evernote client apps... there is no guarantee that client apps will not remove orphaned resources."

**Note:** This refers to resources (attachments), not notes themselves, but indicates Evernote has known issues with orphaned data.

---

## Analysis

The 2 extra notes share these characteristics:
- Both created on same day (Sept 28, 2024)
- Neither has been updated since creation (4 months ago)
- One originates from `scannable.ios` app
- Both are NOT visible in Evernote UI
- Both ARE returned by `findNotesMetadata` API call
- The `inactive: false` filter does not exclude them

**Hypothesis:** These are "ghost notes" or orphaned notes that:
- Exist in Evernote's backend database with `notebookGuid` association
- Are filtered out by Evernote's client applications (web/desktop/mobile)
- Are NOT technically "in trash" (so `inactive: false` doesn't filter them)
- Represent incomplete sync or partially deleted notes from the Scannable app

---

## Conclusion

The Evernote API's `inactive` parameter does not filter out these orphaned/ghost notes as expected. The official documentation states that inactive notes (trash) should be excluded when `inactive: false`, but these 2 notes do not appear to be classified as inactive by Evernote's backend, despite being invisible in the UI.

This appears to be a limitation or bug in Evernote's API where certain orphaned notes remain associated with notebooks in the database but are not properly exposed to client applications.

---

## Status

**Date:** January 2025
**Status:** Documented, no fix implemented
**Impact:** Users may see extra notes in the app that aren't visible in Evernote UI

## Related Files
- `electron/evernote/client.ts` (lines 297, 314-331) - Filter and debug logging
