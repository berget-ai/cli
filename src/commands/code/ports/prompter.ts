export type LogType = 'error' | 'info' | 'message' | 'step' | 'success' | 'warn';

export interface Prompter {
  cancel(message: string): void;
  confirm(options: { initialValue?: boolean; message: string }): Promise<boolean>;
  intro(message: string): void;
  log(type: LogType, message: string): void;
  multiselect<T>(options: {
    message: string;
    options: ReadonlyArray<{
      hint?: string;
      label: string;
      value: T;
    }>;
    required?: boolean;
  }): Promise<T[]>;
  note(message: string, title?: string): void;
  outro(message: string): void;
  select<T>(options: {
    initialValue?: T;
    message: string;
    options: ReadonlyArray<{
      hint?: string;
      label: string;
      value: T;
    }>;
  }): Promise<T>;
  spinner(): Spinner;
  tasks(items: ReadonlyArray<TaskItem>): Promise<void>;
  text(options: { message: string; placeholder?: string }): Promise<string>;
}

export interface Spinner {
  start(message: string): void;
  stop(message: string): void;
}

export interface TaskContext {
  message: (msg: string) => void;
}

export interface TaskItem {
  task: (updateMessage: (msg: string) => void) => Promise<string | undefined>;
  title: string;
}
