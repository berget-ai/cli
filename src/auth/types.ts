export interface AuthConfig {
  apiBaseUrl: string;
  clientId: string;
  keycloakUrl: string;
  realm: string;
}

export type AuthMethod = 'api_key' | 'oauth';

export interface AuthState {
  expiresAt?: number;
  method: AuthMethod;
  refresh?: () => Promise<boolean>; // injected by resolver for middleware use
  token: string; // access token or raw API key
}

export interface BrowserAuthResult {
  accessToken?: string;
  error?: string;
  expiresIn?: number;
  refreshToken?: string;
  success: boolean;
}

export interface TokenData {
  access_token: string;
  expires_at: number;
  refresh_token: string;
}
