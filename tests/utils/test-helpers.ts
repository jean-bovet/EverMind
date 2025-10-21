import { promises as fs } from 'fs';

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 5000,
  interval = 10
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Wait for a queue to be empty
 */
export async function waitForQueueEmpty(
  getQueueLength: () => number,
  timeout = 5000
): Promise<void> {
  await waitFor(() => getQueueLength() === 0, timeout);
}

/**
 * Create a test file
 */
export async function createTestFile(
  filePath: string,
  content = 'test content'
): Promise<void> {
  await fs.writeFile(filePath, content, 'utf8');
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a deferred promise that can be resolved externally
 */
export function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Wait for multiple async operations to be called
 */
export async function waitForCalls(
  fn: any,
  expectedCalls: number,
  timeout = 5000
): Promise<void> {
  const start = Date.now();
  while (fn.mock.calls.length < expectedCalls) {
    if (Date.now() - start > timeout) {
      throw new Error(
        `Timeout waiting for ${expectedCalls} calls (got ${fn.mock.calls.length})`
      );
    }
    await sleep(10);
  }
}
