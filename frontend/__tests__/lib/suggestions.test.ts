/**
 * Task 5 — AI Suggestion Engine tests.
 *
 * streamRequest is mocked. buildContext runs for real (pure, no side effects).
 * Covers: computeDiff correctness, all 6 modes shape, applySuggestion,
 *         rejectSuggestion, editSuggestion + diff regeneration.
 */

import {
  requestSuggestions,
  applySuggestion,
  rejectSuggestion,
  editSuggestion,
} from '../../src/lib/suggestions';
import type {
  SuggestionRequest,
  SuggestionSet,
  SuggestionMode,
} from '../../src/lib/suggestions';
import { computeDiff } from '../../src/lib/suggestions/presenter';

// ─── Mock streamRequest ───────────────────────────────────────────────────────

jest.mock('../../src/lib/ai/streaming', () => ({
  streamRequest: jest.fn(),
}));

import { streamRequest } from '../../src/lib/ai/streaming';
const mockStream = streamRequest as jest.Mock;

import type { StreamConfig, StreamCallbacks } from '../../src/lib/ai/streaming';

function setupStream(response: string): void {
  mockStream.mockImplementation(
    (
      _config: StreamConfig,
      callbacks: StreamCallbacks,
    ): Promise<void> => {
      callbacks.onChunk(response);
      callbacks.onDone(response);
      return Promise.resolve();
    },
  );
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const BASE_CONFIG: StreamConfig = {
  provider: 'openai',
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
  prompt: '',
};

function makeRequest(
  mode: SuggestionMode,
  originalText = 'The cat sat on the mat.',
): SuggestionRequest {
  return { originalText, mode, providerConfig: BASE_CONFIG };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── computeDiff ──────────────────────────────────────────────────────────────

describe('computeDiff', () => {
  test('equal strings return one equal chunk', () => {
    expect(computeDiff('abc', 'abc')).toEqual([{ type: 'equal', text: 'abc' }]);
  });

  test('empty strings return empty array', () => {
    expect(computeDiff('', '')).toEqual([]);
  });

  test('empty original is a pure insert', () => {
    expect(computeDiff('', 'hello')).toEqual([{ type: 'insert', text: 'hello' }]);
  });

  test('empty suggested is a pure delete', () => {
    expect(computeDiff('hello', '')).toEqual([{ type: 'delete', text: 'hello' }]);
  });

  test('single word replacement reconstructs both strings correctly', () => {
    // LCS finds shared chars between "sat" and "rested" — test reconstruction,
    // not exact chunks, since character-level LCS is legitimately ambiguous.
    const original = 'The cat sat';
    const suggested = 'The cat rested';
    const chunks = computeDiff(original, suggested);

    const reconstructedOriginal = chunks
      .filter((c) => c.type !== 'insert')
      .map((c) => c.text)
      .join('');
    const reconstructedSuggested = chunks
      .filter((c) => c.type !== 'delete')
      .map((c) => c.text)
      .join('');

    expect(reconstructedOriginal).toBe(original);
    expect(reconstructedSuggested).toBe(suggested);
    // The shared prefix "The cat " must appear as an equal chunk somewhere
    const equalText = chunks.filter((c) => c.type === 'equal').map((c) => c.text).join('');
    expect(equalText).toContain('The cat ');
  });

  test('char inserted in middle', () => {
    const chunks = computeDiff('abc', 'abXc');
    expect(chunks).toEqual([
      { type: 'equal', text: 'ab' },
      { type: 'insert', text: 'X' },
      { type: 'equal', text: 'c' },
    ]);
  });

  test('reconstructing original from diff', () => {
    const original = 'The fox jumped over the lazy dog.';
    const suggested = 'The quick fox leaped over the lazy dog.';
    const chunks = computeDiff(original, suggested);

    // Delete chunks come from original, insert chunks come from suggested
    const reconstructedOriginal = chunks
      .filter((c) => c.type !== 'insert')
      .map((c) => c.text)
      .join('');
    const reconstructedSuggested = chunks
      .filter((c) => c.type !== 'delete')
      .map((c) => c.text)
      .join('');

    expect(reconstructedOriginal).toBe(original);
    expect(reconstructedSuggested).toBe(suggested);
  });
});

// ─── requestSuggestions — shape tests ────────────────────────────────────────

describe('requestSuggestions — continue mode', () => {
  test('returns 1 suggestion with the continuation text', async () => {
    setupStream(' He licked his paw.');
    const set = await requestSuggestions(makeRequest('continue'));

    expect(set.status).toBe('ready');
    expect(set.mode).toBe('continue');
    expect(set.originalText).toBe('The cat sat on the mat.');
    expect(set.suggestions).toHaveLength(1);
    expect(set.suggestions[0].text).toBe(' He licked his paw.');
  });

  test('continue diff has equal prefix + insert suffix', async () => {
    setupStream(' More text.');
    const set = await requestSuggestions(makeRequest('continue', 'Start.'));

    const diff = set.suggestions[0].diff;
    expect(diff).toContainEqual({ type: 'equal', text: 'Start.' });
    expect(diff).toContainEqual({ type: 'insert', text: ' More text.' });
    expect(diff.find((c) => c.type === 'delete')).toBeUndefined();
  });
});

describe('requestSuggestions — improve mode', () => {
  test('returns exactly 1 suggestion', async () => {
    setupStream('The feline rested upon the woven mat.');
    const set = await requestSuggestions(makeRequest('improve'));

    expect(set.status).toBe('ready');
    expect(set.suggestions).toHaveLength(1);
    expect(set.suggestions[0].text).toBe('The feline rested upon the woven mat.');
  });

  test('diff contains at least one non-equal chunk', async () => {
    setupStream('The feline rested upon the woven mat.');
    const set = await requestSuggestions(makeRequest('improve'));

    const nonEqual = set.suggestions[0].diff.filter((c) => c.type !== 'equal');
    expect(nonEqual.length).toBeGreaterThan(0);
  });
});

describe('requestSuggestions — shorten mode', () => {
  test('returns exactly 1 suggestion', async () => {
    setupStream('Cat on mat.');
    const set = await requestSuggestions(makeRequest('shorten'));

    expect(set.status).toBe('ready');
    expect(set.suggestions).toHaveLength(1);
    expect(set.suggestions[0].text).toBe('Cat on mat.');
  });
});

describe('requestSuggestions — expand mode', () => {
  test('returns exactly 1 suggestion', async () => {
    setupStream('The old tabby cat settled comfortably on the faded mat.');
    const set = await requestSuggestions(makeRequest('expand'));

    expect(set.status).toBe('ready');
    expect(set.suggestions).toHaveLength(1);
  });
});

describe('requestSuggestions — grammar mode', () => {
  test('returns one suggestion per correction found', async () => {
    const original = 'teh cat satt on the mat.';
    setupStream('[{"original":"teh","correction":"the"},{"original":"satt","correction":"sat"}]');
    const set = await requestSuggestions(makeRequest('grammar', original));

    expect(set.status).toBe('ready');
    expect(set.suggestions).toHaveLength(2);
  });

  test('suggestion has correct offset into originalText', async () => {
    const original = 'teh cat sat on the mat.';
    setupStream('[{"original":"teh","correction":"the"}]');
    const set = await requestSuggestions(makeRequest('grammar', original));

    expect(set.suggestions[0].offset).toBe(0);
    expect(set.suggestions[0].length).toBe(3);
    expect(set.suggestions[0].text).toBe('the');
  });

  test('returns empty suggestions when AI finds no corrections', async () => {
    setupStream('[]');
    const set = await requestSuggestions(makeRequest('grammar'));

    expect(set.status).toBe('ready');
    expect(set.suggestions).toHaveLength(0);
  });

  test('handles AI response wrapped in markdown code fences', async () => {
    const original = 'She dont know.';
    setupStream('```json\n[{"original":"dont","correction":"doesn\'t"}]\n```');
    const set = await requestSuggestions(makeRequest('grammar', original));

    expect(set.suggestions).toHaveLength(1);
    expect(set.suggestions[0].text).toBe("doesn't");
  });

  test('grammar diff reconstructs both the original span and the correction', async () => {
    // LCS for "teh" → "the" finds shared chars 't','h' — test reconstruction,
    // not exact chunks, since character-level LCS is legitimately ambiguous.
    const original = 'teh cat.';
    setupStream('[{"original":"teh","correction":"the"}]');
    const set = await requestSuggestions(makeRequest('grammar', original));

    const diff = set.suggestions[0].diff;
    const reconstructedSpan = diff.filter((c) => c.type !== 'insert').map((c) => c.text).join('');
    const reconstructedCorrection = diff.filter((c) => c.type !== 'delete').map((c) => c.text).join('');

    expect(reconstructedSpan).toBe('teh');
    expect(reconstructedCorrection).toBe('the');
  });
});

describe('requestSuggestions — rephrase mode', () => {
  test('returns exactly 3 suggestions', async () => {
    setupStream('First version.\n---OPTION---\nSecond version.\n---OPTION---\nThird version.');
    const set = await requestSuggestions(makeRequest('rephrase'));

    expect(set.status).toBe('ready');
    expect(set.suggestions).toHaveLength(3);
  });

  test('each rephrase suggestion has a distinct text', async () => {
    setupStream('Version A.\n---OPTION---\nVersion B.\n---OPTION---\nVersion C.');
    const set = await requestSuggestions(makeRequest('rephrase'));

    const texts = set.suggestions.map((s) => s.text);
    expect(texts[0]).toBe('Version A.');
    expect(texts[1]).toBe('Version B.');
    expect(texts[2]).toBe('Version C.');
  });

  test('pads to 3 suggestions if AI returns fewer', async () => {
    setupStream('Only one version here.');
    const set = await requestSuggestions(makeRequest('rephrase'));

    expect(set.suggestions).toHaveLength(3);
  });
});

describe('requestSuggestions — error handling', () => {
  test('returns error set when streamRequest rejects', async () => {
    mockStream.mockRejectedValueOnce(new Error('Network timeout'));
    const set = await requestSuggestions(makeRequest('improve'));

    expect(set.status).toBe('error');
    expect(set.error).toContain('Network timeout');
    expect(set.suggestions).toHaveLength(0);
  });

  test('error set still has correct mode and originalText', async () => {
    mockStream.mockRejectedValueOnce(new Error('500'));
    const set = await requestSuggestions(makeRequest('grammar', 'some text'));

    expect(set.mode).toBe('grammar');
    expect(set.originalText).toBe('some text');
  });
});

// ─── applySuggestion ──────────────────────────────────────────────────────────

describe('applySuggestion', () => {
  function makeReadySet(
    mode: SuggestionMode,
    original: string,
    suggestionText: string,
    offset?: number,
    length?: number,
  ): SuggestionSet {
    return {
      id: 'set1',
      mode,
      originalText: original,
      suggestions: [
        {
          id: 'sg1',
          text: suggestionText,
          diff: [],
          offset,
          length,
        },
      ],
      status: 'ready',
      requestedAt: 0,
    };
  }

  test('continue: appends suggestion text to original', () => {
    const set = makeReadySet('continue', 'Hello', ' world.');
    const { newText } = applySuggestion(set, 'sg1');
    expect(newText).toBe('Hello world.');
  });

  test('improve: replaces original with suggestion text', () => {
    const set = makeReadySet('improve', 'Bad text.', 'Better text.');
    const { newText } = applySuggestion(set, 'sg1');
    expect(newText).toBe('Better text.');
  });

  test('shorten: replaces original with suggestion text', () => {
    const set = makeReadySet('shorten', 'Very long text here.', 'Short.');
    const { newText } = applySuggestion(set, 'sg1');
    expect(newText).toBe('Short.');
  });

  test('expand: replaces original with suggestion text', () => {
    const set = makeReadySet('expand', 'Brief.', 'Much more detailed text here.');
    const { newText } = applySuggestion(set, 'sg1');
    expect(newText).toBe('Much more detailed text here.');
  });

  test('rephrase: replaces original with suggestion text', () => {
    const set = makeReadySet('rephrase', 'Old phrasing.', 'New phrasing.');
    const { newText } = applySuggestion(set, 'sg1');
    expect(newText).toBe('New phrasing.');
  });

  test('grammar: splices correction at offset+length', () => {
    const set = makeReadySet('grammar', 'teh cat sat.', 'the', 0, 3);
    const { newText } = applySuggestion(set, 'sg1');
    expect(newText).toBe('the cat sat.');
  });

  test('grammar: splices mid-string correction correctly', () => {
    const set = makeReadySet('grammar', 'The cat satt.', 'sat', 8, 4);
    const { newText } = applySuggestion(set, 'sg1');
    expect(newText).toBe('The cat sat.');
  });

  test('applied suggestion is removed from updatedSet', () => {
    const set = makeReadySet('improve', 'Old.', 'New.');
    const { updatedSet } = applySuggestion(set, 'sg1');
    expect(updatedSet.suggestions).toHaveLength(0);
  });

  test('throws if suggestion id is not found', () => {
    const set = makeReadySet('improve', 'Old.', 'New.');
    expect(() => applySuggestion(set, 'nonexistent')).toThrow(/"nonexistent"/);
  });
});

// ─── rejectSuggestion ────────────────────────────────────────────────────────

describe('rejectSuggestion', () => {
  test('removes the rejected suggestion', () => {
    const set: SuggestionSet = {
      id: 'set1',
      mode: 'rephrase',
      originalText: 'Original.',
      suggestions: [
        { id: 'sg1', text: 'A', diff: [] },
        { id: 'sg2', text: 'B', diff: [] },
        { id: 'sg3', text: 'C', diff: [] },
      ],
      status: 'ready',
      requestedAt: 0,
    };

    const updated = rejectSuggestion(set, 'sg2');
    expect(updated.suggestions).toHaveLength(2);
    expect(updated.suggestions.map((s) => s.id)).toEqual(['sg1', 'sg3']);
  });

  test('returns unchanged set if id not found', () => {
    const set: SuggestionSet = {
      id: 'set1',
      mode: 'improve',
      originalText: 'Test.',
      suggestions: [{ id: 'sg1', text: 'Better.', diff: [] }],
      status: 'ready',
      requestedAt: 0,
    };

    const updated = rejectSuggestion(set, 'nonexistent');
    expect(updated.suggestions).toHaveLength(1);
  });

  test('originalText is not modified', () => {
    const set: SuggestionSet = {
      id: 'set1',
      mode: 'improve',
      originalText: 'Keep me.',
      suggestions: [{ id: 'sg1', text: 'Other.', diff: [] }],
      status: 'ready',
      requestedAt: 0,
    };

    const updated = rejectSuggestion(set, 'sg1');
    expect(updated.originalText).toBe('Keep me.');
  });
});

// ─── editSuggestion ───────────────────────────────────────────────────────────

describe('editSuggestion', () => {
  function makeSet(mode: SuggestionMode, original: string, text: string, offset?: number, length?: number): SuggestionSet {
    return {
      id: 'set1',
      mode,
      originalText: original,
      suggestions: [{ id: 'sg1', text, diff: [], offset, length }],
      status: 'ready',
      requestedAt: 0,
    };
  }

  test('updates suggestion text', () => {
    const set = makeSet('improve', 'Old text.', 'Better text.');
    const updated = editSuggestion(set, 'sg1', 'Best text ever.');
    expect(updated.suggestions[0].text).toBe('Best text ever.');
  });

  test('regenerates diff for improve mode', () => {
    const set = makeSet('improve', 'The cat sat.', 'The cat rested.');
    const updated = editSuggestion(set, 'sg1', 'The feline rested.');

    const diff = updated.suggestions[0].diff;
    // Diff should reflect the new text vs original, not the old suggestion
    const reconstructed = diff
      .filter((c) => c.type !== 'delete')
      .map((c) => c.text)
      .join('');
    expect(reconstructed).toBe('The feline rested.');
  });

  test('regenerates diff for continue mode — equal prefix + insert', () => {
    const original = 'Opening.';
    const set = makeSet('continue', original, ' Old continuation.');
    const updated = editSuggestion(set, 'sg1', ' New continuation.');

    const diff = updated.suggestions[0].diff;
    expect(diff).toContainEqual({ type: 'equal', text: 'Opening.' });
    expect(diff).toContainEqual({ type: 'insert', text: ' New continuation.' });
  });

  test('regenerates diff for grammar mode — span diff', () => {
    const original = 'teh cat.';
    const set = makeSet('grammar', original, 'the', 0, 3);
    const updated = editSuggestion(set, 'sg1', 'THE');

    const diff = updated.suggestions[0].diff;
    expect(diff).toContainEqual({ type: 'delete', text: 'teh' });
    expect(diff).toContainEqual({ type: 'insert', text: 'THE' });
  });

  test('does not mutate the original set', () => {
    const set = makeSet('shorten', 'Long text.', 'Short.');
    editSuggestion(set, 'sg1', 'Shorter.');
    expect(set.suggestions[0].text).toBe('Short.');
  });

  test('throws if suggestion id not found', () => {
    const set = makeSet('improve', 'Old.', 'New.');
    expect(() => editSuggestion(set, 'bad_id', 'x')).toThrow(/"bad_id"/);
  });
});
