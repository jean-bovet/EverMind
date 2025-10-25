# Testing Strategy

> **Type:** Development Guide
> **Last Updated:** October 2025

**Test Status:** 126 new tests added ✅ | All existing tests passing ✅

**Related Documentation:**
- [Auto-Processing Pipeline](../02-features/auto-processing-pipeline.md) - Feature specification
- [SQLite Database](../02-features/sqlite-database.md) - Database implementation
- [Implementation Details](implementation-details.md) - Code architecture

## Test Coverage

### Core Test Suites

**Processing & State Management:**
- ✅ **File State Reducer** - 30 tests covering all pure reducer functions
- ✅ **UploadWorker** - 24 comprehensive tests (100% coverage)
- ✅ **File State Machine** - 34 tests covering all state transitions
- ✅ **Processing Scheduler** - 11 tests for concurrency control
- ✅ **Upload Queue** - 23 tests (updated for database backend)

**Pure Helper Modules (100% Coverage):**
- ✅ **ENML Helpers** - 42 tests for ENML generation and XML utilities
- ✅ **Progress Helpers** - 54 tests for progress calculation and formatting
- ✅ **Format Helpers** - All date/text formatting functions tested
- ✅ **File Helpers** - Path manipulation and validation
- ✅ **Rate Limit Helpers** - Error parsing and rate limit detection

**Data Layer:**
- ✅ **Queue Database** - 32 tests for SQLite operations
- ✅ **Tag Cache** - Tag storage and retrieval
- ✅ **Tag Validator** - Tag sanitization and filtering

**AI & Content:**
- ✅ **Content Analysis Workflow** - Tag filtering, caching, workflow
- ✅ **AI Response Parser** - JSON parsing with fallbacks
- ✅ **ENML Parser** - Note content extraction

**UI & Mappers:**
- ✅ **Unified Item Helpers** - List merging and sorting
- ✅ **Note Helpers** - Metadata transformation
- ✅ **DB to UI Mapper** - Database to frontend mapping

**Total Test Suite:** 300+ tests passing

### New Test Coverage (2025 Refactoring)

**1. file-state-reducer.test.ts (30 tests)**
- Tests all 5 pure reducer functions
- Verifies immutability of state updates
- Covers edge cases (empty arrays, missing files, etc.)
- 100% coverage of state transformation logic

**2. enml-helpers.test.ts (42 tests)**
- Tests all ENML generation functions
- XML escaping validation
- MIME type mapping
- MD5 hashing
- Resource creation
- 100% coverage of ENML utilities

**3. progress-helpers.test.ts (54 tests)**
- Progress percentage calculation
- Status message generation
- Error message extraction
- Rate limit duration formatting
- File type validation
- Supported extensions list
- 100% coverage of progress utilities

### Test Quality Standards

**All tests follow these principles:**
- ✅ Pure functions tested without mocks
- ✅ Clear, descriptive test names
- ✅ One assertion per test (when possible)
- ✅ Edge cases and error conditions covered
- ✅ Immutability verified where applicable
- ✅ TypeScript type safety throughout

## Philosophy

### Test behavior, not implementation
- Focus on what the code does, not how it does it
- Mock only external boundaries (APIs, IPC)
- Use real implementations whenever possible
- Avoid testing mocks

### Keep tests fast and focused
- Each test should run in <100ms
- Test one concern per test
- Use minimal setup/teardown

### Bug fixing workflow

When a bug is discovered, follow this test-driven approach:

1. **Write a failing test** - Create a unit test that reproduces the bug. The test should fail, confirming the bug exists
2. **Fix the code** - Modify the implementation to address the root cause
3. **Verify the fix** - Re-run the test. It should now pass, proving the bug is fixed

This approach ensures:
- The bug is properly understood and documented
- The fix actually solves the problem
- The bug won't reappear in the future (regression protection)
- The test suite grows stronger with each bug found

## Critical Components to Test

### 1. UploadWorker Class (HIGH PRIORITY)

**File:** `electron/upload-worker.ts`

The upload worker manages the sequential upload queue with retry logic.

**Test Coverage:**
- Queue management (add, remove, duplicates, order, empty queue)
- Processing loop (start/stop, waiting, sequential processing, error continuation)
- Rate limit handling (wait duration, retry after expiry, buffer time)
- Retry logic (delays, exponential backoff, max retries, status updates)
- Error handling (critical failures, file removal, continuing processing, IPC updates)

**Mocking Strategy:**
- Mock: `BrowserWindow.webContents.send` (IPC communication)
- Mock: `uploadFile()` function (return success/failure/rate-limit)
- Do NOT mock: Queue operations, timer logic, state management

### 2. Concurrency Control (HIGH PRIORITY)

**File:** `electron/renderer/App.tsx` or `processing-manager.ts`

Controls concurrent Stage 1 processing (max 3 files at once).

**Test Coverage:**
- Process up to 3 files concurrently
- Queue files when at max concurrency
- Start next file when one completes
- Handle concurrent completion correctly
- Respect concurrency limit across multiple drops

**Mocking Strategy:**
- Mock: `analyzeFile()` function (use delays to simulate processing)
- Do NOT mock: Concurrency counting logic, queue management

### 3. File State Transitions (MEDIUM PRIORITY)

**File:** `file-state-machine.ts`

Ensures only valid state transitions occur.

**Test Coverage:**
- Valid transitions (pending → extracting → analyzing → ready-to-upload → uploading → complete)
- Rate limit transitions (uploading → rate-limited → uploading)
- Error transitions (any state → error)
- Invalid transition prevention
- Transition history tracking for debugging

**Mocking Strategy:**
- No mocks needed (pure logic)

### 4. Rate Limit Duration Parsing (MEDIUM PRIORITY)

**File:** `electron/file-processor.ts` or utility

Parses rate limit duration from Evernote error responses.

**Test Coverage:**
- Parse duration from error message
- Handle "rateLimitDuration: 60" format
- Handle errorCode 19 format
- Default to 60s if duration not found
- Add 2s buffer to duration
- Convert seconds to milliseconds

**Mocking Strategy:**
- No mocks needed (pure logic)

### 5. Exponential Backoff Calculation (LOW PRIORITY)

**File:** Utility function

Calculates retry delays with exponential backoff.

**Test Coverage:**
- Calculate correct delays for retry attempts
- Cap maximum delay
- Use base delay for first retry
- Double delay for each subsequent retry

**Mocking Strategy:**
- No mocks needed (pure math)

### 6. Integration Test: End-to-End Pipeline (LOW PRIORITY)

**File:** `tests/integration/pipeline.test.ts`

Tests the complete pipeline from file drop to upload completion.

**Test Coverage:**
- Process file from drop to upload completion
- Handle rate limit and retry successfully
- Process multiple files concurrently
- Recover from Stage 1 errors

**Mocking Strategy:**
- Mock: Evernote API, AI analysis service, file extraction
- Do NOT mock: Pipeline orchestration, queue management, state transitions, IPC communication

## Tests NOT to Write

### React Component Rendering
- Leave to integration/E2E tests
- Too brittle and framework-dependent
- Better tested via Playwright/Cypress

### Electron IPC Mechanics
- Electron's responsibility
- We only test our IPC handlers logic

### File Extraction Logic
- Already has comprehensive tests in `file-extractor.test.ts`

### Tag Validation
- Already has tests in `tag-validator.test.ts`

### AI Analysis
- External service, can't test effectively
- Mock in integration tests

### Upload Queue Basics
- Already has tests in `upload-queue.test.ts`
- Only add tests for new retry logic

## Running Tests

```bash
# Run all unit tests
npm test

# Run specific test file
npm test upload-worker.test.ts

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run integration tests only
npm test -- tests/integration
```

## Coverage Goals

**Target: 80% coverage for new code**

**Priority areas:**
- UploadWorker: 90%+ coverage
- Concurrency control: 85%+ coverage
- State transitions: 90%+ coverage
- Rate limit handling: 85%+ coverage

**Lower priority:**
- UI components: 60%+ (integration tests cover these)
- IPC handlers: 70%+ (mostly pass-through logic)

## Continuous Integration

### Pre-commit Checks
- All tests must pass
- No decrease in coverage %
- New code >80% covered

### Pull Request Checks
- All tests pass on CI
- Coverage report generated
- Integration tests pass

## Future Improvements

- [ ] Add performance benchmarks for queue processing
- [ ] Add stress tests (1000+ files)
- [ ] Add memory leak tests for long-running workers
- [ ] Add E2E tests with real Electron app
- [ ] Add visual regression tests for UI
