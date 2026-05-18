import { describe, expect, it } from 'vitest';

import {
  decodeJwtPayload,
  extractJwtExpiresAt,
  hasBergetCodeSeat,
  isTokenExpired,
} from '../jwt.js';

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = base64urlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64urlEncode(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const payload = { realm_access: { roles: ['admin'] }, sub: '123' };
    const jwt = makeJwt(payload);
    expect(decodeJwtPayload(jwt)).toEqual(payload);
  });

  it('returns null for invalid format', () => {
    expect(decodeJwtPayload('not.a')).toBeNull();
    expect(decodeJwtPayload('onlyOnePart')).toBeNull();
  });

  it('returns null for invalid base64 (backslash in base64)', () => {
    // Edge case from auth-sync.test.ts line 129
    expect(decodeJwtPayload('header.bad\\.base64.signature')).toBeNull();
  });

  it('returns null for malformed JSON in payload', () => {
    const header = base64urlEncode('{"alg":"none"}');
    const badPayload = base64urlEncode('not-json}');
    const jwt = `${header}.${badPayload}.sig`;
    expect(decodeJwtPayload(jwt)).toBeNull();
  });
});

describe('extractJwtExpiresAt', () => {
  it('converts JWT exp (seconds) to milliseconds', () => {
    const expSeconds = 1893456000;
    const jwt = makeJwt({ exp: expSeconds });
    expect(extractJwtExpiresAt(jwt)).toBe(expSeconds * 1000);
  });

  it('returns 0 for invalid JWT', () => {
    expect(extractJwtExpiresAt('invalid')).toBe(0);
    expect(extractJwtExpiresAt('only.one')).toBe(0);
  });

  it('returns 0 when exp is missing', () => {
    const jwt = makeJwt({ sub: '123' });
    expect(extractJwtExpiresAt(jwt)).toBe(0);
  });

  it('returns 0 when exp is not a number', () => {
    const jwt = makeJwt({ exp: 'not-a-number' });
    expect(extractJwtExpiresAt(jwt)).toBe(0);
  });
});

describe('isTokenExpired', () => {
  it('returns true when token has already expired', () => {
    const past = Date.now() - 10000;
    expect(isTokenExpired(past)).toBe(true);
  });

  it('returns true when expiresAt is exactly now', () => {
    const now = Date.now();
    expect(isTokenExpired(now)).toBe(true);
  });

  it('returns false when token has a short remaining time (buffer < timeUntilExpiry)', () => {
    // expiresAt is 5s from now, buffer = 10% of 5s = 500ms
    // now + 500ms < now + 5000ms → not expired
    const nearFuture = Date.now() + 5000;
    expect(isTokenExpired(nearFuture)).toBe(false);
  });

  it('returns false for a token far from expiry', () => {
    const farFuture = Date.now() + 24 * 60 * 60 * 1000; // 1 day
    expect(isTokenExpired(farFuture)).toBe(false);
  });
});

describe('hasBergetCodeSeat', () => {
  it('returns true when berget_code_seat is present', () => {
    const token = makeJwt({
      realm_access: { roles: ['berget_code_seat', 'default-roles-berget'] },
    });
    expect(hasBergetCodeSeat(token)).toBe(true);
  });

  it('returns false when role is missing', () => {
    const token = makeJwt({
      realm_access: { roles: ['default-roles-berget'] },
    });
    expect(hasBergetCodeSeat(token)).toBe(false);
  });

  it('returns false when realm_access is missing', () => {
    const token = makeJwt({ sub: '123' });
    expect(hasBergetCodeSeat(token)).toBe(false);
  });

  it('returns false for invalid JWT', () => {
    expect(hasBergetCodeSeat('invalid')).toBe(false);
    expect(hasBergetCodeSeat('only.two')).toBe(false);
  });
});
