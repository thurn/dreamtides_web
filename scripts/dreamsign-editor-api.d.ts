import type { IncomingMessage, ServerResponse } from "node:http";

export type DreamsignEditorApiNext = () => void;

export interface DreamsignEditorApiFileSystem {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): unknown;
  mkdtempSync(prefix: string): string;
  readFileSync(path: string, encoding: "utf8"): string;
  renameSync(oldPath: string, newPath: string): void;
  rmSync(path: string, options?: { force?: boolean; recursive?: boolean }): void;
  writeFileSync(path: string, data: string): void;
}

export function createDreamsignEditorApiMiddleware(options?: {
  rootDir?: string;
  fileSystem?: DreamsignEditorApiFileSystem;
}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: DreamsignEditorApiNext,
) => void | Promise<void>;
