import { paginate, getPageMetrics } from '../../src/lib/paginationEngine';

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
