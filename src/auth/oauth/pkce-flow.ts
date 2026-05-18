import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as net from 'node:net';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  type Configuration,
  randomPKCECodeVerifier,
} from 'openid-client';

import type { BrowserAuthResult } from '../types.js';

import { logger } from '../../utils/logger.js';

const FALLBACK_CALLBACK_PORT = 8787;
const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface PkceFlowOptions {
  config: Configuration;
  /** Injected http.createServer for testability */
  createServer?: typeof http.createServer;
  debug?: boolean;
}

/**
 * Start the PKCE browser flow: spin up a callback server, open the browser,
 * and exchange the authorization code for tokens.
 */
export async function startPkceFlow(options: PkceFlowOptions): Promise<BrowserAuthResult> {
  const { config, createServer: createServerFactory = http.createServer, debug } = options;

  const codeVerifier = randomPKCECodeVerifier();
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
  const state = crypto.randomUUID();

  try {
    const { port, server } = await startCallbackServer(createServerFactory);
    const redirectUri = `http://localhost:${port}/callback`;

    if (debug) {
      console.log(`Callback server listening on port ${port}`);
    }

    // Build authorization URL using openid-client
    const authorizationUrl = buildAuthorizationUrl(config, {
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      state,
    });

    // Create the callback handler promise
    const authResult = await new Promise<{
      code?: string;
      error?: string;
      success: boolean;
    }>((resolve) => {
      let resolved = false;
      const sockets = new Set<net.Socket>();

      const safeResolve = (result: { code?: string; error?: string; success: boolean }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutHandle);
        server.close();
        for (const socket of sockets) {
          socket.destroy();
        }
        sockets.clear();
        resolve(result);
      };

      server.on('request', (request, res) => {
        const requestUrl = new URL(request.url || '', `http://localhost:${port}`);

        if (requestUrl.pathname !== '/callback') {
          res.writeHead(404, { Connection: 'close' });
          res.end();
          return;
        }

        const receivedState = requestUrl.searchParams.get('state') || '';
        const code = requestUrl.searchParams.get('code') || '';
        const error = requestUrl.searchParams.get('error') || '';

        if (error) {
          const description = requestUrl.searchParams.get('error_description') || error;
          res.writeHead(200, { Connection: 'close', 'Content-Type': 'text/html; charset=utf-8' });
          res.end(getErrorPage('Authentication Failed', description));
          safeResolve({ error, success: false });
          return;
        }

        if (receivedState !== state) {
          res.writeHead(200, { Connection: 'close', 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            getErrorPage('Authentication Failed', 'Invalid state parameter. Please try again.'),
          );
          safeResolve({ error: 'Invalid state parameter', success: false });
          return;
        }

        res.writeHead(200, { Connection: 'close', 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getSuccessPage());
        safeResolve({ code, success: true });
      });

      server.on('connection', (socket: net.Socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      });

      const timeoutHandle = setTimeout(
        () => safeResolve({ error: 'Authentication timed out', success: false }),
        AUTH_TIMEOUT_MS,
      );

      // Open browser
      (async () => {
        try {
          const open = await import('open').then((m) => m.default);
          await open(authorizationUrl.toString());
        } catch (error) {
          logger.debug('Failed to open browser:', error);
          logger.info(`Please open this URL in your browser: ${authorizationUrl.toString()}`);
        }
      })();
    });

    if (!authResult.success || !authResult.code) {
      return {
        error: authResult.error || 'Unknown error',
        success: false,
      };
    }

    // Exchange code for tokens
    const callbackUrl = new URL(
      `/callback?code=${authResult.code}&state=${state}`,
      `http://localhost:${port}`,
    );
    const tokenResult = await authorizationCodeGrant(config, callbackUrl, { expectedState: state });

    return {
      accessToken: tokenResult.access_token,
      expiresIn: tokenResult.expires_in,
      refreshToken: tokenResult.refresh_token,
      success: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
}

function getErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Berget - Authentication Failed</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
        color: #fff;
      }
      .container {
        text-align: center;
        padding: 3rem;
        max-width: 400px;
      }
      .icon {
        width: 80px;
        height: 80px;
        background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1.5rem;
        box-shadow: 0 4px 20px rgba(248, 113, 113, 0.3);
      }
      .icon svg { width: 40px; height: 40px; stroke: #fff; stroke-width: 3; }
      h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.75rem; color: #fff; }
      p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
      .brand { margin-top: 2rem; opacity: 0.5; font-size: 0.8rem; letter-spacing: 0.05em; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </div>
      <h1>${title}</h1>
      <p>${message}</p>
      <div class="brand">BERGET</div>
    </div>
  </body>
</html>`;
}

function getSuccessPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Berget - Authentication Successful</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
        color: #fff;
      }
      .container {
        text-align: center;
        padding: 3rem;
        max-width: 400px;
      }
      .icon {
        width: 80px;
        height: 80px;
        background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1.5rem;
        box-shadow: 0 4px 20px rgba(74, 222, 128, 0.3);
      }
      .icon svg { width: 40px; height: 40px; stroke: #fff; stroke-width: 3; }
      h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.75rem; color: #fff; }
      p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
      .brand { margin-top: 2rem; opacity: 0.5; font-size: 0.8rem; letter-spacing: 0.05em; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h1>Authentication Successful</h1>
      <p>You can close this window and return to your terminal.</p>
      <div class="brand">BERGET</div>
    </div>
  </body>
</html>`;
}

/**
 * Start a local HTTP callback server with port fallback.
 * Returns the bound port.
 */
function startCallbackServer(
  createServerFactory: typeof http.createServer,
): Promise<{ port: number; server: http.Server }> {
  return new Promise((resolve, reject) => {
    // Do not pass a request handler here — the caller will attach it via
    // server.on('request'). Passing a handler would cause double writes
    // if the caller also uses server.on('request').
    const server = createServerFactory();

    function attemptListen(port: number) {
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && port === FALLBACK_CALLBACK_PORT) {
          server.close(() => attemptListen(0));
        } else {
          reject(error);
        }
      });

      server.once('listening', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          resolve({ port: address.port, server });
        } else {
          reject(new Error('Server address is not available'));
        }
      });

      server.listen(port);
    }

    attemptListen(FALLBACK_CALLBACK_PORT);
  });
}
