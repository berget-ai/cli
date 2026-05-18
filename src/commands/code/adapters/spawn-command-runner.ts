import { spawn } from 'node:child_process';

import type { CommandRunner } from '../ports/command-runner.js';

export class SpawnCommandRunner implements CommandRunner {
  async checkInstalled(binary: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('which', [binary], { stdio: 'pipe' });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  async run(
    command: string,
    arguments_: readonly string[],
    options?: { cwd?: string },
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(command, arguments_ as string[], {
        cwd: options?.cwd || process.cwd(),
        stdio: 'pipe',
      });

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
