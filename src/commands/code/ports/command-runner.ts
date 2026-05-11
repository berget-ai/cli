export interface CommandRunner {
  checkInstalled(binary: string): Promise<boolean>;
  run(
    command: string,
    args: readonly string[],
    options?: {
      cwd?: string;
    }
  ): Promise<string>;
}
