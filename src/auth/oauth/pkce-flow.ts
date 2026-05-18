import * as crypto from 'node:crypto';
import * as http from 'node:http';
import * as net from 'node:net';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  type Configuration,
  randomPKCECodeVerifier,
  ResponseBodyError,
} from 'openid-client';

import type { BrowserAuthResult } from '../types.js';

import { logger, LogLevel } from '../../utils/logger.js';
import { getErrorPage, getSuccessPage } from './callback-pages.js';

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
  const {
    config,
    createServer: createServerFactory = http.createServer,
    debug: debugOption,
  } = options;
  const debug = debugOption || logger.getLogLevel() >= LogLevel.DEBUG;

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

    if (debug) {
      logger.debug('Built authorization URL:', authorizationUrl.toString().split('?')[0] + '?...');
    }

    // Create the callback handler promise
    const authResult = await new Promise<{
      callbackUrl?: string;
      code?: string;
      error?: string;
      success: boolean;
    }>((resolve) => {
      let resolved = false;
      const sockets = new Set<net.Socket>();

      const safeResolve = (result: {
        callbackUrl?: string;
        code?: string;
        error?: string;
        success: boolean;
      }) => {
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
          if (debug) {
            logger.debug(`Callback returned OAuth error: ${error} — ${description}`);
          }
          res.writeHead(200, { Connection: 'close', 'Content-Type': 'text/html; charset=utf-8' });
          res.end(getErrorPage('Authentication Failed', description));
          safeResolve({ error, success: false });
          return;
        }

        if (receivedState !== state) {
          if (debug) {
            logger.debug(`State mismatch: expected ${state}, got ${receivedState}`);
          }
          res.writeHead(200, { Connection: 'close', 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            getErrorPage('Authentication Failed', 'Invalid state parameter. Please try again.'),
          );
          safeResolve({ error: 'Invalid state parameter', success: false });
          return;
        }

        res.writeHead(200, { Connection: 'close', 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getSuccessPage());
        safeResolve({ callbackUrl: requestUrl.toString(), code, success: true });
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

    if (!authResult.success || !authResult.code || !authResult.callbackUrl) {
      return {
        error: authResult.error || 'Unknown error',
        success: false,
      };
    }

    // Exchange code for tokens using the FULL callback URL (preserves iss, session_state, etc.)
    const callbackUrl = new URL(authResult.callbackUrl);

    if (debug) {
      logger.debug('Exchanging code for tokens at token endpoint');
      logger.debug('Callback URL used for exchange:', callbackUrl.toString());
    }

    try {
      const tokenResult = await authorizationCodeGrant(config, callbackUrl, {
        expectedState: state,
        pkceCodeVerifier: codeVerifier,
      });

      if (debug) {
        logger.debug('Token exchange succeeded. Expires in:', tokenResult.expires_in);
      }

      return {
        accessToken: tokenResult.access_token,
        expiresIn: tokenResult.expires_in,
        refreshToken: tokenResult.refresh_token,
        success: true,
      };
    } catch (tokenError) {
      if (debug) {
        logger.debug('Token exchange failed:', tokenError);
        if (tokenError instanceof ResponseBodyError) {
          logger.debug('ResponseBodyError details — status:', (tokenError as any).status);
          logger.debug('ResponseBodyError details — response:', (tokenError as any).response);
        }
      }
      throw tokenError;
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
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
