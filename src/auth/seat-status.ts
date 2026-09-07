import type { SeatStatusPort } from '../commands/code/ports/auth-services.js';

/**
 * Resolves the caller's seat via GET /v1/auth/status — the API resolves the
 * seat from berget.seat (Odoo), the same canonical source it authorizes
 * inference against. Keycloak JWT roles are legacy duplicated state and are
 * deliberately NOT consulted (they drift: e.g. a stale berget_code_seat role
 * on a Summit subscriber).
 *
 * Never throws: any failure (network, non-OK, bad payload) returns null so
 * the caller can fall back to a warn-and-continue path.
 */
export function createSeatStatusService(): SeatStatusPort {
  return {
    async fetchSeatStatus(accessToken: string) {
      const base = process.env.BERGET_API_URL || 'https://api.berget.ai';
      try {
        const res = await fetch(`${base}/v1/auth/status`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { seatId?: number | null; tier?: string | null };
        const seatStatus: { seatId: null | number; tier: null | string } = {
          seatId: data.seatId ?? null,
          tier: data.tier ?? null,
        };
        return seatStatus;
      } catch {
        return null;
      }
    },
  };
}
