import type { Connect } from "vite";
import type { SourceRevision } from "../src/types/source-revision";

export const EXPLORATION_LOCALIZATION_PATHS: readonly string[];

export function refreshExplorationLocalizationArtifacts(options: {
  rootDir: string;
  stageRoot: string;
  copy?: (...args: unknown[]) => void;
  runTroxCommand?: (args: string[], options: {
    configPath: string;
    cwd: string;
  }) => void;
}): void;

export function createExplorationEditorApiMiddleware(options?: {
  rootDir?: string;
  fileSystem?: unknown;
  explorationTomlPath?: string;
  cardsTomlPath?: string;
  dreamsignsTomlPath?: string;
  explorationJsonPath?: string;
  publishEdit?: (options: Record<string, unknown>) => Promise<{
    sourceRevision: SourceRevision;
  }>;
  readData?: (options: Record<string, unknown>) => unknown;
  refreshLocalizationArtifacts?: (options: {
    rootDir: string;
    stageRoot: string;
  }) => void;
  onChanged?: (change: {
    kind: "prose" | "action";
    cardId?: CardId;
    slot?: number;
  }) => void;
}): Connect.NextHandleFunction;
