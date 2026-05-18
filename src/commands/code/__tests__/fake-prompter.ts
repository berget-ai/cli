import type { Prompter, Spinner } from '../ports/prompter.js';

import { CancelledError } from '../errors.js';

export const CANCEL = Symbol('cancel');

type PromptEntry =
  | { kind: 'confirm'; match?: RegExp; response: boolean | symbol }
  | { kind: 'multiselect'; match?: RegExp; response: (string | symbol)[] }
  | { kind: 'select'; match?: RegExp; response: string | symbol }
  | { kind: 'text'; match?: RegExp; response: string | symbol };

export const select = <T>(value: symbol | T, match?: RegExp | string): PromptEntry => ({
  kind: 'select',
  match: typeof match === 'string' ? new RegExp(match) : match,
  response: typeof value === 'symbol' ? value : String(value),
});

export const text = (value: string | symbol, match?: RegExp | string): PromptEntry => ({
  kind: 'text',
  match: typeof match === 'string' ? new RegExp(match) : match,
  response: value,
});

export const confirm = (value: boolean | symbol, match?: RegExp | string): PromptEntry => ({
  kind: 'confirm',
  match: typeof match === 'string' ? new RegExp(match) : match,
  response: value,
});

export const multiselect = <T>(values: symbol | T[], match?: RegExp | string): PromptEntry => ({
  kind: 'multiselect',
  match: typeof match === 'string' ? new RegExp(match) : match,
  response: values === CANCEL ? [CANCEL] : ((values as T[]).map(String) as (string | symbol)[]),
});

export class FakePrompter implements Prompter {
  get calls() {
    return this._calls;
  }
  private _calls: Array<{ args: unknown; method: string }> = [];

  private _cursor = 0;

  constructor(private readonly _script: PromptEntry[]) {}
  assertExhausted() {
    if (this._cursor !== this._script.length) {
      throw new Error(`Script not exhausted: ${this._script.length - this._cursor} entries left`);
    }
  }
  async confirm(options: { message: string }): Promise<boolean> {
    this._calls.push({ args: options, method: 'confirm' });
    const entry = this._script[this._cursor++];
    if (!entry)
      throw new Error(`No script entry for confirm #${this._cursor} (${options.message})`);
    if (entry.kind !== 'confirm')
      throw new Error(`Expected confirm, got ${entry.kind} for ${options.message}`);
    if (entry.match && !entry.match.test(options.message))
      throw new Error(`Message mismatch: got "${options.message}"`);
    if (entry.response === CANCEL) throw new CancelledError();
    return entry.response as boolean;
  }
  intro(message: string): void {
    this._calls.push({ args: { message }, method: 'intro' });
  }

  async multiselect<T>(options: { message: string }): Promise<T[]> {
    this._calls.push({ args: options, method: 'multiselect' });
    const entry = this._script[this._cursor++];
    if (!entry)
      throw new Error(`No script entry for multiselect #${this._cursor} (${options.message})`);
    if (entry.kind !== 'multiselect')
      throw new Error(`Expected multiselect, got ${entry.kind} for ${options.message}`);
    if (entry.match && !entry.match.test(options.message))
      throw new Error(`Message mismatch: got "${options.message}"`);
    if (entry.response.includes(CANCEL)) throw new CancelledError();
    return entry.response as T[];
  }

  note(message: string, title?: string): void {
    this._calls.push({ args: { message, title }, method: 'note' });
  }

  outro(message: string): void {
    this._calls.push({ args: { message }, method: 'outro' });
  }

  async select<T>(options: { message: string }): Promise<T> {
    this._calls.push({ args: options, method: 'select' });
    const entry = this._script[this._cursor++];
    if (!entry) throw new Error(`No script entry for select #${this._cursor} (${options.message})`);
    if (entry.kind !== 'select')
      throw new Error(`Expected select, got ${entry.kind} for ${options.message}`);
    if (entry.match && !entry.match.test(options.message))
      throw new Error(`Message mismatch: got "${options.message}"`);
    if (entry.response === CANCEL) throw new CancelledError();
    return entry.response as T;
  }

  spinner(): Spinner {
    return {
      start: (message: string) => {
        this._calls.push({ args: { message: message }, method: 'spinner.start' });
      },
      stop: (message: string) => {
        this._calls.push({ args: { message: message }, method: 'spinner.stop' });
      },
    };
  }

  async text(options: { message: string }): Promise<string> {
    this._calls.push({ args: options, method: 'text' });
    const entry = this._script[this._cursor++];
    if (!entry) throw new Error(`No script entry for text #${this._cursor} (${options.message})`);
    if (entry.kind !== 'text')
      throw new Error(`Expected text, got ${entry.kind} for ${options.message}`);
    if (entry.match && !entry.match.test(options.message))
      throw new Error(`Message mismatch: got "${options.message}"`);
    if (entry.response === CANCEL) throw new CancelledError();
    return entry.response as string;
  }
}
