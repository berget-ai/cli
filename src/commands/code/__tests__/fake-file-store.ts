import type { FileStore } from '../ports/file-store.js';

export interface FileEntry {
  content: string;
  isDirectory?: boolean;
}

export class FakeFileStore implements FileStore {
  private _chmodCalls: Array<{ mode: number; path: string }> = [];
  private dirs: Set<string> = new Set();
  private files: Map<string, string> = new Map();

  async chmod(path: string, mode: number): Promise<void> {
    this._chmodCalls.push({ mode, path });
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  getChmodCalls(): Array<{ mode: number; path: string }> {
    return this._chmodCalls;
  }

  getWrittenFiles(): Map<string, string> {
    return new Map(this.files);
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }

  async readFile(path: string): Promise<null | string> {
    return this.files.get(path) ?? null;
  }

  seed(path: string, content: string): void {
    this.files.set(path, content);
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
}
