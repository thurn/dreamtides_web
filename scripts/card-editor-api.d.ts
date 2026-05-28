import type { IncomingMessage, ServerResponse } from "node:http";

export type CardEditorApiNext = () => void;

export interface CardEditorApiFileSystem {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): unknown;
  mkdtempSync(prefix: string): string;
  readFileSync(path: string, encoding: "utf8"): string;
  renameSync(oldPath: string, newPath: string): void;
  rmSync(path: string, options?: { force?: boolean; recursive?: boolean }): void;
  writeFileSync(path: string, data: string): void;
}

export function createCardEditorApiMiddleware(options?: {
  rootDir?: string;
  fileSystem?: CardEditorApiFileSystem;
}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: CardEditorApiNext,
) => void | Promise<void>;
