import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TokenStore } from '../storage/token-store.js';

import { refreshAccessToken } from '../oauth/token-refresh.js';

let mockRefreshTokenGrantCalls: any[] = [];
let mockRefreshTokenGrantResult: any = null;
let mockRefreshTokenGrantError: Error | null = null;

vi.mock('openid-client', async () => {
  return {
    refreshTokenGrant: vi.fn(async (...args: any[]) => {
      mockRefreshTokenGrantCalls.push(args);
      if (mockRefreshTokenGrantError) throw mockRefreshTokenGrantError;
      return mockRefreshTokenGrantResult;
    }),
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

  it('clears tokens on invalid_grant error from Keycloak', async () => {
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
