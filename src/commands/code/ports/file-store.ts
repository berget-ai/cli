export interface FileStore {
  chmod(path: string, mode: number): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readFile(path: string): Promise<null | string>;
  writeFile(path: string, content: string): Promise<void>;
}
