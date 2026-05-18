// openid-client@^6 API surface verified:
// discovery(url: URL, clientId: string, clientMetadata?: object, clientAuth?: ClientAuth): Promise<Configuration>
// randomPKCECodeVerifier(): string
// calculatePKCECodeChallenge(codeVerifier: string): string
// buildAuthorizationUrl(configuration: Configuration, parameters?: Record<string, string>): URL
// authorizationCodeGrant(configuration: Configuration, url: URL, checkState?: boolean, options?: object): Promise<{ access_token: string, refresh_token?: string, expires_in?: number, ... }>
// refreshTokenGrant(configuration: Configuration, refreshToken: string, options?: object): Promise<{ access_token: string, refresh_token?: string, expires_in?: number, ... }>

import { type Configuration, discovery } from 'openid-client';

import type { AuthConfig } from '../types.js';

let cachedConfig: Configuration | null = null;

export function clearConfigurationCache(): void {
  cachedConfig = null;
}

export async function getConfiguration(config: AuthConfig): Promise<Configuration> {
  if (cachedConfig) return cachedConfig;

  const issuerUrl = new URL(`${config.keycloakUrl}/realms/${config.realm}`);
  cachedConfig = await discovery(
    issuerUrl,
    config.clientId,
    {}, // no additional client metadata needed for public PKCE client
    // 4th arg (clientAuth) omitted — public PKCE client has no auth
  );

  return cachedConfig;
}
