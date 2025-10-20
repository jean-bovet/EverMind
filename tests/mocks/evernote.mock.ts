import { vi } from 'vitest';

// Mock note store with tracking
export const mockCreateNote = vi.fn();
export const mockListTags = vi.fn();
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

// Export mock module
export const mockEvernote = {
  Client: MockEvernoteClient,
  Types: {
    Note: MockNote,
    Resource: MockResource,
    Data: MockData,
    ResourceAttributes: MockResourceAttributes,
  },
};

// Helper to reset all mocks
export function resetEvernoteMocks() {
  mockCreateNote.mockClear();
  mockListTags.mockClear();
  mockGetRequestToken.mockClear();
  mockGetAccessToken.mockClear();
  mockGetAuthorizeUrl.mockClear();
  mockGetNoteStore.mockClear();
  MockEvernoteClient.mockClear();
  MockNote.mockClear();
  MockResource.mockClear();
  MockData.mockClear();
  MockResourceAttributes.mockClear();
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

// Helper to setup authentication error
export function mockAuthError() {
  mockCreateNote.mockRejectedValueOnce(new Error('Not authenticated'));
}
