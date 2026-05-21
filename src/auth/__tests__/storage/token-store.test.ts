import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../../../utils/logger.js';
import { FileTokenStore } from '../../storage/token-store.js';

describe('FileTokenStore', () => {
  const getTempAuthPath = () => path.join(os.tmpdir(), `berget-auth-test-${Date.now()}.json`);

  beforeEach(() => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when auth file does not exist', async () => {
    const store = new FileTokenStore(getTempAuthPath());
    const result = await store.get();
    expect(result).toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('round-trips TokenData and preserves exact JSON shape', async () => {
    const tempPath = getTempAuthPath();
    const store = new FileTokenStore(tempPath);

    const tokenData = {
      access_token: 'test-access-token',
      expires_at: 1893456000000,
      refresh_token: 'test-refresh-token',
    };

    await store.set(tokenData);
    const result = await store.get();
    expect(result).toEqual(tokenData);

    // Verify exact JSON shape on disk
    const raw = await fs.readFile(tempPath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual(tokenData);
    expect(Object.keys(parsed)).toEqual(['access_token', 'expires_at', 'refresh_token']);
  });

  it('sets 0o600 permissions on write', async () => {
    const tempPath = getTempAuthPath();
    const store = new FileTokenStore(tempPath);

    await store.set({
      access_token: 'tok',
      expires_at: 1893456000000,
      refresh_token: 'ref',
    });

    const stats = await fs.stat(tempPath);

    const perms = stats.mode & 0o777;
    expect(perms).toBe(0o600);
  });

  it('clears by unlinking the file', async () => {
    const tempPath = getTempAuthPath();
    const store = new FileTokenStore(tempPath);

    await store.set({
      access_token: 'tok',
      expires_at: 1893456000000,
      refresh_token: 'ref',
    });

    expect(
      await fs
        .access(tempPath)
        .then(() => true)
        .catch(() => false),
    ).toBe(true);

    await store.clear();

    expect(
      await fs
        .access(tempPath)
        .then(() => true)
        .catch(() => false),
    ).toBe(false);
  });

  it('returns null for malformed JSON and logs warning', async () => {
    const tempPath = getTempAuthPath();
    const store = new FileTokenStore(tempPath);

    await fs.writeFile(tempPath, 'not json');
    const result = await store.get();
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('corrupted'),
      expect.any(String),
    );
  });

  it('returns null for missing required fields', async () => {
    const tempPath = getTempAuthPath();
    const store = new FileTokenStore(tempPath);

    await fs.writeFile(tempPath, JSON.stringify({ access_token: 'only' }));
    const result = await store.get();
    expect(result).toBeNull();
  });

  it('returns null and logs warning on permission error', async () => {
    const tempPath = getTempAuthPath();
    const store = new FileTokenStore(tempPath);

    await fs.writeFile(
      tempPath,
      JSON.stringify({ access_token: 'tok', expires_at: 1, refresh_token: 'ref' }),
    );
    await fs.chmod(tempPath, 0o000);

    const result = await store.get();
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('EACCES'), expect.any(String));

    // cleanup
    await fs.chmod(tempPath, 0o600);
    await fs.unlink(tempPath);
  });
});
