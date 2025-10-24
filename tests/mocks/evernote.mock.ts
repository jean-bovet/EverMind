import { vi } from 'vitest';

// Mock note store with tracking
export const mockCreateNote = vi.fn();
export const mockListTags = vi.fn();
export const mockListNotebooks = vi.fn();
export const mockFindNotesMetadata = vi.fn();
export const mockGetNote = vi.fn();
export const mockUpdateNote = vi.fn();
export const mockGetRequestToken = vi.fn();
export const mockGetAccessToken = vi.fn();
export const mockGetAuthorizeUrl = vi.fn();

// Default implementations
mockCreateNote.mockResolvedValue({
  guid: 'mock-note-guid-123',
  title: 'Mock Note',
});

mockListTags.mockResolvedValue([
  { name: 'tag1', guid: 'tag-guid-1' },
  { name: 'tag2', guid: 'tag-guid-2' },
  { name: 'tag3', guid: 'tag-guid-3' },
]);

mockListNotebooks.mockResolvedValue([
  { guid: 'nb-1', name: 'Documents', defaultNotebook: true },
  { guid: 'nb-2', name: 'Work', defaultNotebook: false },
]);

mockFindNotesMetadata.mockResolvedValue({
  notes: [
    { guid: 'note-1', title: 'Test Note 1', created: 1697990400000, updated: 1697990400000 },
    { guid: 'note-2', title: 'Test Note 2', created: 1697990500000, updated: 1697990500000 },
  ],
  totalNotes: 2
});

mockGetNote.mockResolvedValue({
  guid: 'note-1',
  title: 'Test Note',
  content: '<en-note><div>Test content</div></en-note>',
  resources: [],
  attributes: { applicationData: {} },
  updateSequenceNum: 100
});

mockUpdateNote.mockResolvedValue({
  guid: 'note-1',
  title: 'Test Note',
  updateSequenceNum: 101
});

mockGetRequestToken.mockImplementation((callbackUrl, callback) => {
  callback(null, 'mock-oauth-token', 'mock-oauth-secret', {});
});

mockGetAccessToken.mockImplementation((token, secret, verifier, callback) => {
  callback(null, 'mock-access-token', 'mock-access-secret', {});
});

mockGetAuthorizeUrl.mockReturnValue('https://mock-evernote.com/OAuth.action?oauth_token=mock');

// Mock note store
const mockNoteStore = {
  createNote: mockCreateNote,
  listTags: mockListTags,
  listNotebooks: mockListNotebooks,
  findNotesMetadata: mockFindNotesMetadata,
  getNote: mockGetNote,
  updateNote: mockUpdateNote,
};

// Mock client
export const mockGetNoteStore = vi.fn().mockReturnValue(mockNoteStore);

export const MockEvernoteClient = vi.fn().mockImplementation(() => ({
  getNoteStore: mockGetNoteStore,
  getRequestToken: mockGetRequestToken,
  getAccessToken: mockGetAccessToken,
  getAuthorizeUrl: mockGetAuthorizeUrl,
}));

// Mock Evernote types
export const MockNote = vi.fn().mockImplementation((options) => options);
export const MockResource = vi.fn().mockImplementation((options) => options);
export const MockData = vi.fn().mockImplementation((options) => options);
export const MockResourceAttributes = vi.fn().mockImplementation((options) => options);
export const MockNoteAttributes = vi.fn().mockImplementation((options) => options);
export const MockNoteFilter = vi.fn().mockImplementation((options) => options);
export const MockNotesMetadataResultSpec = vi.fn().mockImplementation((options) => options);

// Export mock module
export const mockEvernote = {
  Client: MockEvernoteClient,
  Types: {
    Note: MockNote,
    Resource: MockResource,
    Data: MockData,
    ResourceAttributes: MockResourceAttributes,
    NoteAttributes: MockNoteAttributes,
    NoteSortOrder: {
      CREATED: 1,
      UPDATED: 2,
      RELEVANCE: 3,
      UPDATE_SEQUENCE_NUMBER: 4,
      TITLE: 5
    }
  },
  NoteStore: {
    NoteFilter: MockNoteFilter,
    NotesMetadataResultSpec: MockNotesMetadataResultSpec,
  }
};

// Helper to reset all mocks
export function resetEvernoteMocks() {
  mockCreateNote.mockClear();
  mockListTags.mockClear();
  mockListNotebooks.mockClear();
  mockFindNotesMetadata.mockClear();
  mockGetNote.mockClear();
  mockUpdateNote.mockClear();
  mockGetRequestToken.mockClear();
  mockGetAccessToken.mockClear();
  mockGetAuthorizeUrl.mockClear();
  mockGetNoteStore.mockClear();
  MockEvernoteClient.mockClear();
  MockNote.mockClear();
  MockResource.mockClear();
  MockData.mockClear();
  MockResourceAttributes.mockClear();
  MockNoteFilter.mockClear();
  MockNotesMetadataResultSpec.mockClear();
  MockNoteAttributes.mockClear();
}

// Helper to setup rate limit error
export function mockRateLimitError() {
  mockCreateNote.mockRejectedValueOnce({
    errorCode: 19,
    rateLimitDuration: 60,
    identifier: 'EDAMUserException',
    parameter: 'rate',
  });
}

// Helper to setup RTE (Real-Time Editing) conflict error
export function mockRTEConflictError() {
  mockUpdateNote.mockRejectedValueOnce({
    errorCode: 19,
    message: 'Attempt updateNote where RTE room has already been open for note: test-guid',
    rateLimitDuration: 60,
  });
}

// Helper to setup authentication error
export function mockAuthError() {
  mockCreateNote.mockRejectedValueOnce(new Error('Not authenticated'));
}
