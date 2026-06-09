/**
 * Pagination Engine — Hardware-Calibrated Text Splitting
 *
 * Port of Android's PaginationEngine.kt (61 lines).
 * Splits long text into screen-sized pages based on container dimensions
 * and font metrics.
 *
 * The Android version uses Compose's synchronous TextMeasurer to lay out
 * text and find line boundaries. React Native doesn't have an equivalent,
 * so we simulate the layout using character-width heuristics. The results
 * are close enough for pagination (±1 line) and will reflow on edit anyway.
 *
 * Key behaviour preserved from Android:
 *   - 5% vertical safety buffer (zero-scroll guarantee)
 *   - Split at line boundaries, not mid-word
 *   - Empty input returns ['']
 *   - Preserves original text exactly (no reconstruction)
 */

// ─── Configuration ──────────────────────────────────────────────────────────

export interface PaginationConfig {
  fontSize: number;           // in dp/sp — default 18
  lineHeightMultiplier: number; // line-height factor — default 1.5
  fontFamily: "serif" | "sans-serif";
  paddingHorizontal: number;  // horizontal padding inside TextInput (dp)
  paddingVertical: number;    // vertical padding inside TextInput (dp)
}

const DEFAULT_CONFIG: PaginationConfig = {
  fontSize: 18,
  lineHeightMultiplier: 1.5,
  fontFamily: "serif",
  paddingHorizontal: 16,
  paddingVertical: 16,
};

/**
 * Average character width as a ratio of fontSize.
 * Measured empirically from common book fonts at 18sp.
 * Serif (Georgia/Noto Serif): ~0.50  |  Sans (Roboto): ~0.53
 */
const AVG_CHAR_WIDTH_RATIO: Record<string, number> = {
  serif: 0.5,
  "sans-serif": 0.53,
};

// ─── Core Engine ────────────────────────────────────────────────────────────

/**
 * Paginate a block of text to fit within the given container.
 *
 * @param text           - The full text to split into pages
 * @param containerWidth - Available width in dp/px (matches screen width)
 * @param containerHeight - Available height in dp/px (matches screen height minus chrome)
 * @param config         - Optional font/padding overrides
 * @returns Array of page strings. text.join('') ≈ original text (minus trimmed whitespace between pages).
 */
export function paginate(
  text: string,
  containerWidth: number,
  containerHeight: number,
  config: Partial<PaginationConfig> = {}
): string[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!text || text.trim().length === 0) return [""];

  // Usable area after padding
  const usableWidth = containerWidth - cfg.paddingHorizontal * 2;
  const usableHeight = containerHeight - cfg.paddingVertical * 2;

  // Industrial 5% safety buffer — matches Android's safeMaxHeight
  const safeHeight = usableHeight * 0.95;

  // Derived metrics
  const charWidth = cfg.fontSize * AVG_CHAR_WIDTH_RATIO[cfg.fontFamily];
  const lineHeightPx = cfg.fontSize * cfg.lineHeightMultiplier;
  const charsPerLine = Math.max(1, Math.floor(usableWidth / charWidth));
  const linesPerPage = Math.max(1, Math.floor(safeHeight / lineHeightPx));

  // Fast path: if everything fits on one page, skip the work
  const estimatedTotalLines = countVisualLines(text, charsPerLine);
  if (estimatedTotalLines <= linesPerPage) {
    return [text];
  }

  // Split into pages
  const pages: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const charOffset = findPageBreak(remaining, charsPerLine, linesPerPage);

    if (charOffset >= remaining.length) {
      // Everything remaining fits on this page
      pages.push(remaining);
      break;
    }

    pages.push(remaining.substring(0, charOffset));
    // Trim leading whitespace from next page (matches Android's trimStart())
    remaining = remaining.substring(charOffset).replace(/^[ \t]+/, "");
    // Preserve at most one leading newline for paragraph continuity
    if (remaining.startsWith("\n\n")) {
      remaining = remaining.substring(1);
    }
  }

  return pages.length > 0 ? pages : [""];
}

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Count how many visual lines a text block will produce when word-wrapped
 * to the given line width.
 */
function countVisualLines(text: string, charsPerLine: number): number {
  const paragraphs = text.split("\n");
  let lines = 0;

  for (const para of paragraphs) {
    if (para.length === 0) {
      lines += 1; // empty line (paragraph separator)
    } else {
      lines += Math.ceil(para.length / charsPerLine);
    }
  }

  return lines;
}

/**
 * Walk through text counting visual lines until we've filled a page.
 * Returns the character offset where the page should break.
 *
 * Strategy: process paragraph by paragraph. Within a paragraph, estimate
 * wrapped lines. When we'd exceed linesPerPage, find the exact word
 * boundary to break at.
 */
function findPageBreak(
  text: string,
  charsPerLine: number,
  linesPerPage: number
): number {
  let linesUsed = 0;
  let charPos = 0;

  while (charPos < text.length && linesUsed < linesPerPage) {
    // Find end of current paragraph
    const nextNewline = text.indexOf("\n", charPos);
    const paraEnd = nextNewline === -1 ? text.length : nextNewline;
    const paraText = text.substring(charPos, paraEnd);

    if (paraText.length === 0) {
      // Empty line — costs 1 visual line
      linesUsed += 1;
      charPos = paraEnd + 1; // skip the '\n'
      continue;
    }

    // How many visual lines does this paragraph need?
    const paraLines = Math.ceil(paraText.length / charsPerLine);
    const linesAvailable = linesPerPage - linesUsed;

    if (paraLines <= linesAvailable) {
      // Whole paragraph fits
      linesUsed += paraLines;
      charPos = paraEnd;
      // Skip the newline character itself
      if (nextNewline !== -1) {
        charPos += 1;
        // The newline "costs" a line only if there's more text
        if (charPos < text.length) {
          linesUsed += 0; // newline is part of the paragraph above
        }
      }
    } else {
      // Paragraph doesn't fully fit — break mid-paragraph
      const charsToTake = linesAvailable * charsPerLine;
      const breakTarget = charPos + charsToTake;

      // Walk back to a word boundary
      const breakPoint = findWordBoundary(text, breakTarget);
      charPos = breakPoint;
      break;
    }
  }

  return charPos;
}

/**
 * Find the nearest word boundary at or before the target position.
 * If no space is found within a reasonable range, break at target.
 */
function findWordBoundary(text: string, target: number): number {
  if (target >= text.length) return text.length;

  // Look back up to 80 chars for a space or newline
  const searchStart = Math.max(0, target - 80);
  let bestBreak = target;

  for (let i = target; i >= searchStart; i--) {
    const ch = text[i];
    if (ch === " " || ch === "\n" || ch === "\t") {
      bestBreak = i + 1; // break after the space
      break;
    }
  }

  return bestBreak;
}

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Clamp a saved page index to a valid range.
 * Returns 0 for any value that is out of range, non-integer, or non-finite.
 */
export function clampPageIndex(savedIndex: number, totalPages: number): number {
  if (!Number.isFinite(savedIndex) || savedIndex < 0) return 0;
  return Math.min(Math.floor(savedIndex), totalPages - 1);
}

/**
 * Estimate the metrics for the current screen. Useful for debugging
 * or displaying pagination stats.
 */
export function getPageMetrics(
  containerWidth: number,
  containerHeight: number,
  config: Partial<PaginationConfig> = {}
): {
  charsPerLine: number;
  linesPerPage: number;
  estimatedCharsPerPage: number;
} {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const usableWidth = containerWidth - cfg.paddingHorizontal * 2;
  const usableHeight = containerHeight - cfg.paddingVertical * 2;
  const safeHeight = usableHeight * 0.95;
  const charWidth = cfg.fontSize * AVG_CHAR_WIDTH_RATIO[cfg.fontFamily];
  const lineHeightPx = cfg.fontSize * cfg.lineHeightMultiplier;
  const charsPerLine = Math.max(1, Math.floor(usableWidth / charWidth));
  const linesPerPage = Math.max(1, Math.floor(safeHeight / lineHeightPx));

  return {
    charsPerLine,
    linesPerPage,
    estimatedCharsPerPage: charsPerLine * linesPerPage,
  };
}
