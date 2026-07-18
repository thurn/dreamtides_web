// Quest utility-menu controller — app-shell state and effects for the shared
// Cumulus corner menu. It owns persistence, logging, and transient status;
// Cumulus owns every rendered menu surface and interaction detail.

import { useEffect, useMemo, useRef, useState } from "react";
import { downloadLog, logEvent } from "../logging";
import { BUILD_GIT_SHA } from "../runtime/build-info";
import {
  getSavedQuest,
  listSavedQuests,
  saveQuest,
  type SavedQuestSummary,
} from "../state/saved-quests";
import { useQuest } from "../state/quest-context";
import type {
  CommandMenuAction,
  CommandMenuGroup,
  CommandMenuItem,
} from "../cumulus/components/overlay/CommandMenus";
import { GLYPHS } from "../cumulus/primitives/glyph";
import type { QuestState } from "../types/quest";

/** A route-supplied command that the quest utility menu may render. */
export type QuestUtilityMenuAction = CommandMenuAction | CommandMenuGroup;

export type QuestUtilityMenuBuiltIn =
  | "saveQuest"
  | "loadQuest"
  | "downloadLog"
  | "buildSha";

export type SavedQuestLoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; saves: readonly SavedQuestSummary[] }
  | { kind: "error"; message: string };

/** Plain command data supplied to the Cumulus corner utility-menu offering. */
export interface QuestUtilityMenuViewModel {
  /** Root commands and groups, with named glyphs and semantic callbacks. */
  actions: readonly CommandMenuItem[];
  /** The current saved-quest loading state, retained for controller tests. */
  loadState: SavedQuestLoadState;
  /** A transient result Cumulus presents beneath the trigger. */
  status: string | null;
}

/** Inputs that wire quest-specific effects into the pure utility-menu model. */
export interface BuildQuestUtilityMenuViewModelInput {
  actions: readonly QuestUtilityMenuAction[];
  builtIns: readonly QuestUtilityMenuBuiltIn[];
  canLoadQuest: boolean;
  loadState: SavedQuestLoadState;
  status: string | null;
  onSaveQuest: () => void;
  onOpenLoadMenu: () => void;
  onSelectSavedQuest: (summary: SavedQuestSummary) => void;
  onDownloadLog: () => void;
  onViewBuildSha: () => void;
}

/**
 * Maps app-shell commands and effect callbacks to the strict Cumulus menu
 * hierarchy. It is pure so command construction remains independently tested.
 */
export function buildQuestUtilityMenuViewModel({
  actions,
  builtIns,
  canLoadQuest,
  loadState,
  status,
  onSaveQuest,
  onOpenLoadMenu,
  onSelectSavedQuest,
  onDownloadLog,
  onViewBuildSha,
}: BuildQuestUtilityMenuViewModelInput): QuestUtilityMenuViewModel {
  const builtInActions = builtIns.flatMap((builtIn): readonly CommandMenuItem[] => {
    switch (builtIn) {
      case "saveQuest":
        return [{ kind: "action", id: "saveQuest", label: "Save Quest", glyph: GLYPHS.save, onCommand: onSaveQuest }];
      case "loadQuest":
        return canLoadQuest ? [buildLoadQuestGroup(loadState, onOpenLoadMenu, onSelectSavedQuest)] : [];
      case "downloadLog":
        return [{ kind: "action", id: "downloadLog", label: "Download Log", glyph: GLYPHS.download, onCommand: onDownloadLog }];
      case "buildSha":
        return [{ kind: "action", id: "buildSha", label: "Build SHA", glyph: GLYPHS.code, onCommand: onViewBuildSha }];
    }
  });

  return { actions: [...actions, ...builtInActions], loadState, status };
}

function buildLoadQuestGroup(
  loadState: SavedQuestLoadState,
  onOpen: () => void,
  onSelect: (summary: SavedQuestSummary) => void,
): CommandMenuGroup {
  return {
    kind: "group",
    id: "loadQuest",
    label: "Load Quest",
    glyph: GLYPHS.folderOpen,
    onOpen,
    actions: loadStateToActions(loadState, onSelect),
  };
}

function loadStateToActions(
  loadState: SavedQuestLoadState,
  onSelect: (summary: SavedQuestSummary) => void,
): readonly CommandMenuItem[] {
  switch (loadState.kind) {
    case "idle":
      return [];
    case "loading":
      return [{ kind: "action", id: "loadQuest:loading", label: "Loading saved quests…", glyph: GLYPHS.folderOpen, disabled: true, onCommand: NOOP }];
    case "error":
      return [{ kind: "action", id: "loadQuest:error", label: loadState.message, glyph: GLYPHS.warning, disabled: true, accent: "danger", onCommand: NOOP }];
    case "ready":
      return loadState.saves.length === 0
        ? [{ kind: "action", id: "loadQuest:empty", label: "No saved quests.", glyph: GLYPHS.folderOpen, disabled: true, onCommand: NOOP }]
        : loadState.saves.map((save) => ({
            kind: "action" as const,
            id: `loadQuest:${save.name}`,
            label: `${save.name} — ${save.screenType} · ${formatSavedAt(save.savedAt)}`,
            glyph: GLYPHS.folderOpen,
            onCommand: () => onSelect(save),
          }));
  }
}

const NOOP = (): void => undefined;

/** App-shell inputs for {@link useQuestUtilityMenuController}. */
export interface QuestUtilityMenuControllerOptions {
  actions: readonly QuestUtilityMenuAction[];
  builtIns: readonly QuestUtilityMenuBuiltIn[];
  onLoadQuestState?: (state: QuestState, source: string) => void;
  saveSource: string;
  loadSource: string;
}

/**
 * Owns saved-quest persistence, logging, log download, build reporting, and
 * transient status timing. The returned view model has no presentation escape
 * hatch and is rendered by `CornerUtilityMenu` in app chrome.
 */
export function useQuestUtilityMenuController({
  actions,
  builtIns,
  onLoadQuestState,
  saveSource,
  loadSource,
}: QuestUtilityMenuControllerOptions): QuestUtilityMenuViewModel {
  const { state } = useQuest();
  const [loadState, setLoadState] = useState<SavedQuestLoadState>({ kind: "idle" });
  const [status, setStatus] = useState<string | null>(null);
  const statusTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (statusTimerRef.current !== null) clearTimeout(statusTimerRef.current);
  }, []);

  function flashStatus(text: string): void {
    setStatus(text);
    if (statusTimerRef.current !== null) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => {
      setStatus(null);
      statusTimerRef.current = null;
    }, 4000);
  }

  async function handleSaveQuest(): Promise<void> {
    const entered = window.prompt('Save current quest as (reload with `npm run load-quest -- "<name>"`):');
    if (entered === null) return;
    const trimmed = entered.trim();
    if (trimmed === "") {
      flashStatus("Save cancelled: a name is required.");
      return;
    }
    try {
      const summary = await saveQuest(trimmed, state);
      logEvent("debug_quest_saved", { source: saveSource, name: summary.name, screen: summary.screenType });
      flashStatus(`Saved "${summary.name}".`);
    } catch (error) {
      flashStatus(error instanceof Error ? error.message : "Failed to save quest.");
    }
  }

  function handleOpenLoadMenu(): void {
    setLoadState({ kind: "loading" });
    void listSavedQuests()
      .then((saves) => setLoadState({ kind: "ready", saves }))
      .catch((error: unknown) => setLoadState({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to list saved quests.",
      }));
  }

  async function handleSelectLoad(summary: SavedQuestSummary): Promise<void> {
    if (onLoadQuestState === undefined) {
      flashStatus("Loading is unavailable in this context.");
      return;
    }
    try {
      const loaded = await getSavedQuest(summary.name);
      if (loaded === null) {
        flashStatus(`Saved quest "${summary.name}" could not be found.`);
        return;
      }
      logEvent("debug_quest_loaded", { source: loadSource, name: summary.name, screen: loaded.screen?.type ?? "unknown" });
      onLoadQuestState(loaded, loadSource);
      flashStatus(`Loaded "${summary.name}".`);
    } catch (error) {
      flashStatus(error instanceof Error ? error.message : "Failed to load quest.");
    }
  }

  return useMemo(() => buildQuestUtilityMenuViewModel({
    actions,
    builtIns,
    canLoadQuest: onLoadQuestState !== undefined,
    loadState,
    status,
    onSaveQuest: () => void handleSaveQuest(),
    onOpenLoadMenu: handleOpenLoadMenu,
    onSelectSavedQuest: (summary) => void handleSelectLoad(summary),
    onDownloadLog: downloadLog,
    onViewBuildSha: () => {
      logEvent("build_sha_viewed", { source: "dreamscape_menu", gitSha: BUILD_GIT_SHA });
      flashStatus(`Build Git SHA: ${BUILD_GIT_SHA}`);
    },
  }), [actions, builtIns, loadState, onLoadQuestState, status]);
}

function formatSavedAt(savedAt: string): string {
  const parsed = new Date(savedAt);
  return Number.isNaN(parsed.getTime()) ? savedAt : parsed.toLocaleString();
}
