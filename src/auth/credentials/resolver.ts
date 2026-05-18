import type { TokenStore } from '../storage/token-store.js';
import type { AuthConfig, AuthState } from '../types.js';

import { getAuthConfig } from '../config.js';
import { getConfiguration } from '../issuer.js';
import { extractJwtExpiresAt } from '../jwt.js';
import { refreshAccessToken } from '../oauth/token-refresh.js';
import { FileTokenStore } from '../storage/token-store.js';
import { resolveApiKey } from './api-key.js';

export async function resolveAuth(options?: {
  apiKey?: string;
  local?: boolean;
  stage?: boolean;
  tokenStore?: TokenStore;
}): Promise<AuthState | null> {
  // 1. Check explicit API key or BERGET_API_KEY
  const apiKey = await resolveApiKey({ apiKey: options?.apiKey });
  if (apiKey) {
    return {
      method: 'api_key',
      token: apiKey,
    };
  }

  // 2. Check OAuth token
  const tokenStore = options?.tokenStore || new FileTokenStore();
  const tokenData = await tokenStore.get();
  if (tokenData?.access_token) {
    const expiresAt = extractJwtExpiresAt(tokenData.access_token);
    const config: AuthConfig = getAuthConfig(options);

    return {
      expiresAt,
      method: 'oauth',
      refresh: async () => {
        try {
          const configuration = await getConfiguration(config);
          return await refreshAccessToken(configuration, tokenStore);
        } catch {
          return false;
        }
      },
      token: tokenData.access_token,
    };
  }

  // 3. Default API key manager as last resort
  const defaultKey = await resolveApiKey({ apiKey: options?.apiKey });
  if (defaultKey) {
    return {
      method: 'api_key',
      token: defaultKey,
    };
  }

  return null;
}
