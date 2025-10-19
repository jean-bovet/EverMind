const chalk = require('chalk');
const ora = require('ora');

/**
 * Color scheme for consistent output formatting
 */
const colors = {
  success: chalk.green,
  info: chalk.blue,
  warning: chalk.yellow,
  error: chalk.red,
  highlight: chalk.cyan,
  muted: chalk.gray,
  accent: chalk.magenta
};

/**
 * Box drawing characters
 */
const box = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  verticalRight: '├',
  verticalLeft: '┤',
  cross: '┼'
};

/**
 * Get the current terminal width
 * @returns {number} Terminal width in columns (defaults to 80 if not available)
 */
function getTerminalWidth() {
  return process.stdout.columns || 80;
}

/**
 * Create a horizontal line
 * @param {number} width - Width of the line (auto-detects if not provided)
 * @param {string} char - Character to use (default: ─)
 * @returns {string}
 */
function horizontalLine(width = null, char = box.horizontal) {
  const actualWidth = width !== null ? width : getTerminalWidth();
  return char.repeat(actualWidth);
}

/**
 * Create a box around text
 * @param {string} content - Content to box
 * @param {object} options - Options for the box
 * @returns {string}
 */
function createBox(content, options = {}) {
  const { width = null, title = '', padding = 1 } = options;
  const actualWidth = width !== null ? width : getTerminalWidth();
  const lines = content.split('\n');

  // Create top border
  let result = box.topLeft;
  if (title) {
    result += box.horizontal + ' ' + title + ' ';
    result += horizontalLine(actualWidth - title.length - 4, box.horizontal);
  } else {
    result += horizontalLine(actualWidth - 2, box.horizontal);
  }
  result += box.topRight + '\n';

  // Add padding
  for (let i = 0; i < padding; i++) {
    result += box.vertical + ' '.repeat(actualWidth - 2) + box.vertical + '\n';
  }

  // Add content lines
  lines.forEach(line => {
    const paddedLine = line.padEnd(actualWidth - 4);
    result += box.vertical + ' ' + paddedLine + ' ' + box.vertical + '\n';
  });

  // Add padding
  for (let i = 0; i < padding; i++) {
    result += box.vertical + ' '.repeat(actualWidth - 2) + box.vertical + '\n';
  }

  // Create bottom border
  result += box.bottomLeft + horizontalLine(actualWidth - 2, box.horizontal) + box.bottomRight;

  return result;
}

/**
 * Create a step header
 * @param {number} stepNumber - Step number
 * @param {string} description - Step description
 * @param {number} width - Width of the header (auto-detects if not provided)
 * @returns {string}
 */
function stepHeader(stepNumber, description, width = null) {
  const actualWidth = width !== null ? width : getTerminalWidth();
  const title = `Step ${stepNumber}: ${description}`;
  const remaining = actualWidth - title.length - 5;

  return '\n' + box.topLeft + box.horizontal + ' ' +
         colors.info.bold(title) + ' ' +
         horizontalLine(remaining, box.horizontal) + box.topRight;
}

/**
 * Create a step item line
 * @param {string} text - Item text
 * @param {number} width - Width of the line (auto-detects if not provided)
 * @returns {string}
 */
function stepItem(text, width = null) {
  const actualWidth = width !== null ? width : getTerminalWidth();
  // Strip ANSI codes for length calculation
  const plainText = text.replace(/\x1b\[[0-9;]*m/g, '');
  const paddingNeeded = actualWidth - plainText.length - 4;

  return box.vertical + ' ' + text + ' '.repeat(Math.max(0, paddingNeeded)) + ' ' + box.vertical;
}

/**
 * Create a step footer with timing
 * @param {number} durationMs - Duration in milliseconds
 * @param {number} width - Width of the footer (auto-detects if not provided)
 * @returns {string}
 */
function stepFooter(durationMs, width = null) {
  const actualWidth = width !== null ? width : getTerminalWidth();
  const duration = (durationMs / 1000).toFixed(2);
  const timingText = `${colors.muted('⏱  Completed in')} ${colors.highlight(duration + 's')}`;
  // Strip ANSI codes for length calculation
  const plainText = timingText.replace(/\x1b\[[0-9;]*m/g, '');
  const paddedText = plainText.padEnd(actualWidth - 4);

  const result = box.vertical + ' ' + timingText + ' '.repeat(actualWidth - plainText.length - 2) + box.vertical + '\n' +
         box.bottomLeft + horizontalLine(actualWidth - 2, box.horizontal) + box.bottomRight;

  return result;
}

/**
 * Format extracted text preview
 * @param {string} text - Full text content
 * @param {string} fileType - Type of file
 * @param {number} maxChars - Maximum characters to show
 * @param {number} width - Width of the box (auto-detects if not provided)
 * @returns {string}
 */
function formatTextPreview(text, fileType, maxChars = 500, width = null) {
  const totalChars = text.length;
  const preview = text.substring(0, maxChars);
  const truncated = totalChars > maxChars;
  const remaining = totalChars - maxChars;

  const actualWidth = width !== null ? width : getTerminalWidth();

  // Split preview into lines
  const previewLines = [];
  const lines = preview.split('\n');

  for (const line of lines) {
    if (line.length === 0) {
      previewLines.push('');
      continue;
    }

    // Break long lines to fit width (with 2-space indent)
    const maxLineWidth = actualWidth - 2;
    for (let i = 0; i < line.length; i += maxLineWidth) {
      previewLines.push(line.substring(i, i + maxLineWidth));
    }

    // Limit to first 10 lines
    if (previewLines.length >= 10) {
      break;
    }
  }

  // Take only first 10 lines
  const limitedLines = previewLines.slice(0, 10);

  // Create header
  const previewTitle = truncated
    ? `Preview (${maxChars}/${totalChars} chars)`
    : `Preview (${totalChars} chars)`;

  let result = '  ' + box.horizontal.repeat(3) + ' ' + previewTitle + ' ' + box.horizontal.repeat(actualWidth - previewTitle.length - 8) + '\n';

  // Add preview lines with indentation
  limitedLines.forEach(line => {
    result += '  ' + line + '\n';
  });

  // Add truncation notice if needed
  if (truncated) {
    const notice = `... [${remaining} more characters]`;
    result += '  ' + colors.muted(notice) + '\n';
  }

  // Add footer
  result += '  ' + box.horizontal.repeat(actualWidth - 2);

  return result;
}

/**
 * Format AI analysis results in a box
 * @param {string} title - AI-generated title
 * @param {string} description - AI-generated description
 * @param {string[]} tags - AI-generated tags
 * @param {number} width - Width of the box (auto-detects if not provided)
 * @returns {string}
 */
function formatAIResults(title, description, tags, width = null) {
  const actualWidth = width !== null ? width : getTerminalWidth();
  let result = '\n' + box.topLeft + box.horizontal + ' ' +
         colors.accent.bold('AI Analysis Results') + ' ' +
         horizontalLine(actualWidth - 24, box.horizontal) + box.topRight + '\n';

  // Title header
  const titleLabel = 'Title:';
  const titleColored = colors.info.bold(titleLabel);
  const titlePadding = actualWidth - titleLabel.length - 2;
  result += box.vertical + ' ' + titleColored + ' '.repeat(titlePadding) + box.vertical + '\n';

  // Word wrap title
  const titleWords = title.split(' ');
  let titleLine = '';
  const maxLineWidth = actualWidth - 6;

  titleWords.forEach(word => {
    if ((titleLine + word).length > maxLineWidth) {
      result += box.vertical + '   ' + titleLine.trim().padEnd(actualWidth - 6) + ' ' + box.vertical + '\n';
      titleLine = word + ' ';
    } else {
      titleLine += word + ' ';
    }
  });

  if (titleLine.trim().length > 0) {
    result += box.vertical + '   ' + titleLine.trim().padEnd(actualWidth - 6) + ' ' + box.vertical + '\n';
  }

  // Spacing
  result += box.vertical + ' '.repeat(actualWidth - 2) + box.vertical + '\n';

  // Description header
  const descLabel = 'Description:';
  const descColored = colors.info.bold(descLabel);
  const descPadding = actualWidth - descLabel.length - 2;
  result += box.vertical + ' ' + descColored + ' '.repeat(descPadding) + box.vertical + '\n';

  // Word wrap description
  const words = description.split(' ');
  let currentLine = '';

  words.forEach(word => {
    if ((currentLine + word).length > maxLineWidth) {
      result += box.vertical + '   ' + currentLine.trim().padEnd(actualWidth - 6) + ' ' + box.vertical + '\n';
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  });

  if (currentLine.trim().length > 0) {
    result += box.vertical + '   ' + currentLine.trim().padEnd(actualWidth - 6) + ' ' + box.vertical + '\n';
  }

  // Spacing
  result += box.vertical + ' '.repeat(actualWidth - 2) + box.vertical + '\n';

  // Tags
  const tagsLabel = 'Tags:';
  const tagsColored = colors.info.bold(tagsLabel);
  const tagsPadding = actualWidth - tagsLabel.length - 2;
  result += box.vertical + ' ' + tagsColored + ' '.repeat(tagsPadding) + box.vertical + '\n';

  const tagsText = '   ' + tags.map(t => colors.highlight(t)).join(', ');
  const plainTagsText = '   ' + tags.join(', ');

  // Handle long tag lists
  if (plainTagsText.length > actualWidth - 4) {
    // Word wrap tags
    let tagLine = '   ';
    tags.forEach((tag, i) => {
      const separator = i < tags.length - 1 ? ', ' : '';
      if ((tagLine + tag + separator).length > maxLineWidth) {
        result += box.vertical + ' ' + tagLine.padEnd(actualWidth - 4) + ' ' + box.vertical + '\n';
        tagLine = '   ' + tag + separator;
      } else {
        tagLine += tag + separator;
      }
    });
    result += box.vertical + ' ' + tagLine.padEnd(actualWidth - 4) + ' ' + box.vertical + '\n';
  } else {
    result += box.vertical + ' ' + tagsText + ' '.repeat(actualWidth - plainTagsText.length - 4) + box.vertical + '\n';
  }

  result += box.bottomLeft + horizontalLine(actualWidth - 2, box.horizontal) + box.bottomRight;

  return result;
}

/**
 * Create a spinner for long-running operations
 * @param {string} text - Spinner text
 * @returns {ora.Ora}
 */
function createSpinner(text) {
  return ora({
    text: text,
    color: 'cyan',
    spinner: 'dots'
  });
}

/**
 * Success message
 * @param {string} text - Message text
 * @returns {string}
 */
function success(text) {
  return colors.success('✓ ' + text);
}

/**
 * Info message
 * @param {string} text - Message text
 * @returns {string}
 */
function info(text) {
  return colors.info('ℹ ' + text);
}

/**
 * Warning message
 * @param {string} text - Message text
 * @returns {string}
 */
function warning(text) {
  return colors.warning('⚠ ' + text);
}

/**
 * Error message
 * @param {string} text - Message text
 * @returns {string}
 */
function error(text) {
  return colors.error('✖ ' + text);
}

module.exports = {
  colors,
  box,
  getTerminalWidth,
  horizontalLine,
  createBox,
  stepHeader,
  stepItem,
  stepFooter,
  formatTextPreview,
  formatAIResults,
  createSpinner,
  success,
  info,
  warning,
  error
};
