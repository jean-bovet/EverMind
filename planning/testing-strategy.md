# Testing Strategy for Auto-Processing Pipeline

## Philosophy

**Test behavior, not implementation**
- Focus on what the code does, not how it does it
- Mock only external boundaries (APIs, IPC)
- Use real implementations whenever possible
- Avoid testing mocks

**Keep tests fast and focused**
- Each test should run in <100ms
- Test one concern per test
- Use minimal setup/teardown

---

## Critical Components to Test

### 1. UploadWorker Class (HIGH PRIORITY)

**File:** `electron/upload-worker.ts` (new file)

The upload worker is the most critical new component - it manages the sequential upload queue with retry logic.

#### Tests to Write

```typescript
describe('UploadWorker', () => {
  describe('Queue Management', () => {
    it('should add files to queue')
    it('should not add duplicate files to queue')
    it('should remove files after successful upload')
    it('should maintain queue order (FIFO)')
    it('should handle empty queue gracefully')
  })

  describe('Processing Loop', () => {
    it('should start processing when queue has items')
    it('should stop when isRunning is false')
    it('should wait when queue is empty')
    it('should process files sequentially (one at a time)')
    it('should continue processing after errors')
  })

  describe('Rate Limit Handling', () => {
    it('should wait specified duration on rate limit')
    it('should retry after rate limit expires')
    it('should keep file in queue during rate limit')
    it('should add buffer time to rate limit duration')
  })

  describe('Retry Logic', () => {
    it('should retry failed uploads with delay')
    it('should use exponential backoff for retries')
    it('should give up after max retries')
    it('should send retry status updates via IPC')
  })

  describe('Error Handling', () => {
    it('should mark file as error on critical failure')
    it('should remove file from queue on critical error')
    it('should continue processing other files after error')
    it('should send error status via IPC')
  })
})
```

**What to Mock:**
- `BrowserWindow.webContents.send` (IPC communication)
- `uploadFile()` function (return success/failure/rate-limit)

**What NOT to Mock:**
- Queue operations (array push/shift/includes)
- Timer logic (use fake timers if needed)
- State management

**Example Test:**

```typescript
it('should wait specified duration on rate limit', async () => {
  const worker = new UploadWorker(mockWindow);
  const uploadFile = vi.fn()
    .mockResolvedValueOnce({
      success: false,
      rateLimitDuration: 5 // 5 seconds
    })
    .mockResolvedValueOnce({
      success: true,
      noteUrl: 'https://evernote.com/note'
    });

  worker.setUploadFunction(uploadFile);
  worker.addToQueue('/path/to/file.json');
  worker.start();

  // Should attempt upload
  await vi.waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));

  // Should wait 5 seconds before retry
  await vi.advanceTimersByTime(4000);
  expect(uploadFile).toHaveBeenCalledTimes(1); // Still only once

  await vi.advanceTimersByTime(1000);
  await vi.waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(2));

  worker.stop();
});
```

---

### 2. Concurrency Control (HIGH PRIORITY)

**File:** `electron/renderer/App.tsx` or new `processing-manager.ts`

Controls concurrent Stage 1 processing (max 3 files at once).

#### Tests to Write

```typescript
describe('Concurrency Control', () => {
  it('should process up to 3 files concurrently')
  it('should queue files when at max concurrency')
  it('should start next file when one completes')
  it('should handle concurrent completion correctly')
  it('should respect concurrency limit across multiple drops')
})
```

**What to Mock:**
- `analyzeFile()` function (use delays to simulate processing)

**What NOT to Mock:**
- Concurrency counting logic
- Queue management

**Example Test:**

```typescript
it('should process up to 3 files concurrently', async () => {
  const analyzeFile = vi.fn().mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return { title: 'Test', description: 'Test', tags: [] };
  });

  const manager = new ProcessingManager(analyzeFile);

  // Add 5 files
  for (let i = 0; i < 5; i++) {
    manager.addFile(`/path/file${i}.pdf`);
  }

  manager.start();

  // After a short delay, should have started exactly 3
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(analyzeFile).toHaveBeenCalledTimes(3);

  // After first batch completes, should process remaining 2
  await new Promise(resolve => setTimeout(resolve, 150));
  expect(analyzeFile).toHaveBeenCalledTimes(5);

  manager.stop();
});
```

---

### 3. File State Transitions (MEDIUM PRIORITY)

**File:** New `file-state-machine.ts` (utility)

Ensures only valid state transitions occur.

#### Tests to Write

```typescript
describe('File State Machine', () => {
  it('should allow pending → extracting')
  it('should allow extracting → analyzing')
  it('should allow analyzing → ready-to-upload')
  it('should allow ready-to-upload → uploading')
  it('should allow uploading → complete')
  it('should allow uploading → rate-limited')
  it('should allow rate-limited → uploading')
  it('should allow any state → error')
  it('should prevent invalid transitions')
  it('should track transition history for debugging')
})
```

**What to Mock:** Nothing (pure logic)

**Example Test:**

```typescript
it('should prevent invalid transitions', () => {
  const fsm = new FileStateMachine();

  fsm.setState('pending');

  // Valid transition
  expect(() => fsm.setState('extracting')).not.toThrow();

  // Invalid transitions from extracting
  expect(() => fsm.setState('uploading')).toThrow();
  expect(() => fsm.setState('complete')).toThrow();

  // Error is always valid
  expect(() => fsm.setState('error')).not.toThrow();
});
```

---

### 4. Rate Limit Duration Parsing (MEDIUM PRIORITY)

**File:** `electron/file-processor.ts` or utility

Parses rate limit duration from Evernote error responses.

#### Tests to Write

```typescript
describe('Rate Limit Parser', () => {
  it('should parse duration from error message')
  it('should handle "rateLimitDuration: 60" format')
  it('should handle errorCode 19 format')
  it('should default to 60s if duration not found')
  it('should add 2s buffer to duration')
  it('should convert seconds to milliseconds')
})
```

**What to Mock:** Nothing (pure logic)

**Example Test:**

```typescript
it('should parse duration from error message', () => {
  const error1 = new Error('Rate limit: rateLimitDuration: 120');
  expect(parseRateLimitDuration(error1)).toBe(122); // 120s + 2s buffer

  const error2 = new Error('{"errorCode":19,"rateLimitDuration":90}');
  expect(parseRateLimitDuration(error2)).toBe(92); // 90s + 2s buffer

  const error3 = new Error('Unknown error');
  expect(parseRateLimitDuration(error3)).toBe(62); // Default 60s + 2s buffer
});
```

---

### 5. Exponential Backoff Calculation (LOW PRIORITY)

**File:** Utility function

Calculates retry delays with exponential backoff.

#### Tests to Write

```typescript
describe('Exponential Backoff', () => {
  it('should calculate correct delays for retry attempts')
  it('should cap maximum delay')
  it('should use base delay for first retry')
  it('should double delay for each subsequent retry')
})
```

**What to Mock:** Nothing (pure math)

**Example Test:**

```typescript
it('should calculate correct delays for retry attempts', () => {
  const baseDelay = 1000; // 1 second

  expect(calculateBackoff(0, baseDelay)).toBe(1000);   // 1st retry: 1s
  expect(calculateBackoff(1, baseDelay)).toBe(2000);   // 2nd retry: 2s
  expect(calculateBackoff(2, baseDelay)).toBe(4000);   // 3rd retry: 4s
  expect(calculateBackoff(3, baseDelay)).toBe(8000);   // 4th retry: 8s
  expect(calculateBackoff(4, baseDelay)).toBe(16000);  // 5th retry: 16s

  // Should cap at max delay (e.g., 30s)
  expect(calculateBackoff(10, baseDelay, 30000)).toBe(30000);
});
```

---

### 6. Integration Test: End-to-End Pipeline (LOW PRIORITY)

**File:** `tests/integration/pipeline.test.ts`

Tests the complete pipeline from file drop to upload completion.

#### Tests to Write

```typescript
describe('Complete Pipeline Integration', () => {
  it('should process file from drop to upload completion')
  it('should handle rate limit and retry successfully')
  it('should process multiple files concurrently')
  it('should recover from Stage 1 errors')
})
```

**What to Mock:**
- Evernote API (using existing mocks)
- AI analysis service
- File extraction (return mock text)

**What NOT to Mock:**
- Pipeline orchestration
- Queue management
- State transitions
- IPC communication (use spies)

**Example Test:**

```typescript
it('should process file from drop to upload completion', async () => {
  // Setup mocks
  const mockExtract = vi.fn().mockResolvedValue({
    text: 'Sample content',
    fileType: 'pdf',
    fileName: 'test.pdf'
  });

  const mockAnalyze = vi.fn().mockResolvedValue({
    title: 'Test Document',
    description: 'A test document',
    tags: ['test']
  });

  const mockUpload = vi.fn().mockResolvedValue({
    success: true,
    noteUrl: 'https://evernote.com/note/123'
  });

  // Create test file
  const testFile = '/tmp/test.pdf';
  await fs.writeFile(testFile, 'content');

  // Start pipeline
  const pipeline = new ProcessingPipeline({
    extract: mockExtract,
    analyze: mockAnalyze,
    upload: mockUpload
  });

  const statusUpdates: string[] = [];
  pipeline.on('status', (status) => statusUpdates.push(status));

  await pipeline.processFile(testFile);

  // Verify status progression
  expect(statusUpdates).toEqual([
    'extracting',
    'analyzing',
    'ready-to-upload',
    'uploading',
    'complete'
  ]);

  // Verify functions called in order
  expect(mockExtract).toHaveBeenCalledWith(testFile);
  expect(mockAnalyze).toHaveBeenCalled();
  expect(mockUpload).toHaveBeenCalled();

  // Verify final state
  const finalState = pipeline.getFileState(testFile);
  expect(finalState.status).toBe('complete');
  expect(finalState.result.noteUrl).toBe('https://evernote.com/note/123');
});
```

---

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

---

## Testing Utilities

### Mock Factories

```typescript
// tests/utils/mock-factories.ts

export function createMockWindow() {
  return {
    webContents: {
      send: vi.fn()
    }
  };
}

export function createMockUploadResult(
  overrides?: Partial<UploadResult>
): UploadResult {
  return {
    success: true,
    noteUrl: 'https://evernote.com/note/123',
    ...overrides
  };
}

export function createMockFile(name: string, status: FileStatus = 'pending') {
  return {
    path: `/tmp/${name}`,
    name,
    status,
    progress: 0
  };
}
```

### Test Helpers

```typescript
// tests/utils/test-helpers.ts

export async function waitForQueueEmpty(
  worker: UploadWorker,
  timeout = 5000
) {
  const start = Date.now();
  while (worker.getQueueLength() > 0) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for queue to empty');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

export function createTestFile(path: string, content = 'test') {
  return fs.writeFile(path, content, 'utf8');
}
```

---

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

---

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

---

## Continuous Integration

### Pre-commit Checks
- All tests must pass
- No decrease in coverage %
- New code >80% covered

### Pull Request Checks
- All tests pass on CI
- Coverage report generated
- Integration tests pass

---

## Future Improvements

- [ ] Add performance benchmarks for queue processing
- [ ] Add stress tests (1000+ files)
- [ ] Add memory leak tests for long-running workers
- [ ] Add E2E tests with real Electron app
- [ ] Add visual regression tests for UI
