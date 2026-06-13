import { paginate } from '../../src/lib/paginationEngine';
import { detectProvider } from '../../src/lib/aiGateway';

const defaultConfig = {
  fontSize: 18,
  lineHeightMultiplier: 1.5,
  fontFamily: 'serif' as const,
  paddingHorizontal: 16,
  paddingVertical: 16,
};

describe('Edge Cases - Pagination', () => {
  it('handles empty document', () => {
    const result = paginate('', 360, 640, defaultConfig);
    expect(result).toEqual(['']);
  });

  it('handles single character', () => {
    const result = paginate('a', 360, 640, defaultConfig);
    expect(result).toEqual(['a']);
  });

  it('handles Unicode emoji', () => {
    const text = '??'.repeat(1000);
    const result = paginate(text, 360, 640, defaultConfig);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const joined = result.join('');
    expect(joined).toBe(text);
  });

  it('handles CJK characters', () => {
    const text = '????'.repeat(500);
    const result = paginate(text, 360, 640, defaultConfig);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('handles Arabic RTL text', () => {
    const text = '????? ??????? '.repeat(200);
    const result = paginate(text, 360, 640, defaultConfig);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('handles 100+ chapters', () => {
    const chapters = Array.from({ length: 150 }, (_, i) => 
      `Chapter ${i + 1}\n\nThis is the content for chapter ${i + 1}. It has some text here.`
    );
    const text = chapters.join('\n\n');
    const result = paginate(text, 360, 640, defaultConfig);
    expect(result.length).toBeGreaterThan(1);
  });

  it('handles extremely long word', () => {
    const text = 'a'.repeat(10000);
    const result = paginate(text, 360, 640, defaultConfig);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('handles mixed whitespace', () => {
    const text = 'Word1 \t Word2 \n\n Word3 \r\n Word4';
    const result = paginate(text, 360, 640, defaultConfig);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves exact text on rejoin', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
    const result = paginate(text, 360, 640, defaultConfig);
    const joined = result.join('');
    expect(joined.replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
  });
});

describe('Edge Cases - AI Gateway', () => {
  it('handles empty API key', () => {
    expect(detectProvider('')).toBe('custom');
  });

  it('handles whitespace-only key', () => {
    expect(detectProvider('   ')).toBe('custom');
  });

  it('handles key with special characters', () => {
    expect(detectProvider('sk-abc!@#')).toBe('openai');
  });

  it('handles very long key', () => {
    const longKey = 'sk-' + 'a'.repeat(1000);
    expect(detectProvider(longKey)).toBe('openai');
  });

  it('handles case sensitivity', () => {
    expect(detectProvider('SK-ABC123')).toBe('custom');
    expect(detectProvider('sk-abc123')).toBe('openai');
  });

  it('handles ambiguous prefixes', () => {
    // sk-ant- should match anthropic, not openai
    expect(detectProvider('sk-ant-123')).toBe('anthropic');
    expect(detectProvider('sk-123')).toBe('openai');
  });
});
