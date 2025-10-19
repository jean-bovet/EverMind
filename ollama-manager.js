const { spawn, execSync } = require('child_process');
const { existsSync } = require('fs');
const http = require('http');

let ollamaProcess = null;
let wasStartedByUs = false;

/**
 * Common paths where Ollama might be installed
 */
const OLLAMA_PATHS = [
  '/usr/local/bin/ollama',
  '/opt/homebrew/bin/ollama',
  '/usr/bin/ollama',
  '/home/linuxbrew/.linuxbrew/bin/ollama'
];

/**
 * Check if Ollama binary is installed
 * @returns {string|null} Path to Ollama binary or null if not found
 */
function findOllamaBinary() {
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
 * @param {string} host - Ollama host URL
 * @returns {Promise<boolean>}
 */
function isOllamaRunning(host = 'http://localhost:11434') {
  return new Promise((resolve) => {
    const url = new URL(host);
    const options = {
      hostname: url.hostname,
      port: url.port || 11434,
      path: '/api/tags',
      method: 'GET',
      timeout: 2000
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
 * @param {string} ollamaPath - Path to Ollama binary
 * @returns {Promise<void>}
 */
function startOllama(ollamaPath) {
  return new Promise((resolve, reject) => {
    console.log('Starting Ollama server...');

    ollamaProcess = spawn(ollamaPath, ['serve'], {
      detached: false,
      stdio: 'ignore'
    });

    ollamaProcess.on('error', (error) => {
      reject(new Error(`Failed to start Ollama: ${error.message}`));
    });

    // Wait a bit for Ollama to start up
    setTimeout(async () => {
      if (await isOllamaRunning()) {
        wasStartedByUs = true;
        console.log('✓ Ollama server started successfully\n');
        resolve();
      } else {
        reject(new Error('Ollama started but is not responding'));
      }
    }, 3000);
  });
}

/**
 * Check if a specific model is available
 * @param {string} model - Model name to check
 * @param {string} ollamaPath - Path to Ollama binary
 * @returns {boolean}
 */
function isModelAvailable(model, ollamaPath) {
  try {
    const result = execSync(`${ollamaPath} list`, { encoding: 'utf8' });
    return result.includes(model);
  } catch (error) {
    return false;
  }
}

/**
 * Pull a model from Ollama registry
 * @param {string} model - Model name to pull
 * @param {string} ollamaPath - Path to Ollama binary
 * @returns {Promise<void>}
 */
function pullModel(model, ollamaPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading model "${model}"... This may take a few minutes.`);

    const pullProcess = spawn(ollamaPath, ['pull', model], {
      stdio: 'inherit'
    });

    pullProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`✓ Model "${model}" downloaded successfully\n`);
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
 * @param {string} model - Model name to check/download
 * @param {string} host - Ollama host URL
 * @returns {Promise<void>}
 */
async function ensureOllamaReady(model, host = 'http://localhost:11434') {
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

  console.log(`✓ Ollama found at: ${ollamaPath}`);

  // Step 2: Check if Ollama is running
  const running = await isOllamaRunning(host);
  if (!running) {
    await startOllama(ollamaPath);
  } else {
    console.log('✓ Ollama is already running\n');
  }

  // Step 3: Check if the required model is available
  if (!isModelAvailable(model, ollamaPath)) {
    console.log(`Model "${model}" not found locally.`);
    await pullModel(model, ollamaPath);
  } else {
    console.log(`✓ Model "${model}" is available\n`);
  }
}

/**
 * Stop Ollama server if it was started by us
 * @param {boolean} force - Force stop even if we didn't start it
 */
function stopOllama(force = false) {
  if (ollamaProcess && (wasStartedByUs || force)) {
    console.log('\nStopping Ollama server...');
    try {
      ollamaProcess.kill('SIGTERM');
      ollamaProcess = null;
      wasStartedByUs = false;
      console.log('✓ Ollama server stopped');
    } catch (error) {
      console.warn(`Warning: Could not stop Ollama: ${error.message}`);
    }
  }
}

/**
 * Check if Ollama was started by this script
 * @returns {boolean}
 */
function wasOllamaStartedByUs() {
  return wasStartedByUs;
}

module.exports = {
  ensureOllamaReady,
  stopOllama,
  wasOllamaStartedByUs
};
