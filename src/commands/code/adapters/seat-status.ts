import type { SeatStatusPort } from '../ports/auth-services.js';

import { getAuthConfig } from '../../../auth/config.js';

/**
 * Resolves the caller's seat via GET /v1/auth/status — the API resolves the
 * seat from berget.seat (Odoo), the same canonical source it authorizes
 * inference against. Keycloak JWT roles are legacy duplicated state and are
 * deliberately NOT consulted (they drift: e.g. a stale berget_code_seat role
 * on a Summit subscriber).
 *
 * Never throws: any failure (network, timeout, non-OK, bad payload) returns
 * null so the caller can fall back to a warn-and-continue path.
 */
export function createSeatStatusService(): SeatStatusPort {
  return {
    async fetchSeatStatus(accessToken: string) {
      const base = getAuthConfig().apiBaseUrl.replace(/\/$/, '');
      try {
        const res = await fetch(`${base}/v1/auth/status`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { seatId?: null | number; tier?: null | string };
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
