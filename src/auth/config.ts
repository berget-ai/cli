import type { AuthConfig } from './types.js';

export function getAuthConfig(options?: { local?: boolean; stage?: boolean }): AuthConfig {
  // Allow explicit override of Keycloak URL
  if (process.env.BERGET_KEYCLOAK_URL) {
    const apiBaseUrl = process.env.BERGET_API_URL || 'https://api.berget.ai';
    return {
      apiBaseUrl,
      clientId: 'berget-code',
      keycloakUrl: process.env.BERGET_KEYCLOAK_URL,
      realm: 'berget',
    };
  }

  let apiBaseUrl: string;
  let keycloakUrl: string;

  // Environment variable always takes precedence
  if (process.env.BERGET_API_URL) {
    apiBaseUrl = process.env.BERGET_API_URL;
    // Infer keycloak from API URL for custom endpoints
    if (apiBaseUrl.includes('localhost') || apiBaseUrl.includes('stage.')) {
      keycloakUrl = 'https://keycloak.stage.berget.ai';
    } else {
      keycloakUrl = 'https://keycloak.berget.ai';
    }
  } else if (options?.local) {
    apiBaseUrl = 'http://localhost:3000';
    keycloakUrl = 'https://keycloak.stage.berget.ai';
  } else if (options?.stage) {
    apiBaseUrl = 'https://api.stage.berget.ai';
    keycloakUrl = 'https://keycloak.stage.berget.ai';
  } else {
    apiBaseUrl = 'https://api.berget.ai';
    keycloakUrl = 'https://keycloak.berget.ai';
  }

  return {
    apiBaseUrl,
    clientId: 'berget-code',
    keycloakUrl,
    realm: 'berget',
  };
}
