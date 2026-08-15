import type { IncomingMessage, ServerResponse } from "node:http";
import type { SourceRevision } from "../src/types/source-revision";

export type DreamwellEditorApiNext = () => void;

export function createDreamwellEditorApiMiddleware(options?: {
  rootDir?: string;
  publishEdit?: (request: unknown) => Promise<{ sourceRevision?: SourceRevision }>;
  revision?: (rootDir: string, sourcePaths: string[]) => SourceRevision;
}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: DreamwellEditorApiNext,
) => void | Promise<void>;
