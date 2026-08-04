import type { Connect } from "vite";

export function createExplorationEditorApiMiddleware(options?: {
  rootDir?: string;
  fileSystem?: unknown;
  explorationTomlPath?: string;
  templatesPath?: string;
  cardsTomlPath?: string;
  dreamsignsTomlPath?: string;
  explorationJsonPath?: string;
  onChanged?: (change: {
    kind: "prose" | "action" | "template";
    cardId?: string;
    slot?: number;
    templateId?: number;
  }) => void;
}): Connect.NextHandleFunction;
