export interface FileStore {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
}
