import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { TokenData } from '../types.js';

export interface TokenStore {
  clear(): Promise<void>;
  get(): Promise<null | TokenData>;
  set(data: TokenData): Promise<void>;
}

export class FileTokenStore implements TokenStore {
  private tokenFilePath: string;

  constructor() {
    this.tokenFilePath = getTokenFilePath();
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.tokenFilePath);
    } catch {
      // ignore if file doesn't exist
    }
  }

  async get(): Promise<null | TokenData> {
    try {
      const data = await fs.readFile(this.tokenFilePath, 'utf8');
      const parsed = JSON.parse(data) as TokenData;
      // Validate shape
      if (
        typeof parsed.access_token === 'string' &&
        typeof parsed.refresh_token === 'string' &&
        typeof parsed.expires_at === 'number'
      ) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  async set(data: TokenData): Promise<void> {
    const bergetDir = path.dirname(this.tokenFilePath);
    try {
      await fs.mkdir(bergetDir, { recursive: true });
    } catch {
      // ignore
    }
    await fs.writeFile(this.tokenFilePath, JSON.stringify(data, null, 2));
    await fs.chmod(this.tokenFilePath, 0o600);
  }
}

function getTokenFilePath(): string {
  const bergetDir = path.join(os.homedir(), '.berget');
  return path.join(bergetDir, 'auth.json');
}
