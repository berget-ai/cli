import type { FileStore } from "../ports/file-store";

export interface FileEntry {
  content: string;
  isDirectory?: boolean;
}

export class FakeFileStore implements FileStore {
  private files: Map<string, string> = new Map();
  private dirs: Set<string> = new Set();
  private _chmodCalls: Array<{ path: string; mode: number }> = [];

  seed(path: string, content: string): void {
    this.files.set(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  async readFile(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }

  async chmod(path: string, mode: number): Promise<void> {
    this._chmodCalls.push({ path, mode });
  }

  getWrittenFiles(): Map<string, string> {
    return new Map(this.files);
  }

  getChmodCalls(): Array<{ path: string; mode: number }> {
    return this._chmodCalls;
  }
}
