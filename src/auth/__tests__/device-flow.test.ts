import type { RequestInfo } from 'undici-types';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AuthConfig } from '../types.js';

import {
  extractTokenResult,
  handlePollError,
  renderTerminalQrCode,
  startDeviceFlow,
} from '../oauth/device-flow.js';

const CONFIG: AuthConfig = {
  apiBaseUrl: 'https://api.berget.ai',
  clientId: 'berget-code',
  keycloakUrl: 'http://localhost:8080', // exercises the no-https-forcing path
  realm: 'berget',
};

const DEVICE_RESPONSE = {
  device_code: 'secret-device-code',
  expires_in: 600,
  interval: 0, // no wait between polls in tests
  user_code: 'ABCD-EFGH',
  verification_uri: 'http://localhost:8080/realms/berget/device',
  verification_uri_complete: 'http://localhost:8080/realms/berget/device?user_code=ABCD-EFGH',
};

const SUCCESS_TOKENS = {
  access_token: 'access-token',
  expires_in: 300,
  refresh_token: 'refresh-token',
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe('device flow', () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;

  beforeEach(() => {
    console.log = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    vi.restoreAllMocks();
  });

  test('startDeviceFlow: happy path returns tokens and prints link + user code', async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/device')) {
        return Promise.resolve(jsonResponse(DEVICE_RESPONSE));
      }
      if (url.includes('/openid-connect/token')) {
        return Promise.resolve(jsonResponse(SUCCESS_TOKENS));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }) as unknown as typeof fetch;

    const result = await startDeviceFlow({ config: CONFIG });

    expect(result).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      success: true,
    });

    const output = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map((args) => args.join(' '))
      .join('\n');
    expect(output).toContain('http://localhost:8080/realms/berget/device?user_code=ABCD-EFGH');
    expect(output).toContain('ABCD-EFGH');
  });

  test('startDeviceFlow: builds endpoints from config realm (not hardcoded /realms/berget)', async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      calls.push(String(input));
      if (calls.length === 1) {
        return Promise.resolve(jsonResponse({ ...DEVICE_RESPONSE, expires_in: 'nope' }));
      }
      return Promise.resolve(jsonResponse(SUCCESS_TOKENS));
    }) as unknown as typeof fetch;

    const result = await startDeviceFlow({
      config: { ...CONFIG, keycloakUrl: 'http://localhost:8080', realm: 'custom-realm' },
    });

    expect(calls[0]).toContain('/realms/custom-realm/protocol/openid-connect/auth/device');
    // Invalid expires_in -> rejected before polling.
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid device authorization response');
  });

  test('startDeviceFlow: failed authorization returns error result', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(new Response('forbidden', { status: 403 })),
    ) as unknown as typeof fetch;

    const result = await startDeviceFlow({ config: CONFIG });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to start device flow');
  });

  test('startDeviceFlow: access_denied becomes an error result', async () => {
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/device')) {
        return Promise.resolve(jsonResponse(DEVICE_RESPONSE));
      }
      return Promise.resolve(jsonResponse({ error: 'access_denied' }, 400));
    }) as unknown as typeof fetch;

    const result = await startDeviceFlow({ config: CONFIG });

    expect(result.success).toBe(false);
    expect(result.error).toContain('denied');
  });

  test('extractTokenResult only maps complete token responses', () => {
    expect(extractTokenResult({ error: 'authorization_pending' })).toBeUndefined();
    expect(extractTokenResult({ access_token: 'a', expires_in: 300 })).toBeUndefined();
    expect(
      extractTokenResult({ access_token: 'a', expires_in: 300, refresh_token: 'r' }),
    ).toMatchObject({
      accessToken: 'a',
      refreshToken: 'r',
      success: true,
    });
  });

  test('handlePollError maps RFC 8628 errors', () => {
    expect(handlePollError({ error: 'authorization_pending' }, 5)).toEqual({});
    expect(handlePollError({ error: 'slow_down' }, 5)).toEqual({ intervalSeconds: 10 });
    expect(handlePollError({ error: 'slow_down' }, 28)).toEqual({ intervalSeconds: 30 });
    expect(() => handlePollError({ error: 'expired_token' }, 5)).toThrow('expired');
    expect(() => handlePollError({ error: 'access_denied' }, 5)).toThrow('denied');
    expect(() => handlePollError({ error: 'server_error' }, 5)).toThrow(
      'Device flow failed: server_error',
    );
    expect(() => handlePollError({ error: 'server_error', error_description: 'boom' }, 5)).toThrow(
      'boom',
    );
  });

  test('renderTerminalQrCode emits a half-block matrix with quiet zone', () => {
    const qr = renderTerminalQrCode('https://example.com/device');
    const lines = qr.split('\n');

    expect(lines.length).toBeGreaterThan(10);
    expect(lines.every((line) => line.startsWith('    '))).toBe(true); // indent
    expect(qr).toMatch(/[▀▄█]/); // half-block glyphs only
    expect(qr).not.toMatch(/[▘▝▖▗]/); // no quadrant glyphs
  });
});
