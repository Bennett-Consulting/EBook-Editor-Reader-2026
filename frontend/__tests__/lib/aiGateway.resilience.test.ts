import { detectProvider, getProviderConfig, pickBestModel } from '../../src/lib/aiGateway';

describe('AI Gateway Resilience', () => {
  describe('Provider Detection', () => {
    it('detects known providers from key prefixes', () => {
      expect(detectProvider('sk-abc123')).toBe('openai');
      expect(detectProvider('sk-ant-abc123')).toBe('anthropic');
      expect(detectProvider('AIzaSyA123')).toBe('google');
      expect(detectProvider('gsk_abc123')).toBe('groq');
      expect(detectProvider('bitnet-local')).toBe('bitnet');
    });

    it('returns custom for unknown prefixes', () => {
      expect(detectProvider('unknown')).toBe('custom');
      expect(detectProvider('')).toBe('custom');
    });
  });

  describe('Provider Config', () => {
    it('returns config for major providers', () => {
      const providers = ['openai', 'anthropic', 'google', 'groq', 'custom'];
      providers.forEach(provider => {
        const config = getProviderConfig(provider);
        expect(config).toBeDefined();
        expect(config.name).toBeTruthy();
      });
    });

    it('bitnet has empty baseUrl - BUG', () => {
      const config = getProviderConfig('bitnet');
      expect(config).toBeDefined();
      expect(config.name).toBe('BitNet (CPU)');
      // Local provider uses localhost
      expect(config.baseUrl).toBe('http://localhost:8080');
    });
  });

  describe('Model Routing', () => {
    const models = [
      { id: 'flash', name: 'Flash', provider: 'openai', tier: 'flash' },
      { id: 'standard', name: 'Standard', provider: 'openai', tier: 'standard' },
      { id: 'pro', name: 'Pro', provider: 'openai', tier: 'pro' },
      { id: 'flagship', name: 'Flagship', provider: 'openai', tier: 'flagship' },
    ];

    it('routes continue to standard', () => {
      expect(pickBestModel(models, 'continue')?.tier).toBe('standard');
    });

    it('routes improve to pro', () => {
      expect(pickBestModel(models, 'improve')?.tier).toBe('pro');
    });

    it('crashes on unknown task - BUG', () => {
      // KNOWN BUG: pickBestModel crashes when task not in tierPreference
      expect(() => pickBestModel(models, 'unknown' as any)).toThrow();
    });
  });

  describe('Security', () => {
    it('does not log keys in pure functions', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      detectProvider('sk-abc123');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
