import { describe, expect, it, vi } from 'vitest';

import { resolveApiKey } from '../../credentials/api-key.js';

vi.mock('../../../utils/default-api-key.js', () => ({
  DefaultApiKeyManager: {
    getInstance: vi.fn(() => ({
      getDefaultApiKeyData: vi.fn(() => null),
    })),
  },
}));

describe('resolveApiKey', () => {
  it('returns explicit apiKey option', async () => {
    const result = await resolveApiKey({ apiKey: 'explicit-key' });
    expect(result).toBe('explicit-key');
  });

  it('returns BERGET_API_KEY env var', async () => {
    vi.stubEnv('BERGET_API_KEY', 'env-key');
    const result = await resolveApiKey();
    expect(result).toBe('env-key');
    vi.unstubAllEnvs();
  });

  it('returns null when nothing available', async () => {
    vi.unstubAllEnvs();
    const result = await resolveApiKey();
    expect(result).toBeNull();
  });

  it('prioritizes explicit option over env var', async () => {
    vi.stubEnv('BERGET_API_KEY', 'env-key');
    const result = await resolveApiKey({ apiKey: 'explicit' });
    expect(result).toBe('explicit');
    vi.unstubAllEnvs();
  });

  it('falls back to default API key manager', async () => {
    const { DefaultApiKeyManager } = await import('../../../utils/default-api-key.js');
    (DefaultApiKeyManager.getInstance as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      getDefaultApiKeyData: vi.fn(() => ({
        id: '1',
        key: 'default-key',
        name: 'test',
        prefix: 'test',
      })),
    });

    const result = await resolveApiKey();
    expect(result).toBe('default-key');
  });
});
