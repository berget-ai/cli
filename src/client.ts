import createClient from 'openapi-fetch';

import type { paths } from './types/api.js';

import { getAuthConfig } from './auth/config.js';
import { getConfiguration } from './auth/issuer.js';
import { authMiddleware } from './auth/middleware/auth-middleware.js';
import { refreshAccessToken } from './auth/oauth/token-refresh.js';
import { FileTokenStore } from './auth/storage/token-store.js';

export function createAuthenticatedClient(options?: { local?: boolean; stage?: boolean }) {
  const config = getAuthConfig(options);
  const client = createClient<paths>({
    baseUrl: config.apiBaseUrl,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  const tokenStore = new FileTokenStore();

  client.use(
    authMiddleware({
      getToken: async () => {
        const data = await tokenStore.get();
        return data?.access_token || null;
      },
      refresh: async () => {
        try {
          const configuration = await getConfiguration(config);
          return await refreshAccessToken(configuration, tokenStore);
        } catch {
          return false;
        }
      },
    }),
  );

  return client;
}
