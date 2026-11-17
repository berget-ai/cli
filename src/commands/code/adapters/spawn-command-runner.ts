import { spawn } from 'node:child_process';
import which from 'which';

import type { CommandRunner } from '../ports/command-runner.js';

export class SpawnCommandRunner implements CommandRunner {
  async checkInstalled(binary: string): Promise<boolean> {
    try {
      await which(binary);
      return true;
    } catch {
      return false;
    }
  }

  async run(
    command: string,
    arguments_: readonly string[],
    options?: {
      cwd?: string;
      input?: string;
    },
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(command, arguments_ as string[], {
        cwd: options?.cwd || process.cwd(),
        stdio: 'pipe',
      });

      if (options?.input !== undefined) {
        // Child may exit before consuming stdin (e.g. an opencode build
        // without `auth import`) — an unread write would emit EPIPE on the
        // stream and crash the wizard outside runInit's try/catch.
        child.stdin?.on('error', () => {});
        child.stdin?.end(options.input);
      }

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr?.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr.trim() || `Command failed with exit code ${code}`));
        }
      });
      child.on('error', (error) => reject(error));
    });
  }
}
