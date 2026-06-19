import type { IncomingMessage, ServerResponse } from "node:http";

export type DreamwellEditorApiNext = () => void;

export interface DreamwellEditorApiFileSystem {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): unknown;
  mkdtempSync(prefix: string): string;
  readFileSync(path: string, encoding: "utf8"): string;
  renameSync(oldPath: string, newPath: string): void;
  rmSync(path: string, options?: { force?: boolean; recursive?: boolean }): void;
  writeFileSync(path: string, data: string): void;
}

export function createDreamwellEditorApiMiddleware(options?: {
  rootDir?: string;
  fileSystem?: DreamwellEditorApiFileSystem;
}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: DreamwellEditorApiNext,
) => void | Promise<void>;
