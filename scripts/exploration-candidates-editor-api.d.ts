import type { IncomingMessage, ServerResponse } from "node:http";

export interface ExplorationCandidatesEditorApiFileSystem {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
  renameSync(oldPath: string, newPath: string): void;
  rmSync(path: string, options?: { force?: boolean }): void;
  writeFileSync(path: string, data: string): void;
}

export function createExplorationCandidatesEditorApiMiddleware(options?: {
  rootDir?: string;
  fileSystem?: ExplorationCandidatesEditorApiFileSystem;
}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void | Promise<void>;
