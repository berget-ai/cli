import { describe, expect, it, vi } from 'vitest';

import type { TokenStore } from '../../storage/token-store.js';

import { resolveAuth } from '../../credentials/resolver.js';

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = base64urlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64urlEncode(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

const farFuture = Date.now() + 365 * 24 * 60 * 60 * 1000;

function createFakeStore(
  data: null | { access_token: string; expires_at: number; refresh_token: string },
): TokenStore {
  let _data = data;
  return {
    clear: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(_data),
    set: vi.fn(async (d) => {
      _data = d;
    }),
  };
}

describe('resolveAuth', () => {
  it('returns api_key when explicit key provided', async () => {
    const result = await resolveAuth({ apiKey: 'my-key' });
    expect(result).not.toBeNull();
    expect(result!.method).toBe('api_key');
    expect(result!.token).toBe('my-key');
  });

  it('returns api_key when BERGET_API_KEY env var set', async () => {
    vi.stubEnv('BERGET_API_KEY', 'env-key');
    const result = await resolveAuth();
    expect(result).not.toBeNull();
    expect(result!.method).toBe('api_key');
    expect(result!.token).toBe('env-key');
    vi.unstubAllEnvs();
  });

  it('returns oauth state with refresh function when valid token exists', async () => {
    const jwt = makeJwt({ exp: Math.floor(farFuture / 1000) });
    const store = createFakeStore({
      access_token: jwt,
      expires_at: farFuture,
      refresh_token: 'ref',
    });

    const result = await resolveAuth({ tokenStore: store });
    expect(result).not.toBeNull();
    expect(result!.method).toBe('oauth');
    expect(result!.token).toBe(jwt);
    expect(typeof result!.refresh).toBe('function');
  });

  it('returns oauth state with refresh available but not eagerly called', async () => {
    // Silent OAuth token reuse — matches setup-flow.test.ts shortcut path
    const jwt = makeJwt({ exp: Math.floor(farFuture / 1000) });
    const store = createFakeStore({
      access_token: jwt,
      expires_at: farFuture,
      refresh_token: 'ref',
    });

    const result = await resolveAuth({ tokenStore: store });

    expect(result).not.toBeNull();
    expect(result!.method).toBe('oauth');
    expect(result!.refresh).toBeDefined();
    // refresh should not have been called yet
    expect(store.get).toHaveBeenCalledTimes(1);
    expect(store.set).not.toHaveBeenCalled();
  });

  it('returns null when nothing available', async () => {
    vi.unstubAllEnvs();
    const store = createFakeStore(null);
    const result = await resolveAuth({ tokenStore: store });
    expect(result).toBeNull();
  });
});
