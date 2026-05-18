import type { CommandRunner } from '../ports/command-runner.js';

type Handler = {
  match: (command: string, arguments_: readonly string[]) => boolean;
  response: ((command: string, arguments_: readonly string[]) => Error | string) | Error | string;
};

export class FakeCommandRunner implements CommandRunner {
  get calls() {
    return this._calls;
  }
  private _calls: Array<{ args: string[]; command: string; options?: { cwd?: string } }> = [];

  private handlers: Handler[] = [];

  checkInstalled(binary: string): Promise<boolean> {
    this._calls.push({ args: [], command: `check:${binary}` });
    return Promise.resolve(this.handlers.some((h) => h.match(binary, ['--version'])) || false);
  }

  handle(match: RegExp | string, response: Error | string): this {
    this.handlers.push({
      match: (cmd, arguments_) => {
        const full = `${cmd} ${arguments_.join(' ')}`;
        if (typeof match === 'string') return full.startsWith(match);
        return match.test(full);
      },
      response,
    });
    return this;
  }

  async run(
    command: string,
    arguments_: readonly string[],
    options?: { cwd?: string },
  ): Promise<string> {
    this._calls.push({ args: [...arguments_], command, options });
    const handler = this.handlers.find((h) => h.match(command, arguments_));
    if (!handler) throw new Error(`Unexpected command: ${command} ${arguments_.join(' ')}`);

    const result =
      typeof handler.response === 'function'
        ? handler.response(command, arguments_)
        : handler.response;

    if (result instanceof Error) throw result;
    return result;
  }
}
