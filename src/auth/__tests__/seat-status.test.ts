import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSeatStatusService } from '../../commands/code/adapters/seat-status.js';

const BASE = 'https://api.berget.ai';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('seat-status service (GET /v1/auth/status)', () => {
  it('returns seatId and tier when the user has a seat', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ authenticated: true, seatId: 168, tier: 'seat_plan_pro' }),
        ok: true,
      }),
    );
    const svc = createSeatStatusService();
    expect(await svc.fetchSeatStatus('token')).toEqual({
      seatId: 168,
      tier: 'seat_plan_pro',
    });
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(`${BASE}/v1/auth/status`);
  });

  it('returns null seat when the user has no seat', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ authenticated: true, seatId: null, tier: null }),
        ok: true,
      }),
    );
    const svc = createSeatStatusService();
    expect(await svc.fetchSeatStatus('token')).toEqual({ seatId: null, tier: null });
  });

  it('returns null on non-OK responses (e.g. 401)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({}), ok: false, status: 401 }),
    );
    const svc = createSeatStatusService();
    expect(await svc.fetchSeatStatus('token')).toBeNull();
  });

  it('returns null on network errors (never throws)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')));
    const svc = createSeatStatusService();
    expect(await svc.fetchSeatStatus('token')).toBeNull();
  });

  it('honours BERGET_API_URL override', async () => {
    vi.stubEnv('BERGET_API_URL', 'https://api.stage.berget.ai');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({}), ok: true }));
    const svc = createSeatStatusService();
    await svc.fetchSeatStatus('token');
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('https://api.stage.berget.ai/v1/auth/status');
  });
});
