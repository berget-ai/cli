import * as p from '@clack/prompts';

import type { Prompter, Spinner, TaskItem } from '../ports/prompter.js';

import { CancelledError } from '../errors.js';

const unwrap = <T>(v: symbol | T): T => {
  if (p.isCancel(v)) throw new CancelledError();
  return v as T;
};

export class ClackPrompter implements Prompter {
  cancel(message: string): void {
    p.cancel(message);
  }
  async confirm(options: { initialValue?: boolean; message: string }): Promise<boolean> {
    return unwrap(await p.confirm(options));
  }
  intro(message: string): void {
    p.intro(message);
  }
  log(type: 'error' | 'info' | 'message' | 'step' | 'success' | 'warn', message: string): void {
    p.log[type](message);
  }
  async multiselect<T>(options: {
    message: string;
    options: ReadonlyArray<{
      hint?: string;
      label: string;
      value: T;
    }>;
  }): Promise<T[]> {
    return unwrap(await p.multiselect(options as any));
  }
  note(message: string, title?: string): void {
    p.note(message, title);
  }
  outro(message: string): void {
    p.outro(message);
  }

  async select<T>(options: {
    initialValue?: T;
    message: string;
    options: ReadonlyArray<{
      hint?: string;
      label: string;
      value: T;
    }>;
  }): Promise<T> {
    return unwrap(await p.select(options as any));
  }

  spinner(): Spinner {
    const s = p.spinner();
    return {
      start: (message: string) => s.start(message),
      stop: (message: string) => s.stop(message),
    };
  }

  async tasks(items: ReadonlyArray<TaskItem>): Promise<void> {
    await p.tasks(
      items.map((item) => ({
        task: async (message: (msg: string) => void) => {
          const result = await item.task(message);
          return result ?? item.title;
        },
        title: item.title,
      })),
    );
  }

  async text(options: { message: string; placeholder?: string }): Promise<string> {
    return unwrap(await p.text(options));
  }
}
