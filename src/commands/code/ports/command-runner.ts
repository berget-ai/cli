export interface CommandRunner {
  checkInstalled(binary: string): Promise<boolean>;
  run(
    command: string,
    arguments_: readonly string[],
    options?: {
      cwd?: string;
    }
  ): Promise<string>;
}
