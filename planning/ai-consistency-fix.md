# AI Consistency Fix - Analysis and Solution

**Date:** 2025-10-19
**Issue:** Mistral model gives inconsistent results for the same file (sometimes detects daughter, sometimes doesn't)

---

## Problem Statement

The current Mistral AI model produces inconsistent results when analyzing the same file multiple times. For example, it may detect "my daughter" in one run but fail to detect her in another run with identical input.

## Root Cause Analysis

### Missing Temperature Parameter

Looking at `ai-analyzer.js:79-83`, the Ollama API call does **NOT** specify a temperature parameter:

```javascript
const response = await ollama.generate({
  model: model,
  prompt: prompt,
  stream: false
});
```

**Impact:**
- Without an explicit temperature setting, Ollama uses a default temperature (typically ~0.8)
- Temperature controls randomness in the model's responses:
  - `0.0` = Completely deterministic (same input → same output)
  - `0.8` = Moderate randomness (default)
  - `1.0+` = High creativity/randomness
- With temperature at 0.8, the same input produces different outputs each time

This is the primary cause of inconsistent detection results.

---

## Current Configuration

### Model Information

From `ollama list` output:

| Model | ID | Size | Parameters | Notes |
|-------|-----|------|------------|-------|
| **mistral:latest** | 6577803aa9a0 | 4.4 GB | 7B | Currently in use |
| llama2:latest | 78e26419b446 | 3.8 GB | 7B | Alternative |
| llama3.2:3b | a80c4f17acd5 | 2.0 GB | 3B | Smaller, less capable |

**Current Model:** Mistral 7B (7 billion parameters)
- Good for French/English multilingual support
- Fast inference
- Moderate accuracy

### Configuration File Analysis

**ai-analyzer.js:**
- Model: Configurable via `process.env.OLLAMA_MODEL` (default: 'mistral')
- Host: Configurable via `process.env.OLLAMA_HOST` (default: 'http://localhost:11434')
- Custom Instructions: Configurable via `process.env.AI_CUSTOM_INSTRUCTIONS`

**Missing Parameters:**
- ❌ Temperature
- ❌ Context window size (num_ctx)
- ❌ Top-p (nucleus sampling)
- ❌ Repeat penalty
- ❌ Seed (for reproducibility)

---

## Available Larger Models

You can download and use larger, more accurate models:

### Recommended Upgrades

1. **Mixtral 8x7B** (~26 GB)
   ```bash
   ollama pull mixtral:8x7b
   ```
   - 47B parameters (mixture of experts)
   - Significantly better reasoning and accuracy
   - Excellent multilingual support
   - Still runs on consumer hardware

2. **Llama 3 70B** (~40 GB)
   ```bash
   ollama pull llama3:70b
   ```
   - 70 billion parameters
   - State-of-the-art performance
   - Better at understanding context and nuance
   - Requires more RAM/VRAM

3. **Qwen 2.5** (14B or 32B)
   ```bash
   ollama pull qwen2.5:14b
   # or
   ollama pull qwen2.5:32b
   ```
   - Excellent multilingual capabilities
   - Strong reasoning abilities
   - Good balance of speed and accuracy

4. **Llama 3.1 8B**
   ```bash
   ollama pull llama3.1:8b
   ```
   - Similar size to Mistral
   - Newer architecture, better performance
   - Good starting point for upgrade

### Model Size vs Accuracy Trade-offs

| Model | Size | Speed | Accuracy | Best For |
|-------|------|-------|----------|----------|
| Mistral 7B | 4.4 GB | ⚡⚡⚡ Fast | ⭐⭐⭐ Good | Quick processing, multilingual |
| Llama3.1 8B | 4.7 GB | ⚡⚡⚡ Fast | ⭐⭐⭐⭐ Better | Balanced upgrade |
| Qwen2.5 14B | 8.5 GB | ⚡⚡ Medium | ⭐⭐⭐⭐ Better | Multilingual, detailed |
| Mixtral 8x7B | 26 GB | ⚡⚡ Medium | ⭐⭐⭐⭐⭐ Excellent | Best quality, still practical |
| Llama3 70B | 40 GB | ⚡ Slow | ⭐⭐⭐⭐⭐ Excellent | Maximum accuracy |

---

## Proposed Solution

### 1. Add Temperature Control

**File:** `ai-analyzer.js`

**Current code (lines 79-83):**
```javascript
const response = await ollama.generate({
  model: model,
  prompt: prompt,
  stream: false
});
```

**Proposed change:**
```javascript
const temperature = parseFloat(process.env.OLLAMA_TEMPERATURE || '0');
const numCtx = parseInt(process.env.OLLAMA_NUM_CTX || '4096', 10);

const response = await ollama.generate({
  model: model,
  prompt: prompt,
  stream: false,
  options: {
    temperature: temperature,      // Control randomness (0 = deterministic)
    num_ctx: numCtx,               // Context window size
    top_p: 0.9,                    // Nucleus sampling
    repeat_penalty: 1.1            // Prevent repetition
  }
});
```

### 2. Update Environment Variables

**File:** `.env.example`

**Add these new configuration options:**
```bash
# AI Model Configuration
# Temperature: Controls randomness in AI responses
# - 0.0 = Completely deterministic (recommended for consistency)
# - 0.3 = Slight variation, mostly consistent
# - 0.7 = Balanced creativity and consistency
# - 1.0+ = High creativity, less consistent
OLLAMA_TEMPERATURE=0

# Context Window: Number of tokens the model can consider
# - 2048 = Default, suitable for most documents
# - 4096 = Better for longer documents
# - 8192 = Maximum context (slower, more memory)
OLLAMA_NUM_CTX=4096

# Model Options (uncomment to use larger models)
# OLLAMA_MODEL=mistral           # 7B - Current, fast (4.4 GB)
# OLLAMA_MODEL=llama3.1:8b       # 8B - Better accuracy (4.7 GB)
# OLLAMA_MODEL=qwen2.5:14b       # 14B - Excellent multilingual (8.5 GB)
# OLLAMA_MODEL=mixtral:8x7b      # 47B - Best quality (26 GB)
# OLLAMA_MODEL=llama3:70b        # 70B - Maximum accuracy (40 GB)
```

### 3. Update README Documentation

**File:** `README.md`

Add a new section explaining temperature and model selection:

```markdown
## Advanced Configuration

### Temperature Control

Control the consistency of AI responses by setting `OLLAMA_TEMPERATURE` in `.env`:

- `0.0` (recommended): Completely deterministic - same file always produces same results
- `0.3`: Slight variation while maintaining consistency
- `0.7`: Balanced creativity and consistency
- `1.0+`: High creativity, useful for diverse tag suggestions

**For consistent detection (e.g., family members, specific keywords), use `OLLAMA_TEMPERATURE=0`**

### Using Larger Models

For better accuracy in detecting people, dates, and details:

1. **Llama 3.1 8B** (easy upgrade, similar speed):
   ```bash
   ollama pull llama3.1:8b
   ```
   Then set in `.env`: `OLLAMA_MODEL=llama3.1:8b`

2. **Mixtral 8x7B** (best balance):
   ```bash
   ollama pull mixtral:8x7b
   ```
   Then set in `.env`: `OLLAMA_MODEL=mixtral:8x7b`

3. **Llama 3 70B** (maximum accuracy, requires more resources):
   ```bash
   ollama pull llama3:70b
   ```
   Then set in `.env`: `OLLAMA_MODEL=llama3:70b`

**Note:** Larger models require more RAM and take longer to process, but provide significantly better accuracy.
```

---

## Implementation Checklist

- [ ] Update `ai-analyzer.js` to include temperature and other parameters
- [ ] Add environment variable parsing for `OLLAMA_TEMPERATURE` and `OLLAMA_NUM_CTX`
- [ ] Update `.env.example` with new configuration options and documentation
- [ ] Update `README.md` with advanced configuration section
- [ ] Test with temperature=0 to verify consistent results
- [ ] Document available larger models with download commands
- [ ] (Optional) Consider adding custom instructions specifically for family member detection

---

## Testing Plan

1. **Test with current Mistral model + temperature=0**
   - Run same file 5 times
   - Verify identical results each time

2. **Test with larger model (e.g., Mixtral 8x7B)**
   - Compare detection accuracy
   - Measure processing time difference

3. **Test with custom instructions**
   - Add specific instruction: "Always identify family members mentioned in the document"
   - Verify improved detection

---

## Expected Outcome

After implementing these changes:

1. ✅ **Consistent results** - Same file will always produce same output when temperature=0
2. ✅ **Better control** - Users can adjust temperature based on their needs
3. ✅ **Model flexibility** - Easy to upgrade to larger models for better accuracy
4. ✅ **Documentation** - Clear guidance on configuration options
5. ✅ **Better detection** - Larger models will more reliably detect family members and details

---

## References

- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Ollama Model Library](https://ollama.com/library)
- [Temperature in LLMs](https://platform.openai.com/docs/guides/text-generation/temperature)
