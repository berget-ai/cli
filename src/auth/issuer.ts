// openid-client@^6 API surface verified:
// discovery(url: URL, clientId: string, clientMetadata?: object, clientAuth?: ClientAuth): Promise<Configuration>
// randomPKCECodeVerifier(): string
// calculatePKCECodeChallenge(codeVerifier: string): string
// buildAuthorizationUrl(configuration: Configuration, parameters?: Record<string, string>): URL
// authorizationCodeGrant(configuration: Configuration, url: URL, checkState?: boolean, options?: object): Promise<{ access_token: string, refresh_token?: string, expires_in?: number, ... }>
// refreshTokenGrant(configuration: Configuration, refreshToken: string, options?: object): Promise<{ access_token: string, refresh_token?: string, expires_in?: number, ... }>

import { type Configuration, discovery } from 'openid-client';

import type { AuthConfig } from './types.js';

const cache = new Map<string, Configuration>();

export function clearConfigurationCache(): void {
  cache.clear();
}

export async function getConfiguration(config: AuthConfig): Promise<Configuration> {
  const issuerUrl = new URL(`${config.keycloakUrl}/realms/${config.realm}`).toString();

  const cached = cache.get(issuerUrl);
  if (cached) return cached;

  const configuration = await discovery(
    new URL(issuerUrl),
    config.clientId,
    {}, // no additional client metadata needed for public PKCE client
    // 4th arg (clientAuth) omitted — public PKCE client has no auth
  );

  cache.set(issuerUrl, configuration);
  return configuration;
}
