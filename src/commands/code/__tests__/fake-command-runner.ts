import type { CommandRunner } from "../ports/command-runner";

type Handler = {
  match: (command: string, args: readonly string[]) => boolean;
  response: string | Error | ((command: string, args: readonly string[]) => string | Error);
};

export class FakeCommandRunner implements CommandRunner {
  private handlers: Handler[] = [];
  private _calls: Array<{ command: string; args: string[]; options?: { cwd?: string } }> = [];

  handle(match: string | RegExp, response: string | Error): this {
    this.handlers.push({
      match: (cmd, args) => {
        const full = `${cmd} ${args.join(" ")}`;
        if (typeof match === "string") return full.startsWith(match);
        return match.test(full);
      },
      response,
    });
    return this;
  }

  checkInstalled(binary: string): Promise<boolean> {
    this._calls.push({ command: `check:${binary}`, args: [] });
    return Promise.resolve(this.handlers.some(h => h.match(binary, ["--version"])) || false);
  }

  async run(command: string, args: readonly string[], options?: { cwd?: string }): Promise<string> {
    this._calls.push({ command, args: [...args], options });
    const handler = this.handlers.find(h => h.match(command, args));
    if (!handler) throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);

    const result =
      typeof handler.response === "function" ? handler.response(command, args) : handler.response;

    if (result instanceof Error) throw result;
    return result;
  }

  get calls() {
    return this._calls;
  }
}
