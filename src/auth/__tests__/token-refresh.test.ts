import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TokenStore } from '../storage/token-store.js';

import { refreshAccessToken } from '../oauth/token-refresh.js';

let mockRefreshTokenGrantCalls: any[] = [];
let mockRefreshTokenGrantResult: any = null;
let mockRefreshTokenGrantError: Error | null = null;

vi.mock('openid-client', async () => {
  const ResponseBodyErrorClass = class extends Error {
    cause: Record<string, unknown>;
    code: string;
    error: string;
    status: number;
    constructor(message: string, options: { cause: Record<string, unknown>; response: Response }) {
      super(message);
      this.cause = options.cause;
      this.code = 'OAUTH_RESPONSE_BODY';
      this.error = options.cause.error as string;
      this.status = options.response.status;
    }
  };
  return {
    refreshTokenGrant: vi.fn(async (...args: any[]) => {
      mockRefreshTokenGrantCalls.push(args);
      if (mockRefreshTokenGrantError) throw mockRefreshTokenGrantError;
      return mockRefreshTokenGrantResult;
    }),
    ResponseBodyError: ResponseBodyErrorClass,
  };
});

describe('refreshAccessToken', () => {
  beforeEach(() => {
    mockRefreshTokenGrantCalls = [];
    mockRefreshTokenGrantResult = null;
    mockRefreshTokenGrantError = null;
  });

  const createMockStore = (
    overrides: Partial<{
      _data: null | { access_token: string; expires_at: number; refresh_token: string };
    }> = {},
  ): TokenStore => {
    const defaultData = { access_token: 'old', expires_at: 1, refresh_token: 'refresh-token' };
    const data = '_data' in overrides ? overrides._data : defaultData;
    return {
      clear: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(data),
      set: vi.fn().mockResolvedValue(undefined),
    };
  };

  const createMockConfig = (): any => ({});

  it('returns false when no refresh token is available', async () => {
    const store = createMockStore({ _data: null });
    const result = await refreshAccessToken(createMockConfig(), store);
    expect(result).toBe(false);
    expect(mockRefreshTokenGrantCalls).toHaveLength(0);
  });

  it('delegates to openid-client refreshTokenGrant and stores result', async () => {
    const store = createMockStore();
    const mockConfig = createMockConfig();

    mockRefreshTokenGrantResult = {
      access_token: 'new-access',
      expires_in: 3600,
      refresh_token: 'new-refresh',
    };

    const result = await refreshAccessToken(mockConfig, store);

    expect(result).toBe(true);
    expect(mockRefreshTokenGrantCalls).toHaveLength(1);
    expect(store.set).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
      }),
    );
  });

  it('deduplicates in-flight refreshes', async () => {
    const store = createMockStore();
    const mockConfig = createMockConfig();

    // Make the mock hang until we resolve it
    let resolveRef: (value: any) => void;
    const promise = new Promise((resolve) => {
      resolveRef = resolve;
    });
    mockRefreshTokenGrantResult = promise;

    // Start two concurrent refreshes
    const p1 = refreshAccessToken(mockConfig, store);
    const p2 = refreshAccessToken(mockConfig, store);

    // Resolve the underlying promise
    resolveRef!({
      access_token: 'new-access',
      expires_in: 3600,
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(mockRefreshTokenGrantCalls).toHaveLength(1); // Only one actual call
  });

  it('does not deduplicate across different stores', async () => {
    // Two different configs/stores should not share the same in-flight promise.
    // This guards against writing tokens from store A into store B.
    const storeA = createMockStore({
      _data: { access_token: 'old-a', expires_at: 1, refresh_token: 'refresh-a' },
    });
    const storeB = createMockStore({
      _data: { access_token: 'old-b', expires_at: 1, refresh_token: 'refresh-b' },
    });
    const configA = { issuer: 'https://keycloak.berget.ai' } as any;
    const configB = { issuer: 'https://keycloak.stage.berget.ai' } as any;

    mockRefreshTokenGrantResult = {
      access_token: 'new-token',
      expires_in: 3600,
    };

    const [rA, rB] = await Promise.all([
      refreshAccessToken(configA, storeA),
      refreshAccessToken(configB, storeB),
    ]);

    expect(rA).toBe(true);
    expect(rB).toBe(true);
    // Two separate network calls because configs/stores are different
    expect(mockRefreshTokenGrantCalls).toHaveLength(2);
  });

  it('clears tokens on ResponseBodyError with invalid_grant', async () => {
    const store = createMockStore();
    const mockConfig = createMockConfig();

    const { ResponseBodyError } = await import('openid-client');
    mockRefreshTokenGrantError = new ResponseBodyError('invalid_grant', {
      cause: { error: 'invalid_grant', error_description: 'Token is expired' },
      response: new Response(null, { status: 400 }),
    });

    const result = await refreshAccessToken(mockConfig, store);

    expect(result).toBe(false);
    expect(store.clear).toHaveBeenCalled();
  });

  it('clears tokens on ResponseBodyError with 401 status', async () => {
    const store = createMockStore();
    const mockConfig = createMockConfig();

    const { ResponseBodyError } = await import('openid-client');
    mockRefreshTokenGrantError = new ResponseBodyError('Unauthorized', {
      cause: { error: 'invalid_token' },
      response: new Response(null, { status: 401 }),
    });

    const result = await refreshAccessToken(mockConfig, store);

    expect(result).toBe(false);
    expect(store.clear).toHaveBeenCalled();
  });

  it('does not clear tokens on other ResponseBodyError', async () => {
    const store = createMockStore();
    const mockConfig = createMockConfig();

    const { ResponseBodyError } = await import('openid-client');
    mockRefreshTokenGrantError = new ResponseBodyError('Server Error', {
      cause: { error: 'server_error' },
      response: new Response(null, { status: 500 }),
    });

    const result = await refreshAccessToken(mockConfig, store);

    expect(result).toBe(false);
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('clears tokens on plain Error fallback (backward compat)', async () => {
    const store = createMockStore();
    const mockConfig = createMockConfig();

    mockRefreshTokenGrantError = new Error('invalid_grant');

    const result = await refreshAccessToken(mockConfig, store);

    expect(result).toBe(false);
    expect(store.clear).toHaveBeenCalled();
  });

  it('falls back to using old refresh token if rotation is not provided', async () => {
    const store = createMockStore();
    const mockConfig = createMockConfig();

    mockRefreshTokenGrantResult = {
      access_token: 'new-access',
      expires_in: 3600,
      // no refresh_token in response
    };

    await refreshAccessToken(mockConfig, store);

    expect(store.set).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: 'new-access',
        refresh_token: 'refresh-token', // old one preserved
      }),
    );
  });
});
