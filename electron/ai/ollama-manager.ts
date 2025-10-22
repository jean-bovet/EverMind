import { spawn, execSync, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import http from 'http';
import { success, info, warning, colors } from '../cli/output-formatter.js';

let ollamaProcess: ChildProcess | null = null;
let wasStartedByUs = false;

/**
 * Common paths where Ollama might be installed
 */
const OLLAMA_PATHS = [
  '/usr/local/bin/ollama',
  '/opt/homebrew/bin/ollama',
  '/usr/bin/ollama',
  '/home/linuxbrew/.linuxbrew/bin/ollama',
] as const;

/**
 * Check if Ollama binary is installed
 * @returns Path to Ollama binary or null if not found
 */
function findOllamaBinary(): string | null {
  // First, try to find it in PATH
  try {
    const result = execSync('which ollama', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const path = result.trim();
    if (path && existsSync(path)) {
      return path;
    }
  } catch (error) {
    // which command failed, continue to check common paths
  }

  // Check common installation paths
  for (const path of OLLAMA_PATHS) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Check if Ollama is running by making a health check request
 * @param host - Ollama host URL
 */
function isOllamaRunning(host: string = 'http://localhost:11434'): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL(host);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 11434,
      path: '/api/tags',
      method: 'GET',
      timeout: 2000,
    };

    const req = http.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Start Ollama server in the background
 * @param ollamaPath - Path to Ollama binary
 */
function startOllama(ollamaPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('  ' + info('Starting Ollama server...'));

    ollamaProcess = spawn(ollamaPath, ['serve'], {
      detached: false,
      stdio: 'ignore',
    });

    ollamaProcess.on('error', (error) => {
      reject(new Error(`Failed to start Ollama: ${error.message}`));
    });

    // Wait a bit for Ollama to start up
    setTimeout(async () => {
      if (await isOllamaRunning()) {
        wasStartedByUs = true;
        console.log('  ' + success('Ollama server started successfully'));
        resolve();
      } else {
        reject(new Error('Ollama started but is not responding'));
      }
    }, 3000);
  });
}

/**
 * Check if a specific model is available
 * @param model - Model name to check
 * @param ollamaPath - Path to Ollama binary
 */
function isModelAvailable(model: string, ollamaPath: string): boolean {
  try {
    const result = execSync(`${ollamaPath} list`, { encoding: 'utf8' });
    return result.includes(model);
  } catch (error) {
    return false;
  }
}

/**
 * Pull a model from Ollama registry
 * @param model - Model name to pull
 * @param ollamaPath - Path to Ollama binary
 */
function pullModel(model: string, ollamaPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('  ' + info(`Downloading model "${colors.highlight(model)}"... This may take a few minutes.`));

    const pullProcess = spawn(ollamaPath, ['pull', model], {
      stdio: 'inherit',
    });

    pullProcess.on('close', (code) => {
      if (code === 0) {
        console.log('  ' + success(`Model "${model}" downloaded successfully`));
        resolve();
      } else {
        reject(new Error(`Failed to download model "${model}"`));
      }
    });

    pullProcess.on('error', (error) => {
      reject(new Error(`Failed to download model: ${error.message}`));
    });
  });
}

/**
 * Ensure Ollama is ready (installed, running, and has the required model)
 * @param model - Model name to check/download
 * @param host - Ollama host URL
 */
export async function ensureOllamaReady(model: string, host: string = 'http://localhost:11434'): Promise<void> {
  // Step 1: Check if Ollama is installed
  const ollamaPath = findOllamaBinary();
  if (!ollamaPath) {
    throw new Error(
      'Ollama is not installed. Please install it from https://ollama.ai\n' +
      'Installation instructions:\n' +
      '  - macOS/Linux: Download from https://ollama.ai\n' +
      '  - Or use: curl -fsSL https://ollama.ai/install.sh | sh'
    );
  }

  console.log('  ' + success(`Ollama found at: ${colors.muted(ollamaPath)}`));

  // Step 2: Check if Ollama is running
  const running = await isOllamaRunning(host);
  if (!running) {
    await startOllama(ollamaPath);
  } else {
    console.log('  ' + success('Ollama is already running'));
  }

  // Step 3: Check if the required model is available
  if (!isModelAvailable(model, ollamaPath)) {
    console.log('  ' + info(`Model "${colors.highlight(model)}" not found locally.`));
    await pullModel(model, ollamaPath);
  } else {
    console.log('  ' + success(`Model "${colors.highlight(model)}" is available`));
  }
}

/**
 * Stop Ollama server if it was started by us
 * @param force - Force stop even if we didn't start it
 */
export function stopOllama(force: boolean = false): void {
  if (ollamaProcess && (wasStartedByUs || force)) {
    console.log(info('\nStopping Ollama server...'));
    try {
      ollamaProcess.kill('SIGTERM');
      ollamaProcess = null;
      wasStartedByUs = false;
      console.log(success('Ollama server stopped'));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(warning(`Could not stop Ollama: ${errorMessage}`));
    }
  }
}

/**
 * Check if Ollama was started by this script
 */
export function wasOllamaStartedByUs(): boolean {
  return wasStartedByUs;
}
