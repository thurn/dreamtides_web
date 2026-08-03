import type { IncomingMessage, ServerResponse } from "node:http";

export interface EncounterEditorApiFileSystem {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
  renameSync(oldPath: string, newPath: string): void;
  rmSync(path: string, options?: { force?: boolean }): void;
  writeFileSync(path: string, data: string): void;
}

export function createEncounterEditorApiMiddleware(options?: {
  rootDir?: string;
  fileSystem?: EncounterEditorApiFileSystem;
}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void | Promise<void>;
