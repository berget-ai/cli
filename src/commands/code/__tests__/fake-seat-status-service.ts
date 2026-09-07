import type { SeatStatus, SeatStatusPort } from '../ports/auth-services.js';

/**
 * Test double: pass a SeatStatus for "user has a seat", or null for
 * "status could not be verified" (API down).
 */
export class FakeSeatStatusService implements SeatStatusPort {
  constructor(private readonly result: null | SeatStatus) {}

  async fetchSeatStatus(): Promise<null | SeatStatus> {
    return this.result;
  }
}
