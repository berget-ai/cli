import * as http from 'node:http';
import { describe, expect, it, vi } from 'vitest';

vi.mock('openid-client', async () => ({
  authorizationCodeGrant: vi.fn(() =>
    Promise.resolve({
      access_token: 'mock-access-token',
      expires_in: 3600,
      refresh_token: 'mock-refresh-token',
    }),
  ),
  buildAuthorizationUrl: vi.fn((_config, params) => {
    const url = new URL('https://mock-idp/authorize');
    for (const [key, value] of Object.entries(params || {})) {
      url.searchParams.set(key, String(value));
    }
    return url;
  }),
  calculatePKCECodeChallenge: vi.fn(() => Promise.resolve('mock-challenge')),
  randomPKCECodeVerifier: vi.fn(() => 'mock-verifier'),
  ResponseBodyError: class ResponseBodyError extends Error {
    error: string;
    response: any;
    status: number;
    constructor(message: string, error: string, status: number, response: any) {
      super(message);
      this.error = error;
      this.status = status;
      this.response = response;
    }
  },
}));

vi.mock('open', () => ({
  default: vi.fn(),
}));

import open from 'open';

import { startPkceFlow } from '../../../src/auth/oauth/pkce-flow.js';

describe('PKCE Flow - Issue 1: Callback Server Binding', () => {
  it('should bind callback server to 127.0.0.1 and use 127.0.0.1 in redirect URI', async () => {
    let capturedAddress: undefined | { address: string; family: string; port: number };
    let capturedAuthUrl: string | undefined;

    const createServerSpy = vi.fn((...args: any[]) => {
      const server = http.createServer(...args);

      // Hook the 'listening' event to capture bind address before server is potentially closed
      const originalOn = server.on.bind(server);
      server.on = function (event: string, listener: any) {
        if (event === 'listening') {
          const wrapped = () => {
            const addr = server.address();
            if (addr && typeof addr === 'object') {
              capturedAddress = addr as { address: string; family: string; port: number };
            }
            listener();
          };
          return originalOn(event, wrapped);
        }
        return originalOn(event, listener);
      } as any;

      return server;
    });

    vi.mocked(open).mockImplementation(async (url: string) => {
      capturedAuthUrl = url;

      const authUrl = new URL(url);
      const state = authUrl.searchParams.get('state');
      const redirectUri = authUrl.searchParams.get('redirect_uri');

      expect(redirectUri).toBeTruthy();
      const redirectUrl = new URL(redirectUri!);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await new Promise<void>((resolve, reject) => {
        const req = http.get(
          `http://${redirectUrl.hostname}:${redirectUrl.port}/callback?code=test-auth-code&state=${state}`,
          (res) => {
            res.resume();
            resolve();
          },
        );
        req.on('error', reject);
      });

      return undefined as unknown as ReturnType<typeof open>;
    });

    const result = await startPkceFlow({
      config: {} as any,
      createServer: createServerSpy,
    });

    expect(capturedAddress).toBeDefined();
    expect(capturedAddress?.address).toBe('127.0.0.1');
    expect(capturedAddress?.family).toBe('IPv4');
    expect(capturedAuthUrl).toBeDefined();
    const authUrl = new URL(capturedAuthUrl!);
    const redirectUri = authUrl.searchParams.get('redirect_uri');
    expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);

    expect(result.success).toBe(true);
  });
});
