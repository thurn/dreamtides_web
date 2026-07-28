// Journey utility-menu controller — app-shell state and effects for the shared
// Cumulus corner menu. It owns persistence, logging, and transient status;
// Cumulus owns every rendered menu surface and interaction detail.

import { useEffect, useMemo, useRef, useState } from "react";
import { downloadLog, logEvent } from "../logging";
import { BUILD_GIT_SHA } from "../runtime/build-info";
import {
  getSavedJourney,
  listSavedJourneys,
  saveJourney,
  type SavedJourneySummary,
} from "../state/saved-journeys";
import { useJourney } from "../state/journey-context";
import type {
  CommandMenuAction,
  CommandMenuGroup,
  CommandMenuItem,
} from "../cumulus/components/overlay/CommandMenus";
import { GLYPHS } from "../cumulus/primitives/glyph";
import type { JourneyState } from "../types/journey";

/** A route-supplied command that the journey utility menu may render. */
export type JourneyUtilityMenuAction = CommandMenuAction | CommandMenuGroup;

export type JourneyUtilityMenuBuiltIn =
  | "saveJourney"
  | "loadJourney"
  | "downloadLog"
  | "buildSha";

export type SavedJourneyLoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; saves: readonly SavedJourneySummary[] }
  | { kind: "error"; message: string };

/** Plain command data supplied to the Cumulus corner utility-menu offering. */
export interface JourneyUtilityMenuViewModel {
  /** Root commands and groups, with named glyphs and semantic callbacks. */
  actions: readonly CommandMenuItem[];
  /** The current saved-journey loading state, retained for controller tests. */
  loadState: SavedJourneyLoadState;
  /** A transient result Cumulus presents beneath the trigger. */
  status: string | null;
}

/** Inputs that wire journey-specific effects into the pure utility-menu model. */
export interface BuildJourneyUtilityMenuViewModelInput {
  actions: readonly JourneyUtilityMenuAction[];
  builtIns: readonly JourneyUtilityMenuBuiltIn[];
  canLoadJourney: boolean;
  loadState: SavedJourneyLoadState;
  status: string | null;
  onSaveJourney: () => void;
  onOpenLoadMenu: () => void;
  onSelectSavedJourney: (summary: SavedJourneySummary) => void;
  onDownloadLog: () => void;
  onViewBuildSha: () => void;
}

/**
 * Maps app-shell commands and effect callbacks to the strict Cumulus menu
 * hierarchy. It is pure so command construction remains independently tested.
 */
export function buildJourneyUtilityMenuViewModel({
  actions,
  builtIns,
  canLoadJourney,
  loadState,
  status,
  onSaveJourney,
  onOpenLoadMenu,
  onSelectSavedJourney,
  onDownloadLog,
  onViewBuildSha,
}: BuildJourneyUtilityMenuViewModelInput): JourneyUtilityMenuViewModel {
  const builtInActions = builtIns.flatMap((builtIn): readonly CommandMenuItem[] => {
    switch (builtIn) {
      case "saveJourney":
        return [{ kind: "action", id: "saveJourney", label: "Save Journey", glyph: GLYPHS.save, onCommand: onSaveJourney }];
      case "loadJourney":
        return canLoadJourney ? [buildLoadJourneyGroup(loadState, onOpenLoadMenu, onSelectSavedJourney)] : [];
      case "downloadLog":
        return [{ kind: "action", id: "downloadLog", label: "Download Log", glyph: GLYPHS.download, onCommand: onDownloadLog }];
      case "buildSha":
        return [{ kind: "action", id: "buildSha", label: "Build SHA", glyph: GLYPHS.code, onCommand: onViewBuildSha }];
    }
  });

  return { actions: [...actions, ...builtInActions], loadState, status };
}

function buildLoadJourneyGroup(
  loadState: SavedJourneyLoadState,
  onOpen: () => void,
  onSelect: (summary: SavedJourneySummary) => void,
): CommandMenuGroup {
  return {
    kind: "group",
    id: "loadJourney",
    label: "Load Journey",
    glyph: GLYPHS.folderOpen,
    onOpen,
    actions: loadStateToActions(loadState, onSelect),
  };
}

function loadStateToActions(
  loadState: SavedJourneyLoadState,
  onSelect: (summary: SavedJourneySummary) => void,
): readonly CommandMenuItem[] {
  switch (loadState.kind) {
    case "idle":
      return [];
    case "loading":
      return [{ kind: "action", id: "loadJourney:loading", label: "Loading saved journeys…", glyph: GLYPHS.folderOpen, disabled: true, onCommand: NOOP }];
    case "error":
      return [{ kind: "action", id: "loadJourney:error", label: loadState.message, glyph: GLYPHS.warning, disabled: true, accent: "danger", onCommand: NOOP }];
    case "ready":
      return loadState.saves.length === 0
        ? [{ kind: "action", id: "loadJourney:empty", label: "No saved journeys.", glyph: GLYPHS.folderOpen, disabled: true, onCommand: NOOP }]
        : loadState.saves.map((save) => ({
            kind: "action" as const,
            id: `loadJourney:${save.name}`,
            label: `${save.name} — ${save.screenType} · ${formatSavedAt(save.savedAt)}`,
            glyph: GLYPHS.folderOpen,
            onCommand: () => onSelect(save),
          }));
  }
}

const NOOP = (): void => undefined;

/** App-shell inputs for {@link useJourneyUtilityMenuController}. */
export interface JourneyUtilityMenuControllerOptions {
  actions: readonly JourneyUtilityMenuAction[];
  builtIns: readonly JourneyUtilityMenuBuiltIn[];
  onLoadJourneyState?: (state: JourneyState, source: string) => void;
  saveSource: string;
  loadSource: string;
}

/**
 * Owns saved-journey persistence, logging, log download, build reporting, and
 * transient status timing. The returned view model has no presentation escape
 * hatch and is rendered by `CornerUtilityMenu` in app chrome.
 */
export function useJourneyUtilityMenuController({
  actions,
  builtIns,
  onLoadJourneyState,
  saveSource,
  loadSource,
}: JourneyUtilityMenuControllerOptions): JourneyUtilityMenuViewModel {
  const { state } = useJourney();
  const [loadState, setLoadState] = useState<SavedJourneyLoadState>({ kind: "idle" });
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

  async function handleSaveJourney(): Promise<void> {
    const entered = window.prompt('Save current journey as (reload with `npm run load-journey -- "<name>"`):');
    if (entered === null) return;
    const trimmed = entered.trim();
    if (trimmed === "") {
      flashStatus("Save cancelled: a name is required.");
      return;
    }
    try {
      const summary = await saveJourney(trimmed, state);
      logEvent("debug_journey_saved", { source: saveSource, name: summary.name, screen: summary.screenType });
      flashStatus(`Saved "${summary.name}".`);
    } catch (error) {
      flashStatus(error instanceof Error ? error.message : "Failed to save journey.");
    }
  }

  function handleOpenLoadMenu(): void {
    setLoadState({ kind: "loading" });
    void listSavedJourneys()
      .then((saves) => setLoadState({ kind: "ready", saves }))
      .catch((error: unknown) => setLoadState({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to list saved journeys.",
      }));
  }

  async function handleSelectLoad(summary: SavedJourneySummary): Promise<void> {
    if (onLoadJourneyState === undefined) {
      flashStatus("Loading is unavailable in this context.");
      return;
    }
    try {
      const loaded = await getSavedJourney(summary.name);
      if (loaded === null) {
        flashStatus(`Saved journey "${summary.name}" could not be found.`);
        return;
      }
      logEvent("debug_journey_loaded", { source: loadSource, name: summary.name, screen: loaded.screen?.type ?? "unknown" });
      onLoadJourneyState(loaded, loadSource);
      flashStatus(`Loaded "${summary.name}".`);
    } catch (error) {
      flashStatus(error instanceof Error ? error.message : "Failed to load journey.");
    }
  }

  return useMemo(() => buildJourneyUtilityMenuViewModel({
    actions,
    builtIns,
    canLoadJourney: onLoadJourneyState !== undefined,
    loadState,
    status,
    onSaveJourney: () => void handleSaveJourney(),
    onOpenLoadMenu: handleOpenLoadMenu,
    onSelectSavedJourney: (summary) => void handleSelectLoad(summary),
    onDownloadLog: downloadLog,
    onViewBuildSha: () => {
      logEvent("build_sha_viewed", { source: "dreamscape_menu", gitSha: BUILD_GIT_SHA });
      flashStatus(`Build Git SHA: ${BUILD_GIT_SHA}`);
    },
  }), [actions, builtIns, loadState, onLoadJourneyState, status]);
}

function formatSavedAt(savedAt: string): string {
  const parsed = new Date(savedAt);
  return Number.isNaN(parsed.getTime()) ? savedAt : parsed.toLocaleString();
}
