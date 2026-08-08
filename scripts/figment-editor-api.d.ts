import type { IncomingMessage, ServerResponse } from "node:http";

export type FigmentEditorApiNext = () => void;

export function createFigmentEditorApiMiddleware(options?: {
  rootDir?: string;
  publishEdit?: (request: Record<string, unknown>) => Promise<{ sourceRevision?: string }>;
  revision?: (rootDir: string, sourcePaths: string[]) => string;
  loadData?: (rootDir: string) => unknown[];
}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: FigmentEditorApiNext,
) => void | Promise<void>;
