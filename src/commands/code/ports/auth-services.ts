export interface ApiKeyServicePort {
  create(options: { description?: string; name: string }): Promise<{ key: string }>;
}

export interface AuthServicePort {
  login(): Promise<boolean>;
  loginInteractive(options?: { debug?: boolean }): Promise<{
    accessToken?: string;
    error?: string;
    expiresIn?: number;
    refreshToken?: string;
    success: boolean;
  }>;
}

export interface SeatStatus {
  seatId: null | number;
  tier: null | string;
}

/**
 * Resolves the caller's seat from the API's canonical source (berget.seat in
 * Odoo, via GET /v1/auth/status) — NOT from Keycloak JWT roles, which are
 * legacy duplicated state and no longer written for newer tiers.
 * Returns null when the status cannot be verified (network/5xx/401) so the
 * caller can fall back to a warn-and-continue path.
 */
export interface SeatStatusPort {
  fetchSeatStatus(accessToken: string): Promise<null | SeatStatus>;
}
