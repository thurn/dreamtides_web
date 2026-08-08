import type { IncomingMessage, ServerResponse } from "node:http";

export type DreamwellEditorApiNext = () => void;

export function createDreamwellEditorApiMiddleware(options?: {
  rootDir?: string;
  publishEdit?: (request: unknown) => Promise<{ sourceRevision?: string }>;
  revision?: (rootDir: string, sourcePaths: string[]) => string;
}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: DreamwellEditorApiNext,
) => void | Promise<void>;
