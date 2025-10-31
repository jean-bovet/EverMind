/**
 * Mock for runtime-config module in tests
 * This provides dummy values for Evernote API configuration
 * that would normally be generated from .env file
 */

import { vi } from 'vitest';

// Mock the runtime-config module that's generated from .env
vi.mock('../../electron/config/runtime-config.js', () => ({
  EVERNOTE_CONSUMER_KEY: 'test-consumer-key',
  EVERNOTE_CONSUMER_SECRET: 'test-consumer-secret',
  EVERNOTE_ENDPOINT: 'https://sandbox.evernote.com',
}));
