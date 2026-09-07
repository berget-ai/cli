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
