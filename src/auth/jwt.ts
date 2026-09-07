/**
 * Decode the payload of a JWT token without verification.
 * @param token The JWT token string
 * @returns The decoded payload, or null if the token is invalid
 */
export function decodeJwtPayload(token: string): null | unknown {
  return parseJwtBody(token);
}

/**
 * Extract the expiration timestamp (in milliseconds) from a JWT token.
 * @param accessToken The JWT access token
 * @returns The expiration timestamp in milliseconds, or 0 if invalid
 */
export function extractJwtExpiresAt(accessToken: string): number {
  const decoded = parseJwtBody(accessToken);
  if (decoded && typeof decoded.exp === 'number') {
    return decoded.exp * 1000; // JWT exp is in seconds, convert to milliseconds
  }
  return 0;
}

/**
 * Seat roles that grant a paid Berget subscription, one per tier.
 * `berget_code` is the legacy identifier for the Standard tier (do not rename);
 * newer tiers follow `seat_plan_<tier>`. Mirrors
 * backend-api/src/config/seat-product.config.ts.
 */
const SEAT_ROLES = [
  'berget_code_seat',
  'seat_plan_mini_seat',
  'seat_plan_pro_seat',
  'seat_plan_summit_seat',
] as const;

/**
 * Check if the JWT token has any paid seat role (any tier: Standard/Mini/Pro/Summit).
 * @param accessToken The JWT access token
 * @returns true if the token holds a seat role, false otherwise
 */
export function hasBergetCodeSeat(accessToken: string): boolean {
  const decoded = parseJwtBody(accessToken);
  if (!decoded) return false;
  const realmAccess = decoded.realm_access as Record<string, unknown> | undefined;
  if (!realmAccess) return false;
  const roles = realmAccess.roles as string[] | undefined;
  if (!Array.isArray(roles)) return false;
  return roles.some((role) => (SEAT_ROLES as readonly string[]).includes(role));
}

/**
 * Check if a token is expired with a configurable buffer.
 * Uses 10% of remaining lifetime or 30 seconds, whichever is smaller.
 * @param expiresAt The expiration timestamp in milliseconds
 * @returns true if expired or about to expire, false otherwise
 */
export function isTokenExpired(expiresAt: number): boolean {
  const now = Date.now();
  const timeUntilExpiry = expiresAt - now;
  const buffer = Math.min(30 * 1000, timeUntilExpiry * 0.1);
  return now + buffer >= expiresAt;
}

/**
 * Internal: split a JWT into its three parts and parse the payload JSON.
 */
function parseJwtBody(token: string): null | Record<string, unknown> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}
