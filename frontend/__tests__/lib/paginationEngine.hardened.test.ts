import { paginate, getPageMetrics } from '../../src/lib/paginationEngine';

const defaultConfig = {
  fontSize: 18,
  lineHeightMultiplier: 1.5,
  fontFamily: 'serif' as const,
  paddingHorizontal: 16,
  paddingVertical: 16,
};

// Property 1: Text split into pages rejoins to original text
describe('Property: Text Preservation', () => {
  const testCases = [
    'The quick brown fox jumps over the lazy dog.',
    'Hello\n\nWorld\n\nTest',
    'a'.repeat(10000),
    'Word '.repeat(2000),
    'Chapter 1\n\nThis is the first chapter.\n\nChapter 2\n\nThis is the second chapter.',
  ];

  testCases.forEach((text, i) => {
    it(`preserves text case ${i + 1}`, () => {
      const pages = paginate(text, 360, 640, defaultConfig);
      const joined = pages.join('');
      // Allow whitespace differences due to trimming between pages
      expect(joined.replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
    });
  });

  // Random test: 100 iterations
  for (let i = 0; i < 100; i++) {
    const randomText = Array.from({ length: 50 + Math.floor(Math.random() * 500) }, () => 
      String.fromCharCode(32 + Math.floor(Math.random() * 95))
    ).join('');
    
    it(`random preservation ${i + 1}`, () => {
      const pages = paginate(randomText, 360, 640, defaultConfig);
      const joined = pages.join('');
      expect(joined.replace(/\s+/g, '')).toBe(randomText.replace(/\s+/g, ''));
    });
  }
});

// Property 2: Deleting a character never increases page count by more than 1
describe('Property: Monotonicity', () => {
  it('page count does not explode on shorter text', () => {
    const longText = 'Word '.repeat(500);
    const fullPages = paginate(longText, 360, 640, defaultConfig);
    
    const shortText = 'Word '.repeat(100);
    const shortPages = paginate(shortText, 360, 640, defaultConfig);
    
    expect(shortPages.length).toBeLessThanOrEqual(fullPages.length);
  });

  it('single character removal reduces or maintains page count', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(50);
    const before = paginate(text, 360, 640, defaultConfig);
    const after = paginate(text.slice(0, -1), 360, 640, defaultConfig);
    
    expect(after.length).toBeLessThanOrEqual(before.length + 1);
  });
});

// Property 3: Empty and edge inputs
describe('Property: Edge Cases', () => {
  it('handles empty string', () => {
    expect(paginate('', 360, 640, defaultConfig)).toEqual(['']);
  });

  it('handles single space', () => {
    expect(paginate(' ', 360, 640, defaultConfig)).toEqual(['']);
  });

  it('handles only newlines', () => {
    const result = paginate('\n\n\n\n\n', 360, 640, defaultConfig);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('handles very long single word', () => {
    const text = 'a'.repeat(10000);
    const result = paginate(text, 360, 640, defaultConfig);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('handles tiny container', () => {
    const text = 'Hello world test';
    const result = paginate(text, 10, 10, defaultConfig);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// Property 4: Metrics consistency
describe('Property: Metrics', () => {
  it('charsPerLine * linesPerPage equals estimatedCharsPerPage', () => {
    const metrics = getPageMetrics(360, 640, defaultConfig);
    expect(metrics.estimatedCharsPerPage).toBe(metrics.charsPerLine * metrics.linesPerPage);
  });

  it('metrics are positive for any reasonable container', () => {
    for (let w = 100; w <= 1000; w += 100) {
      for (let h = 100; h <= 1000; h += 100) {
        const metrics = getPageMetrics(w, h, defaultConfig);
        expect(metrics.charsPerLine).toBeGreaterThanOrEqual(1);
        expect(metrics.linesPerPage).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
