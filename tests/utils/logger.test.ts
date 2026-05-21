import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Logger, LogLevel } from '../../src/utils/logger.js';

describe('Logger - secret redaction (debug)', () => {
  let logger: Logger;
  let stdout: string;

  beforeEach(() => {
    logger = new Logger();
    logger.setLogLevel(LogLevel.DEBUG);
    stdout = '';
    vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      stdout += args.join(' ') + '\n';
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts Bearer tokens', () => {
    logger.debug('Authorization: Bearer eyJhbGciOiJSUzI1NiIs...');
    expect(stdout).not.toContain('eyJhbGciOiJSUzI1NiIs');
    expect(stdout).toContain('Bearer [REDACTED]');
  });

  it('redacts access_token query parameter', () => {
    logger.debug('URL: https://api.berget.ai/token?access_token=secret123&foo=bar');
    expect(stdout).not.toContain('secret123');
    expect(stdout).toContain('access_token=[REDACTED]');
    expect(stdout).toContain('foo=bar');
  });

  it('redacts refresh_token query parameter', () => {
    logger.debug('URL: https://api.berget.ai/token?refresh_token=abc123&foo=bar');
    expect(stdout).not.toContain('abc123');
    expect(stdout).toContain('refresh_token=[REDACTED]');
    expect(stdout).toContain('foo=bar');
  });

  it('redacts authorization code', () => {
    logger.debug('Callback URL: https://localhost/callback?code=authcode123&state=xyz');
    expect(stdout).not.toContain('authcode123');
    expect(stdout).toContain('code=[REDACTED]');
    expect(stdout).toContain('state=xyz');
  });

  it('redacts sk_ber_* API keys', () => {
    logger.debug('Using API key: sk_ber_live_abcdef123456');
    expect(stdout).not.toContain('sk_ber_live_abcdef123456');
    expect(stdout).toContain('[REDACTED]');
  });

  it('redacts JWT-like strings', () => {
    logger.debug('Token: eyJhbGciOiJSUzI1NiIs.aW5mbyBzdHJpbmc.signature');
    expect(stdout).not.toContain('eyJhbGciOiJSUzI1NiIs');
    expect(stdout).toContain('[REDACTED]');
  });

  it('does not redact non-sensitive content', () => {
    logger.debug('Hello world, this is safe');
    expect(stdout).toContain('Hello world, this is safe');
  });

  it('does not break when there are no arguments', () => {
    logger.debug('Simple message');
    expect(stdout).toContain('Simple message');
  });
});
