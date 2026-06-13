import { paginate, getPageMetrics, clampPageIndex } from '../../src/lib/paginationEngine';

describe('paginate', () => {
  const defaultConfig = {
    fontSize: 18,
    lineHeightMultiplier: 1.5,
    fontFamily: 'serif' as const,
    paddingHorizontal: 16,
    paddingVertical: 16,
  };

  it('returns empty string for empty input', () => {
    const result = paginate('', 360, 640, defaultConfig);
    expect(result).toEqual(['']);
  });

  it('returns single page for short text', () => {
    const text = 'Hello world';
    const result = paginate(text, 360, 640, defaultConfig);
    expect(result).toEqual([text]);
  });

  it('splits long text into multiple pages', () => {
    const text = 'A'.repeat(5000);
    const result = paginate(text, 360, 640, defaultConfig);
    expect(result.length).toBeGreaterThan(1);
  });

  it('splits a 100,000-char string into multiple pages', () => {
    const word = 'Lorem ipsum dolor sit amet ';
    let text = '';
    while (text.length < 100_000) text += word;
    text = text.slice(0, 100_000);
    const result = paginate(text, 390, 700);
    expect(result.length).toBeGreaterThan(1);
    // All words preserved across pages
    const joinedWords = result.join(' ').split(/\s+/).filter(Boolean);
    const originalWords = text.split(/\s+/).filter(Boolean);
    expect(joinedWords).toEqual(originalWords);
  });

  it('preserves original text approximately', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    const result = paginate(text, 360, 640, defaultConfig);
    const joined = result.join('');
    expect(joined.replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
  });

  it('handles text with many newlines', () => {
    const text = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const result = paginate(text, 360, 640, defaultConfig);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe('getPageMetrics', () => {
  it('calculates metrics for standard screen', () => {
    const metrics = getPageMetrics(360, 640);
    expect(metrics.charsPerLine).toBeGreaterThan(0);
    expect(metrics.linesPerPage).toBeGreaterThan(0);
    expect(metrics.estimatedCharsPerPage).toBe(metrics.charsPerLine * metrics.linesPerPage);
  });

  it('handles small screens', () => {
    const metrics = getPageMetrics(200, 300);
    expect(metrics.charsPerLine).toBeGreaterThanOrEqual(1);
    expect(metrics.linesPerPage).toBeGreaterThanOrEqual(1);
  });
});

// ─── clampPageIndex (page index save/restore) ─────────────────────────────────

describe('clampPageIndex', () => {
  it('returns the saved index when in valid range', () => {
    expect(clampPageIndex(3, 10)).toBe(3);
    expect(clampPageIndex(0, 5)).toBe(0);
    expect(clampPageIndex(4, 5)).toBe(4);
  });

  it('clamps to last page when index exceeds total', () => {
    expect(clampPageIndex(15, 10)).toBe(9);
    expect(clampPageIndex(100, 3)).toBe(2);
  });

  it('returns 0 for negative index', () => {
    expect(clampPageIndex(-1, 10)).toBe(0);
    expect(clampPageIndex(-100, 5)).toBe(0);
  });

  it('returns 0 for NaN', () => {
    expect(clampPageIndex(NaN, 10)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(clampPageIndex(Infinity, 10)).toBe(0);
  });

  it('floors non-integer indices', () => {
    expect(clampPageIndex(2.9, 10)).toBe(2);
    expect(clampPageIndex(0.5, 10)).toBe(0);
  });

  it('restored index is always a valid page subscript', () => {
    const word = 'Lorem ipsum dolor sit amet ';
    let text = '';
    while (text.length < 100_000) text += word;
    text = text.slice(0, 100_000);
    const pages = paginate(text, 390, 700);
    const savedIndex = pages.length - 1;
    const restored = clampPageIndex(savedIndex, pages.length);
    expect(restored).toBe(savedIndex);
    expect(restored).toBeGreaterThanOrEqual(0);
    expect(restored).toBeLessThan(pages.length);
  });
});
