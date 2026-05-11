import { promises as fs } from "node:fs";
import * as path from "node:path";

import type { FileStore } from "../ports/file-store";

export class FsFileStore implements FileStore {
  async chmod(filePath: string, mode: number): Promise<void> {
    await fs.chmod(filePath, mode);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(dir: string): Promise<void> {
    await fs.mkdir(dir, { recursive: true });
  }

  async readFile(filePath: string): Promise<null | string> {
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error: any) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }
}
