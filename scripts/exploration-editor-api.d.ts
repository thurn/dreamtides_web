import type { Connect } from "vite";

export function createExplorationEditorApiMiddleware(options?: {
  rootDir?: string;
  fileSystem?: unknown;
  explorationTomlPath?: string;
  cardsTomlPath?: string;
  dreamsignsTomlPath?: string;
  explorationJsonPath?: string;
  onChanged?: (change: {
    kind: "prose" | "action";
    cardId?: string;
    slot?: number;
  }) => void;
}): Connect.NextHandleFunction;
