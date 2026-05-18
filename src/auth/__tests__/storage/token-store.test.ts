import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { FileTokenStore } from '../../storage/token-store.js';

describe('FileTokenStore', () => {
  const getTempAuthPath = () => path.join(os.tmpdir(), `berget-auth-test-${Date.now()}.json`);

  it('returns null when auth file does not exist', async () => {
    const store = new FileTokenStore();
    // Mock the path to a non-existent file
    (store as any).tokenFilePath = getTempAuthPath();
    const result = await store.get();
    expect(result).toBeNull();
  });

  it('round-trips TokenData and preserves exact JSON shape', async () => {
    const store = new FileTokenStore();
    const tempPath = getTempAuthPath();
    (store as any).tokenFilePath = tempPath;

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
    const store = new FileTokenStore();
    const tempPath = getTempAuthPath();
    (store as any).tokenFilePath = tempPath;

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
    const store = new FileTokenStore();
    const tempPath = getTempAuthPath();
    (store as any).tokenFilePath = tempPath;

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

  it('returns null for malformed JSON', async () => {
    const store = new FileTokenStore();
    const tempPath = getTempAuthPath();
    (store as any).tokenFilePath = tempPath;

    await fs.writeFile(tempPath, 'not json');
    const result = await store.get();
    expect(result).toBeNull();
  });

  it('returns null for missing required fields', async () => {
    const store = new FileTokenStore();
    const tempPath = getTempAuthPath();
    (store as any).tokenFilePath = tempPath;

    await fs.writeFile(tempPath, JSON.stringify({ access_token: 'only' }));
    const result = await store.get();
    expect(result).toBeNull();
  });
});
