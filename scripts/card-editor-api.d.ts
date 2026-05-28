import type { IncomingMessage, ServerResponse } from "node:http";

export type CardEditorApiNext = () => void;

export function createCardEditorApiMiddleware(options?: { rootDir?: string }): (
  req: IncomingMessage,
  res: ServerResponse,
  next: CardEditorApiNext,
) => void | Promise<void>;
