export interface CommandRunner {
  checkInstalled(binary: string): Promise<boolean>;
  run(
    command: string,
    arguments_: readonly string[],
    options?: {
      cwd?: string;
      /** Optional data written to the child process's stdin. */
      input?: string;
    },
  ): Promise<string>;
}
