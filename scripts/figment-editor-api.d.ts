import type { IncomingMessage, ServerResponse } from "node:http";
import type { SourceRevision } from "../src/types/source-revision";

export type FigmentEditorApiNext = () => void;

export function createFigmentEditorApiMiddleware(options?: {
  rootDir?: string;
  publishEdit?: (request: Record<string, unknown>) => Promise<{ sourceRevision?: SourceRevision }>;
  revision?: (rootDir: string, sourcePaths: string[]) => SourceRevision;
  loadData?: (rootDir: string) => unknown[];
}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: FigmentEditorApiNext,
) => void | Promise<void>;
