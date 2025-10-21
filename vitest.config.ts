import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'electron/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts', // CLI entry point, hard to test
        'electron/main.ts', // Electron entry point, tested via E2E
        'electron/preload.ts', // Preload script, tested via E2E
        'electron/ollama-detector.ts', // External dependency, tested separately
        'electron/renderer/**/*', // React components, tested via E2E
        'tests/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    testTimeout: 30000, // 30 seconds for tests that use Ollama
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
