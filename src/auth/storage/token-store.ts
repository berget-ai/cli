import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { TokenData } from '../types.js';

import { logger } from '../../utils/logger.js';

export interface TokenStore {
  clear(): Promise<void>;
  get(): Promise<null | TokenData>;
  set(data: TokenData): Promise<void>;
}

export class FileTokenStore implements TokenStore {
  private tokenFilePath: string;

  constructor(filePath?: string) {
    this.tokenFilePath = filePath || getDefaultTokenFilePath();
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.tokenFilePath);
    } catch {
      // ignore if file doesn't exist
    }
  }

  async get(): Promise<null | TokenData> {
    let data: string | undefined;
    try {
      data = await fs.readFile(this.tokenFilePath, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return null; // Not logged in — expected
      }
      logger.warn(
        `Could not read auth file (${code || 'unknown error'}). Run \`berget auth login\` to re-authenticate.`,
        String(error),
      );
      return null;
    }

    try {
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
    } catch (error) {
      logger.warn(
        `Auth file appears corrupted. Run \`berget auth login\` to re-authenticate.`,
        String(error),
      );
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

function getDefaultTokenFilePath(): string {
  const bergetDir = path.join(os.homedir(), '.berget');
  return path.join(bergetDir, 'auth.json');
}
