import { detectProvider, maskKey, getProviderConfig, pickBestModel } from '../../src/lib/aiGateway';
import { AIModel } from '../../src/lib/types';

describe('detectProvider', () => {
  it('detects OpenAI keys', () => {
    expect(detectProvider('sk-abc123')).toBe('openai');
  });

  it('detects Anthropic keys', () => {
    expect(detectProvider('sk-ant-abc123')).toBe('anthropic');
  });

  it('detects Google keys', () => {
    expect(detectProvider('AIzaSyA123')).toBe('google');
  });

  it('detects Groq keys', () => {
    expect(detectProvider('gsk_abc123')).toBe('groq');
  });

  it('detects BitNet local', () => {
    expect(detectProvider('bitnet-local')).toBe('bitnet');
  });

  it('returns custom for unknown', () => {
    expect(detectProvider('unknown')).toBe('custom');
  });
});

describe('maskKey', () => {
  it('masks long keys', () => {
    expect(maskKey('sk-abcdefghijklmnopqrstuvwxyz')).toBe('sk-abc...wxyz');
  });

  it('returns bullets for short keys', () => {
    expect(maskKey('short').length).toBe(8);
  });
});

describe('pickBestModel', () => {
  const models: AIModel[] = [
    { id: 'flash', name: 'Flash', provider: 'openai', tier: 'flash' },
    { id: 'standard', name: 'Standard', provider: 'openai', tier: 'standard' },
    { id: 'pro', name: 'Pro', provider: 'openai', tier: 'pro' },
  ];

  it('picks pro for improve', () => {
    expect(pickBestModel(models, 'improve')?.id).toBe('pro');
  });

  it('picks standard for continue', () => {
    expect(pickBestModel(models, 'continue')?.id).toBe('standard');
  });

  it('returns null for empty', () => {
    expect(pickBestModel([], 'continue')).toBeNull();
  });
});
