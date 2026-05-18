import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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

// Deprecated: backward-compat wrappers. To be removed in Phase 7.
const tokenFilePath = path.join(os.homedir(), '.berget', 'auth.json');

export function clearAuthToken(): void {
  try {
    if (fs.existsSync(tokenFilePath)) {
      fs.unlinkSync(tokenFilePath);
    }
  } catch {
    // silent
  }
}

export function saveAuthToken(
  accessToken: string,
  refreshToken: string,
  expiresIn: number = 3600,
): void {
  try {
    const bergetDir = path.dirname(tokenFilePath);
    if (!fs.existsSync(bergetDir)) {
      fs.mkdirSync(bergetDir, { recursive: true });
    }
    fs.writeFileSync(
      tokenFilePath,
      JSON.stringify(
        {
          access_token: accessToken,
          expires_at: Date.now() + expiresIn * 1000,
          refresh_token: refreshToken,
        },
        null,
        2,
      ),
    );
    fs.chmodSync(tokenFilePath, 0o600);
  } catch {
    // silent
  }
}
