import createClient from 'openapi-fetch';
import { describe, expect, it, vi } from 'vitest';

import type { paths } from '../../../types/api.js';

import { authMiddleware } from '../../middleware/auth-middleware.js';

describe('authMiddleware', () => {
  it('injects Bearer token on request', async () => {
    const middleware = authMiddleware({
      getToken: async () => 'my-token',
    });

    const req = { headers: new Headers() } as any;
    const result = await middleware.onRequest!(req, {} as any);

    expect(result).toBeDefined();
    expect(result!.headers.get('Authorization')).toBe('Bearer my-token');
  });

  it('does not overwrite existing Authorization header', async () => {
    const middleware = authMiddleware({
      getToken: async () => 'my-token',
    });

    const req = { headers: new Headers({ Authorization: 'Bearer existing' }) } as any;
    const result = await middleware.onRequest!(req, {} as any);

    expect(result!.headers.get('Authorization')).toBe('Bearer existing');
  });

  it('skips injection when no token is available', async () => {
    const middleware = authMiddleware({
      getToken: async () => null,
    });

    const req = { headers: new Headers() } as any;
    const result = await middleware.onRequest!(req, {} as any);

    expect(result!.headers.get('Authorization')).toBeNull();
  });

  it('returns undefined on non-401 responses (no modification)', async () => {
    const middleware = authMiddleware({
      getToken: async () => 'my-token',
      refresh: async () => true,
    });

    const response = new Response('OK', { status: 200 });
    const req = { headers: new Headers() } as any;

    const result = await middleware.onResponse!(response, {} as any, req);
    expect(result).toBeUndefined();
  });

  it('retries with new token on 401 when refresh succeeds', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const getToken = vi.fn().mockResolvedValueOnce('old-token').mockResolvedValueOnce('new-token');

    const middleware = authMiddleware({
      getToken,
      refresh: async () => true,
    });

    const response401 = new Response('Unauthorized', { status: 401 });
    const req = { headers: new Headers() } as any;

    const retryResponse = new Response('OK', { status: 200 });
    mockFetch.mockResolvedValueOnce(retryResponse);

    const result = await middleware.onResponse!(response401, {} as any, req);

    expect(result).toBeInstanceOf(Response);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // The fetch request should have the Authorization header updated
    expect((mockFetch.mock.calls[0] as any[])[0].headers.has('Authorization')).toBe(true);
  });

  it('returns undefined on 401 when refresh fails', async () => {
    const middleware = authMiddleware({
      getToken: async () => 'old-token',
      refresh: async () => false,
    });

    const response401 = new Response('Unauthorized', { status: 401 });
    const req = { headers: new Headers() } as any;

    const result = await middleware.onResponse!(response401, {} as any, req);
    expect(result).toBeUndefined();
  });
});

describe('authMiddleware with openapi-fetch', () => {
  it('empirically verifies 401 → refresh → retry returns successful data', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const client = createClient<paths>({ baseUrl: 'https://api.berget.ai' });

    let token = 'expired-token';
    client.use(
      authMiddleware({
        getToken: async () => token,
        refresh: async () => {
          token = 'new-token';
          return true;
        },
      }),
    );

    // First call returns 401, second call (retry) returns 200
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ email: 'test@example.com', id: 'user-123' }), {
          status: 200,
        }),
      );

    const result = await client.GET('/v1/users/me');

    expect(result.data).toEqual({ email: 'test@example.com', id: 'user-123' });
    expect(result.response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws on network errors instead of wrapping them', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const client = createClient<paths>({ baseUrl: 'https://api.berget.ai' });

    client.use(
      authMiddleware({
        getToken: async () => 'my-token',
      }),
    );

    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed: ENOTFOUND'));

    await expect(client.GET('/v1/users/me')).rejects.toThrow('fetch failed: ENOTFOUND');
  });
});
