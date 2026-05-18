import { describe, expect, it, vi } from 'vitest';

import { startPkceFlow } from '../oauth/pkce-flow.js';

function createMockServer(options: { eaddrinuse?: boolean } = {}): any {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {
    connection: [],
    error: [],
    listening: [],
    request: [],
  };

  let _address: any = { port: 9876 };
  let closed = false;
  let listenCallCount = 0;

  function addListener(event: string, handler: (...args: any[]) => void, once: boolean) {
    if (!listeners[event]) listeners[event] = [];
    if (once) {
      const onceHandler = (...args: any[]) => {
        const idx = listeners[event].indexOf(onceHandler);
        if (idx !== -1) listeners[event].splice(idx, 1);
        handler(...args);
      };
      listeners[event].push(onceHandler);
    } else {
      listeners[event].push(handler);
    }
  }

  const server = {
    _listenCallCount: () => listenCallCount,
    _listeners: listeners,
    _triggerRequest: (req: any, res: any) => {
      for (const handler of [...listeners.request]) {
        handler(req, res);
      }
    },
    address: () => _address,
    close: (callback?: () => void) => {
      closed = true;
      if (callback) callback();
    },
    get closed() {
      return closed;
    },
    emit: (event: string, ...args: any[]) => {
      if (listeners[event]) {
        for (const handler of [...listeners[event]]) {
          handler(...args);
        }
      }
    },
    listen: vi.fn((port: number) => {
      listenCallCount++;
      if (options.eaddrinuse && listenCallCount === 1 && port === 8787) {
        setTimeout(() => {
          server.emit('error', Object.assign(new Error('EADDRINUSE'), { code: 'EADDRINUSE' }));
        }, 10);
      } else {
        setTimeout(() => {
          if (port === 0) _address = { port: 9999 };
          server.emit('listening');
        }, 10);
      }
    }),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      addListener(event, handler, false);
    }),
    once: vi.fn((event: string, handler: (...args: any[]) => void) => {
      addListener(event, handler, true);
    }),
  };

  return server;
}

// Mock openid-client
vi.mock('openid-client', async () => {
  return {
    authorizationCodeGrant: vi.fn(),
    buildAuthorizationUrl: vi.fn((_config, params) => {
      const url = new URL('https://keycloak.berget.ai/realms/berget/protocol/openid-connect/auth');
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value as string);
      }
      return url;
    }),
    calculatePKCECodeChallenge: vi.fn((verifier: string) => `challenge_${verifier}`),
    randomPKCECodeVerifier: vi.fn(() => 'test-verifier'),
  };
});

vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'mock-state-uuid'),
}));

describe('startPkceFlow', () => {
  it('starts server, builds auth URL with PKCE, exchanges code for tokens', async () => {
    const mockServer = createMockServer();
    const createServerFn = vi.fn(() => mockServer);

    const mockConfig: any = {};

    const { authorizationCodeGrant } = await import('openid-client');
    (authorizationCodeGrant as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      access_token: 'new-access',
      expires_in: 3600,
      refresh_token: 'new-refresh',
    });

    const flowPromise = startPkceFlow({
      config: mockConfig,
      createServer: createServerFn as any,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockServer.listen).toHaveBeenCalledWith(8787);

    // Trigger the callback request
    const req = {
      url: '/callback?code=authcode123&state=mock-state-uuid',
    };
    const res = {
      end: vi.fn(),
      writeHead: vi.fn(),
    };
    mockServer._triggerRequest(req, res);

    const result = await flowPromise;

    expect(result.success).toBe(true);
    expect(result.accessToken).toBe('new-access');
    expect(result.expiresIn).toBe(3600);
    expect(result.refreshToken).toBe('new-refresh');
  });

  it('falls back to random port when 8787 is in use', async () => {
    const mockServer = createMockServer({ eaddrinuse: true });
    const createServerFn = vi.fn(() => mockServer);
    const mockConfig: any = {};

    const { authorizationCodeGrant } = await import('openid-client');
    (authorizationCodeGrant as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      access_token: 'new-access',
      expires_in: 3600,
    });

    const flowPromise = startPkceFlow({
      config: mockConfig,
      createServer: createServerFn as any,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Trigger callback
    const req = {
      url: '/callback?code=authcode123&state=mock-state-uuid',
    };
    const res = { end: vi.fn(), writeHead: vi.fn() };
    mockServer._triggerRequest(req, res);

    const result = await flowPromise;

    expect(result.success).toBe(true);
    expect(mockServer.listen).toHaveBeenCalledWith(8787);
    expect(mockServer.listen).toHaveBeenCalledWith(0);
  });

  it('returns error when state mismatch', async () => {
    const mockServer = createMockServer();
    const createServerFn = vi.fn(() => mockServer);
    const mockConfig: any = {};

    const flowPromise = startPkceFlow({
      config: mockConfig,
      createServer: createServerFn as any,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const req = {
      url: '/callback?code=authcode123&state=wrong-state',
    };
    const res = { end: vi.fn(), writeHead: vi.fn() };
    mockServer._triggerRequest(req, res);

    const result = await flowPromise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid state');
  });

  it('returns error when callback has error param', async () => {
    const mockServer = createMockServer();
    const createServerFn = vi.fn(() => mockServer);
    const mockConfig: any = {};

    const flowPromise = startPkceFlow({
      config: mockConfig,
      createServer: createServerFn as any,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const req = {
      url: '/callback?error=access_denied&error_description=User+denied',
    };
    const res = { end: vi.fn(), writeHead: vi.fn() };
    mockServer._triggerRequest(req, res);

    const result = await flowPromise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('access_denied');
  });
});
