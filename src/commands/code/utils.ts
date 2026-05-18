import type { FileStore } from './ports/file-store.js';

export async function readJsonMaybe(files: FileStore, filePath: string): Promise<null | unknown> {
  const content = await files.readFile(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    try {
      return JSON.parse(stripJsoncComments(content));
    } catch {
      return null;
    }
  }
}

export function stripJsoncComments(content: string): string {
  content = content.replaceAll(/\/\/.*$/gm, '');
  content = content.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  return content;
}

export async function writeJsonFile(
  files: FileStore,
  filePath: string,
  data: Record<string, unknown>,
): Promise<void> {
  await files.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
