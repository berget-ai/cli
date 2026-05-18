import type { Configuration } from 'openid-client';

import { refreshTokenGrant } from 'openid-client';
import { ResponseBodyError } from 'openid-client';

import type { TokenStore } from '../storage/token-store.js';
import type { TokenData } from '../types.js';

import { extractJwtExpiresAt } from '../jwt.js';

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

async function doRefresh(config: Configuration, tokenStore: TokenStore): Promise<boolean> {
  const tokenData = await tokenStore.get();
  if (!tokenData?.refresh_token) return false;

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
      // Keycloak returns invalid_grant when the refresh token is expired or revoked
      if (error.error === 'invalid_grant' || error.status === 401 || error.status === 403) {
        await tokenStore.clear();
      }
    } else if (
      error instanceof Error &&
      (error.message.includes('401') ||
        error.message.includes('403') ||
        error.message.includes('invalid_grant'))
    ) {
      // Fallback for non-standard error shapes (e.g. network-level failures)
      await tokenStore.clear();
    }
    return false;
  }
}
