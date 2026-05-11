export interface Prompter {
  confirm(options: { initialValue?: boolean; message: string }): Promise<boolean>;
  intro(message: string): void;
  multiselect<T>(options: {
    message: string;
    options: ReadonlyArray<{
      hint?: string;
      label: string;
      value: T;
    }>;
  }): Promise<T[]>;
  note(message: string, title?: string): void;
  outro(message: string): void;
  select<T>(options: {
    message: string;
    options: ReadonlyArray<{
      hint?: string;
      label: string;
      value: T;
    }>;
  }): Promise<T>;
  spinner(): Spinner;
  text(options: { message: string; placeholder?: string }): Promise<string>;
}

export interface Spinner {
  start(message: string): void;
  stop(message: string): void;
}
