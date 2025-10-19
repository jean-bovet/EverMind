# Hybrid AI Provider Implementation Plan

**Date:** 2025-10-19
**Objective:** Add Claude API support alongside Ollama, giving users choice between local (free) and cloud (accurate) AI analysis

---

## Executive Summary

This plan implements a **hybrid AI provider system** that allows users to choose between:

1. **Ollama** (Local AI) - Free, private, fast, good accuracy
2. **Claude** (Cloud API) - Paid, excellent accuracy, better family/detail detection
3. **Auto** - Intelligently choose based on file type or custom rules

**Key Benefits:**
- ✅ Flexibility: Choose the right AI for each use case
- ✅ Cost control: Use free Ollama for bulk processing
- ✅ Better accuracy: Use Claude when detection quality matters
- ✅ Backward compatible: Existing Ollama setup continues to work
- ✅ Consistent results: Both providers will use temperature=0

---

## Architecture Overview

### Current Architecture
```
index.js → ai-analyzer.js → Ollama API
```

### Proposed Architecture
```
index.js → ai-analyzer.js → Provider Factory → OllamaProvider
                                            → ClaudeProvider
```

### Provider Pattern

We'll implement an abstract provider pattern with a common interface:

```
BaseProvider (abstract)
├── analyzeContent(text, fileName, fileType, existingTags, options)
├── isAvailable()
└── getName()

OllamaProvider extends BaseProvider
└── Uses existing Ollama logic

ClaudeProvider extends BaseProvider
└── Uses @anthropic-ai/sdk
```

---

## File Structure

### New Directory: `ai-providers/`

```
evernote-ai-importer/
├── ai-providers/
│   ├── index.js              # Provider factory & selection logic
│   ├── BaseProvider.js       # Abstract base class
│   ├── OllamaProvider.js     # Ollama implementation
│   └── ClaudeProvider.js     # Claude API implementation
├── ai-analyzer.js            # Refactored to use providers
├── planning/
│   ├── ai-consistency-fix.md
│   └── hybrid-ai-providers.md (this file)
└── [existing files...]
```

---

## Implementation Details

### 1. BaseProvider (Abstract Class)

**File:** `ai-providers/BaseProvider.js`

```javascript
/**
 * Abstract base class for AI providers
 */
class BaseProvider {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Analyze content and return description and tags
   * @param {string} text - Extracted text from file
   * @param {string} fileName - Name of the file
   * @param {string} fileType - Type of file
   * @param {string[]} existingTags - Existing tags from Evernote
   * @param {Object} options - Additional options (verbose, debug, etc.)
   * @returns {Promise<{description: string, tags: string[]}>}
   */
  async analyzeContent(text, fileName, fileType, existingTags = [], options = {}) {
    throw new Error('analyzeContent must be implemented by subclass');
  }

  /**
   * Check if this provider is available/configured
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    throw new Error('isAvailable must be implemented by subclass');
  }

  /**
   * Get the provider name
   * @returns {string}
   */
  getName() {
    throw new Error('getName must be implemented by subclass');
  }

  /**
   * Build the analysis prompt (shared between providers)
   * @protected
   */
  buildPrompt(text, fileName, fileType, existingTags, customInstructions) {
    const maxLength = 4000;
    const truncatedText = text.length > maxLength
      ? text.substring(0, maxLength) + '...[truncated]'
      : text;

    const tagInstructions = existingTags.length > 0
      ? `2. Select 3-7 relevant tags from the EXISTING TAGS list below

EXISTING TAGS (you MUST choose ONLY from this list):
${existingTags.join(', ')}

IMPORTANT: You MUST select tags ONLY from the existing tags list above. Do NOT create new tags.`
      : `2. 5-7 relevant tags/keywords that categorize this content`;

    const customSection = customInstructions
      ? `\n\nADDITIONAL INSTRUCTIONS:\n${customInstructions}\n`
      : '';

    return `You are analyzing a file named "${fileName}" of type "${fileType}".

CRITICAL INSTRUCTION: You MUST respond in the SAME LANGUAGE as the file content below. If the content is in French, write your entire response in French. If in English, write in English. Match the language exactly.

File content:
${truncatedText}
${customSection}
Please analyze this content and provide:
1. A description of what this file contains. Include important information such as: location, date, names, amounts, and other key details.
${tagInstructions}

Format your response as JSON:
{
  "description": "your description here",
  "tags": ["tag1", "tag2", "tag3"]
}

Respond ONLY with the JSON object, no additional text.`;
  }

  /**
   * Parse AI response and extract description and tags
   * @protected
   */
  parseResponse(response) {
    try {
      // Try to find JSON in the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          description: parsed.description || 'No description provided',
          tags: Array.isArray(parsed.tags) ? parsed.tags : []
        };
      }

      // Fallback: try to parse the entire response
      const parsed = JSON.parse(response);
      return {
        description: parsed.description || 'No description provided',
        tags: Array.isArray(parsed.tags) ? parsed.tags : []
      };

    } catch (error) {
      console.warn('Could not parse AI response as JSON, using fallback parsing.');
      return {
        description: response.substring(0, 200) || 'File content analyzed',
        tags: ['document', 'imported']
      };
    }
  }
}

module.exports = BaseProvider;
```

### 2. OllamaProvider

**File:** `ai-providers/OllamaProvider.js`

```javascript
const { Ollama } = require('ollama');
const { ensureOllamaReady } = require('../ollama-manager');
const { createSpinner, colors } = require('../output-formatter');
const BaseProvider = require('./BaseProvider');

/**
 * Ollama AI Provider (Local)
 */
class OllamaProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.host = config.host || process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.model = config.model || process.env.OLLAMA_MODEL || 'mistral';
    this.temperature = parseFloat(config.temperature ?? process.env.OLLAMA_TEMPERATURE ?? '0');
    this.numCtx = parseInt(config.numCtx ?? process.env.OLLAMA_NUM_CTX ?? '4096', 10);
  }

  getName() {
    return 'Ollama (Local)';
  }

  async isAvailable() {
    try {
      await ensureOllamaReady(this.model, this.host, false);
      return true;
    } catch (error) {
      return false;
    }
  }

  async analyzeContent(text, fileName, fileType, existingTags = [], options = {}) {
    const { verbose = false, debug = false, sourceFilePath = null } = options;
    const customInstructions = process.env.AI_CUSTOM_INSTRUCTIONS || '';

    // Ensure Ollama is ready
    await ensureOllamaReady(this.model, this.host, verbose);

    const ollama = new Ollama({ host: this.host });

    let spinner;
    if (verbose) {
      spinner = createSpinner(`Analyzing with ${this.getName()} (${colors.highlight(this.model)})`).start();
    }

    // Build prompt
    const prompt = this.buildPrompt(text, fileName, fileType, existingTags, customInstructions);

    // Save prompt if debug mode
    if (debug && sourceFilePath) {
      const { saveDebugFile } = require('../debug-helper');
      await saveDebugFile(sourceFilePath, 'prompt-ollama', prompt);
    }

    try {
      const response = await ollama.generate({
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: this.temperature,
          num_ctx: this.numCtx,
          top_p: 0.9,
          repeat_penalty: 1.1
        }
      });

      // Save response if debug mode
      if (debug && sourceFilePath) {
        const { saveDebugFile } = require('../debug-helper');
        await saveDebugFile(sourceFilePath, 'response-ollama', response.response);
      }

      const result = this.parseResponse(response.response);

      if (verbose && spinner) {
        spinner.succeed(`${this.getName()} analysis completed`);
      }

      return result;

    } catch (error) {
      if (verbose && spinner) {
        spinner.fail(`${this.getName()} analysis failed`);
      }
      throw new Error(`Failed to analyze with ${this.getName()}: ${error.message}`);
    }
  }
}

module.exports = OllamaProvider;
```

### 3. ClaudeProvider

**File:** `ai-providers/ClaudeProvider.js`

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const { createSpinner, colors } = require('../output-formatter');
const BaseProvider = require('./BaseProvider');

/**
 * Claude AI Provider (Cloud API)
 */
class ClaudeProvider extends BaseProvider {
  constructor(config = {}) {
    super(config);
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.model = config.model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
    this.temperature = parseFloat(config.temperature ?? process.env.CLAUDE_TEMPERATURE ?? '0');
    this.maxTokens = parseInt(config.maxTokens ?? process.env.CLAUDE_MAX_TOKENS ?? '2048', 10);

    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for Claude provider');
    }

    this.client = new Anthropic({ apiKey: this.apiKey });
  }

  getName() {
    return 'Claude (Cloud)';
  }

  async isAvailable() {
    return !!this.apiKey;
  }

  async analyzeContent(text, fileName, fileType, existingTags = [], options = {}) {
    const { verbose = false, debug = false, sourceFilePath = null } = options;
    const customInstructions = process.env.AI_CUSTOM_INSTRUCTIONS || '';

    let spinner;
    if (verbose) {
      spinner = createSpinner(`Analyzing with ${this.getName()} (${colors.highlight(this.model)})`).start();
    }

    // Build prompt
    const prompt = this.buildPrompt(text, fileName, fileType, existingTags, customInstructions);

    // Save prompt if debug mode
    if (debug && sourceFilePath) {
      const { saveDebugFile } = require('../debug-helper');
      await saveDebugFile(sourceFilePath, 'prompt-claude', prompt);
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      // Extract text from response
      const responseText = response.content[0].text;

      // Save response if debug mode
      if (debug && sourceFilePath) {
        const { saveDebugFile } = require('../debug-helper');
        await saveDebugFile(sourceFilePath, 'response-claude', responseText);
        await saveDebugFile(sourceFilePath, 'response-claude-full', JSON.stringify(response, null, 2));
      }

      const result = this.parseResponse(responseText);

      if (verbose && spinner) {
        spinner.succeed(`${this.getName()} analysis completed (${response.usage.input_tokens} in, ${response.usage.output_tokens} out)`);
      }

      return result;

    } catch (error) {
      if (verbose && spinner) {
        spinner.fail(`${this.getName()} analysis failed`);
      }
      throw new Error(`Failed to analyze with ${this.getName()}: ${error.message}`);
    }
  }
}

module.exports = ClaudeProvider;
```

### 4. Provider Factory

**File:** `ai-providers/index.js`

```javascript
const OllamaProvider = require('./OllamaProvider');
const ClaudeProvider = require('./ClaudeProvider');

/**
 * Provider types
 */
const PROVIDERS = {
  OLLAMA: 'ollama',
  CLAUDE: 'claude',
  AUTO: 'auto'
};

/**
 * Create an AI provider instance based on configuration
 * @param {string} providerType - 'ollama', 'claude', or 'auto'
 * @param {Object} config - Provider configuration
 * @returns {BaseProvider}
 */
function createProvider(providerType = null, config = {}) {
  const type = providerType || process.env.AI_PROVIDER || PROVIDERS.AUTO;

  switch (type.toLowerCase()) {
    case PROVIDERS.OLLAMA:
      return new OllamaProvider(config);

    case PROVIDERS.CLAUDE:
      return new ClaudeProvider(config);

    case PROVIDERS.AUTO:
      // Auto-select: prefer Claude if API key is available, otherwise Ollama
      if (process.env.ANTHROPIC_API_KEY) {
        console.log('Auto-selecting Claude provider (API key found)');
        return new ClaudeProvider(config);
      } else {
        console.log('Auto-selecting Ollama provider (no Claude API key)');
        return new OllamaProvider(config);
      }

    default:
      throw new Error(`Unknown provider type: ${type}. Use 'ollama', 'claude', or 'auto'`);
  }
}

/**
 * Get list of available providers
 * @returns {Promise<string[]>}
 */
async function getAvailableProviders() {
  const available = [];

  try {
    const ollama = new OllamaProvider();
    if (await ollama.isAvailable()) {
      available.push(PROVIDERS.OLLAMA);
    }
  } catch (error) {
    // Ollama not available
  }

  try {
    const claude = new ClaudeProvider();
    if (await claude.isAvailable()) {
      available.push(PROVIDERS.CLAUDE);
    }
  } catch (error) {
    // Claude not available
  }

  return available;
}

module.exports = {
  createProvider,
  getAvailableProviders,
  PROVIDERS,
  OllamaProvider,
  ClaudeProvider
};
```

---

## Configuration Changes

### Environment Variables (.env.example)

Add these new configuration options:

```bash
# AI Provider Selection
# Options: ollama, claude, auto
# - ollama: Use local Ollama (free, private)
# - claude: Use Claude API (paid, more accurate)
# - auto: Automatically choose (prefers Claude if API key is set)
AI_PROVIDER=auto

# ===== OLLAMA CONFIGURATION =====
# Model to use for AI analysis (default: mistral for French/English support)
# Options: mistral, llama3.1:8b, qwen2.5:14b, mixtral:8x7b, llama3:70b
OLLAMA_MODEL=mistral

# Ollama API endpoint (default: http://localhost:11434)
OLLAMA_HOST=http://localhost:11434

# Ollama Temperature: Controls randomness
# 0.0 = Completely deterministic (recommended for consistency)
# 0.7 = Balanced creativity
OLLAMA_TEMPERATURE=0

# Context window size (number of tokens)
OLLAMA_NUM_CTX=4096

# ===== CLAUDE CONFIGURATION =====
# Anthropic API Key (required for Claude provider)
# Get your API key from: https://console.anthropic.com/
ANTHROPIC_API_KEY=

# Claude model to use
# Options: claude-sonnet-4-5-20250929, claude-3-5-sonnet-20241022, claude-3-opus-20240229
CLAUDE_MODEL=claude-sonnet-4-5-20250929

# Claude Temperature: Controls randomness
# 0.0 = Completely deterministic (recommended)
CLAUDE_TEMPERATURE=0

# Maximum tokens in response
CLAUDE_MAX_TOKENS=2048

# ===== SHARED CONFIGURATION =====
# Custom AI Instructions (optional)
# Add any additional instructions for the AI to follow when analyzing documents
AI_CUSTOM_INSTRUCTIONS=
```

### CLI Changes (index.js)

Add `--provider` flag:

```javascript
program
  .name('evernote-ai-importer')
  .description('Import files to Evernote with AI-generated descriptions and tags')
  .version('1.0.0')
  .argument('[file]', 'path to the file to import')
  .option('-v, --verbose', 'enable verbose output')
  .option('--debug', 'save debug output (extracted text, prompt, response) next to source file')
  .option('--auth', 'authenticate with Evernote (first-time setup)')
  .option('--logout', 'remove stored authentication token')
  .option('--list-tags', 'list all existing tags from Evernote')
  .option('--keep-ollama', 'keep Ollama running after completion (default: auto-stop if we started it)')
  .option('--provider <type>', 'AI provider to use: ollama, claude, or auto (default: auto)')
  .option('--list-providers', 'list available AI providers')
  .action(async (filePath, options) => {
    // ... existing code ...
  });
```

Add provider listing:

```javascript
// Handle list providers
if (options.listProviders) {
  const { getAvailableProviders } = require('./ai-providers');
  const available = await getAvailableProviders();

  console.log('\n🤖 Available AI Providers:\n');
  if (available.includes('ollama')) {
    console.log('  ✓ Ollama (Local) - Free, private, fast');
  } else {
    console.log('  ✗ Ollama (Local) - Not available (install from https://ollama.ai)');
  }

  if (available.includes('claude')) {
    console.log('  ✓ Claude (Cloud) - Excellent accuracy, uses API credits');
  } else {
    console.log('  ✗ Claude (Cloud) - Not available (set ANTHROPIC_API_KEY in .env)');
  }

  console.log('');
  return;
}
```

### Update ai-analyzer.js

Refactor to use provider pattern:

```javascript
const { createProvider } = require('./ai-providers');

async function analyzeContent(text, fileName, fileType, existingTags = [], verbose = false, debug = false, sourceFilePath = null, providerType = null) {
  // Create provider instance
  const provider = createProvider(providerType);

  if (verbose) {
    console.log(`Using AI provider: ${provider.getName()}`);
  }

  // Delegate to provider
  return await provider.analyzeContent(text, fileName, fileType, existingTags, {
    verbose,
    debug,
    sourceFilePath
  });
}

module.exports = {
  analyzeContent
};
```

---

## Package.json Changes

Add Claude SDK dependency:

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "ollama": "^0.5.0",
    "commander": "^11.0.0",
    "dotenv": "^16.0.0",
    "evernote": "^2.0.5",
    "pdf-parse": "^1.1.1",
    "mammoth": "^1.6.0",
    "tesseract.js": "^5.0.0",
    "chalk": "^4.1.2",
    "ora": "^5.4.1",
    "cli-boxes": "^3.0.0"
  }
}
```

---

## Usage Examples

### Use Ollama (default, existing behavior)
```bash
node index.js /path/to/file.pdf
# or explicitly:
node index.js /path/to/file.pdf --provider ollama
```

### Use Claude for better accuracy
```bash
node index.js /path/to/file.pdf --provider claude
```

### Auto-select (default with AI_PROVIDER=auto)
```bash
# If ANTHROPIC_API_KEY is set, uses Claude
# Otherwise, uses Ollama
node index.js /path/to/file.pdf --provider auto
```

### List available providers
```bash
node index.js --list-providers
```

---

## Migration Path

### Phase 1: Core Implementation (Week 1)
- [ ] Create `ai-providers/` directory structure
- [ ] Implement BaseProvider abstract class
- [ ] Implement OllamaProvider (refactor existing logic)
- [ ] Add temperature=0 to OllamaProvider
- [ ] Test OllamaProvider for consistency

### Phase 2: Claude Integration (Week 1-2)
- [ ] Add `@anthropic-ai/sdk` dependency
- [ ] Implement ClaudeProvider
- [ ] Test ClaudeProvider with sample files
- [ ] Verify temperature=0 gives consistent results
- [ ] Test multilingual support (French/English)

### Phase 3: Provider Factory (Week 2)
- [ ] Implement provider factory
- [ ] Add auto-selection logic
- [ ] Implement provider availability checking
- [ ] Add `--list-providers` command

### Phase 4: Configuration & CLI (Week 2)
- [ ] Update `.env.example` with all new options
- [ ] Add `--provider` CLI flag
- [ ] Update `ai-analyzer.js` to use providers
- [ ] Update `index.js` to pass provider selection

### Phase 5: Documentation & Testing (Week 3)
- [ ] Update README.md with hybrid provider docs
- [ ] Add usage examples for both providers
- [ ] Document cost comparison
- [ ] Test with real files (PDFs, images, etc.)
- [ ] Test family member detection with both providers

### Phase 6: Optimization (Week 3-4)
- [ ] Add cost tracking for Claude usage
- [ ] Consider caching results
- [ ] Add provider switching based on file size
- [ ] Performance benchmarking

---

## Testing Strategy

### Unit Tests

Test each provider independently:

```javascript
// Test OllamaProvider
const provider = new OllamaProvider({ temperature: 0 });
const result1 = await provider.analyzeContent(sampleText, 'test.pdf', 'pdf', []);
const result2 = await provider.analyzeContent(sampleText, 'test.pdf', 'pdf', []);
// Should be identical
assert.deepEqual(result1, result2);

// Test ClaudeProvider
const claudeProvider = new ClaudeProvider({ temperature: 0, apiKey: 'test-key' });
// Similar tests...
```

### Integration Tests

1. **Consistency Test**: Same file, 5 runs with each provider
2. **Accuracy Test**: Files with known content (daughter's name, amounts, dates)
3. **Multilingual Test**: French and English documents
4. **Tag Selection Test**: Verify only existing tags are selected
5. **Error Handling Test**: Invalid API keys, network failures, etc.

### Benchmark Tests

Compare providers on:
- Accuracy (family member detection, date extraction, amount recognition)
- Speed (average processing time)
- Consistency (result variance across runs)
- Cost (Claude API usage)

---

## Cost Analysis

### Ollama (Local)
- **Cost**: $0 (free)
- **Setup**: One-time Ollama installation
- **Ongoing**: Electricity costs (minimal)

### Claude API
- **Pricing** (as of 2025):
  - Sonnet 4.5: ~$3 per million input tokens, ~$15 per million output tokens
  - Average file analysis: ~1,000 input tokens, ~200 output tokens
  - **Cost per file**: ~$0.006 (less than 1 cent)
  - **100 files**: ~$0.60
  - **1,000 files**: ~$6.00

### Hybrid Strategy (Recommended)

Use Ollama for:
- Bulk imports (hundreds of files)
- Simple documents (plain text, receipts)
- Privacy-sensitive documents

Use Claude for:
- Important documents (family photos, legal documents)
- Complex analysis requirements
- When accuracy matters most

**Example monthly cost:**
- 200 files via Ollama: $0
- 50 files via Claude: $0.30
- **Total**: $0.30/month

---

## Risk Assessment

### Risks

1. **API Key Security**
   - Risk: ANTHROPIC_API_KEY exposed in .env
   - Mitigation: Add .env to .gitignore (already done), documentation warning

2. **Cost Overruns**
   - Risk: Accidentally using Claude for bulk processing
   - Mitigation: Default to Ollama, require explicit --provider flag, add usage logging

3. **Network Dependency**
   - Risk: Claude requires internet connection
   - Mitigation: Fallback to Ollama on network errors, clear error messages

4. **Breaking Changes**
   - Risk: Refactoring breaks existing functionality
   - Mitigation: Maintain backward compatibility, comprehensive testing

### Success Criteria

- ✅ Ollama provider gives consistent results (temperature=0)
- ✅ Claude provider gives better accuracy on test set
- ✅ Provider switching works seamlessly
- ✅ Backward compatible with existing Ollama users
- ✅ Clear documentation for both providers
- ✅ Cost stays under $1/month for typical usage

---

## Future Enhancements

### Phase 2 (Future)
- [ ] Add OpenAI GPT-4 provider
- [ ] Add Google Gemini provider
- [ ] Implement provider caching (avoid re-analyzing same file)
- [ ] Add A/B testing mode (compare provider results)
- [ ] Smart provider selection based on file type
- [ ] Cost tracking dashboard
- [ ] Batch processing optimization

### Advanced Features
- [ ] Multi-provider consensus (run both, compare results)
- [ ] Provider fallback chain (try Claude, fallback to Ollama)
- [ ] Custom provider plugins
- [ ] Provider performance metrics
- [ ] Auto-selection based on past accuracy

---

## References

- [Anthropic Claude API Documentation](https://docs.anthropic.com/)
- [Anthropic SDK for Node.js](https://github.com/anthropics/anthropic-sdk-typescript)
- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Provider Pattern - Software Design](https://refactoring.guru/design-patterns/strategy)
- [Temperature in LLMs](https://platform.openai.com/docs/guides/text-generation/temperature)

---

## Conclusion

This hybrid approach provides:

1. **Best of both worlds**: Free local processing + cloud accuracy when needed
2. **User choice**: Let users decide based on their needs
3. **Future-proof**: Easy to add more providers (OpenAI, Google, etc.)
4. **Cost-effective**: Most users will spend <$1/month
5. **Better results**: Claude's superior accuracy for important documents

The implementation is straightforward, maintains backward compatibility, and provides a solid foundation for future AI provider integrations.
