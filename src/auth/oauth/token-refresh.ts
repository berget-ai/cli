import type { Configuration } from 'openid-client';

import { refreshTokenGrant } from 'openid-client';

import type { TokenStore } from '../storage/token-store.js';
import type { TokenData } from '../types.js';

import { extractJwtExpiresAt } from '../jwt.js';

// Global in-flight refresh promise — shared across all callers
let inFlightRefresh: null | Promise<boolean> = null;

export async function refreshAccessToken(
  config: Configuration,
  tokenStore: TokenStore,
): Promise<boolean> {
  // Return existing promise if a refresh is already in progress
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = doRefresh(config, tokenStore);

  try {
    return await inFlightRefresh;
  } finally {
    inFlightRefresh = null;
  }
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
    // On invalid/expired refresh token (401/403 from Keycloak), clear tokens
    if (
      error instanceof Error &&
      (error.message.includes('401') ||
        error.message.includes('403') ||
        error.message.includes('invalid_grant'))
    ) {
      await tokenStore.clear();
    }
    return false;
  }
}
