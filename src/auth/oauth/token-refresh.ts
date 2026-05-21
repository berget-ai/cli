import type { Configuration } from 'openid-client';

import { refreshTokenGrant } from 'openid-client';
import { ResponseBodyError } from 'openid-client';

import type { TokenStore } from '../storage/token-store.js';
import type { TokenData } from '../types.js';

import { extractJwtExpiresAt } from '../jwt.js';

// Well-known transient network error codes. Retrying these is safe and
// common, e.g. brief DNS failure, port temporarily unavailable.
const TRANSIENT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 200;

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code && TRANSIENT_ERROR_CODES.has(code)) return true;
  return false;
}

// In-flight refresh promises keyed by config, then by store.
// This prevents two calls with the SAME config+store from duplicating,
// while ensuring different stores don't share promises.
const inFlightByConfig = new WeakMap<Configuration, Map<TokenStore, Promise<boolean>>>();

export async function refreshAccessToken(
  config: Configuration,
  tokenStore: TokenStore,
): Promise<boolean> {
  let storeMap = inFlightByConfig.get(config);
  if (!storeMap) {
    storeMap = new Map<TokenStore, Promise<boolean>>();
    inFlightByConfig.set(config, storeMap);
  }

  const existing = storeMap.get(tokenStore);
  if (existing) {
    return existing;
  }

  const promise = doRefresh(config, tokenStore).finally(() => {
    storeMap!.delete(tokenStore);
  });

  storeMap.set(tokenStore, promise);
  return promise;
}

/**
 * Try to refresh the access token with exponential backoff on transient
 * network failures. Permanent auth errors clear stored tokens; transient
 * errors are retried up to MAX_RETRIES and never delete tokens.
 */
async function doRefresh(config: Configuration, tokenStore: TokenStore): Promise<boolean> {
  const tokenData = await tokenStore.get();
  if (!tokenData?.refresh_token) return false;

  let attempt = 0;

  while (true) {
    try {
      const result = await refreshTokenGrant(config, tokenData.refresh_token);

      // Extract tokens from response
      const accessToken = result.access_token;
      const refreshToken = result.refresh_token || tokenData.refresh_token;
      const expiresIn = result.expires_in || 3600;

      // Calculate expiration from JWT or fallback
      const jwtExpiresAt = extractJwtExpiresAt(accessToken);
      const expiresAt = jwtExpiresAt > 0 ? jwtExpiresAt : Date.now() + expiresIn * 1000;

      const newTokenData: TokenData = {
        access_token: accessToken,
        expires_at: expiresAt,
        refresh_token: refreshToken,
      };

      await tokenStore.set(newTokenData);
      return true;
    } catch (error) {
      // On invalid/expired refresh token (401/403 from Keycloak), clear tokens.
      // ResponseBodyError from openid-client carries structured error info.
      if (error instanceof ResponseBodyError) {
        if (error.error === 'invalid_grant' || error.status === 401 || error.status === 403) {
          await tokenStore.clear();
        }
        return false;
      }

      if (
        error instanceof Error &&
        (error.message.includes('401') ||
          error.message.includes('403') ||
          error.message.includes('invalid_grant'))
      ) {
        // Fallback for non-standard error shapes (e.g. network-level failures)
        await tokenStore.clear();
        return false;
      }

      if (isTransientError(error) && attempt < MAX_RETRIES - 1) {
        await sleep(INITIAL_BACKOFF_MS * 2 ** attempt);
        attempt++;
        continue;
      }

      return false;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
