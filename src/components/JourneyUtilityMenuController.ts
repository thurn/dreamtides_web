// Journey utility-menu controller — app-shell state and effects for the shared
// Cumulus corner menu. It owns persistence, logging, and transient status;
// Cumulus owns every rendered menu surface and interaction detail.

import { useEffect, useMemo, useRef, useState } from "react";
import { downloadLog, logEvent } from "../logging";
import { BUILD_GIT_SHA } from "../runtime/build-info";
import {
  chooseJourneySaveFile,
  downloadJourneySaveFile,
} from "../state/journey-save-files";
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

/** Plain command data supplied to the Cumulus corner utility-menu offering. */
export interface JourneyUtilityMenuViewModel {
  /** Root commands and groups, with named glyphs and semantic callbacks. */
  actions: readonly CommandMenuItem[];
  /** A transient result Cumulus presents beneath the trigger. */
  status: string | null;
}

/** Inputs that wire journey-specific effects into the pure utility-menu model. */
export interface BuildJourneyUtilityMenuViewModelInput {
  actions: readonly JourneyUtilityMenuAction[];
  builtIns: readonly JourneyUtilityMenuBuiltIn[];
  canLoadJourney: boolean;
  status: string | null;
  onSaveJourney: () => void;
  onLoadJourney: () => void;
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
  status,
  onSaveJourney,
  onLoadJourney,
  onDownloadLog,
  onViewBuildSha,
}: BuildJourneyUtilityMenuViewModelInput): JourneyUtilityMenuViewModel {
  const builtInActions = builtIns.flatMap((builtIn): readonly CommandMenuItem[] => {
    switch (builtIn) {
      case "saveJourney":
        return [{ kind: "action", id: "saveJourney", label: "Save Journey", glyph: GLYPHS.save, onCommand: onSaveJourney }];
      case "loadJourney":
        return canLoadJourney
          ? [{ kind: "action", id: "loadJourney", label: "Load Journey", glyph: GLYPHS.folderOpen, onCommand: onLoadJourney }]
          : [];
      case "downloadLog":
        return [{ kind: "action", id: "downloadLog", label: "Download Log", glyph: GLYPHS.download, onCommand: onDownloadLog }];
      case "buildSha":
        return [{ kind: "action", id: "buildSha", label: "Build SHA", glyph: GLYPHS.code, onCommand: onViewBuildSha }];
    }
  });

  return { actions: [...actions, ...builtInActions], status };
}

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

  function handleSaveJourney(): void {
    const entered = window.prompt("Save current journey as:");
    if (entered === null) return;
    const trimmed = entered.trim();
    if (trimmed === "") {
      flashStatus("Save cancelled: a name is required.");
      return;
    }
    try {
      const { fileName, save } = downloadJourneySaveFile(trimmed, state);
      logEvent("debug_journey_saved", {
        source: saveSource,
        name: save.name,
        screen: save.journeyState.screen.type,
        fileName,
        formatVersion: save.version,
      });
      flashStatus(`Downloaded "${fileName}".`);
    } catch (error) {
      flashStatus(error instanceof Error ? error.message : "Failed to save journey.");
    }
  }

  async function handleLoadJourney(): Promise<void> {
    if (onLoadJourneyState === undefined) {
      flashStatus("Loading is unavailable in this context.");
      return;
    }
    try {
      const loaded = await chooseJourneySaveFile();
      if (loaded === null) return;
      logEvent("debug_journey_loaded", {
        source: loadSource,
        name: loaded.name,
        screen: loaded.journeyState.screen?.type ?? "unknown",
        fileName: loaded.fileName,
        buildGitSha: loaded.buildGitSha,
      });
      onLoadJourneyState(loaded.journeyState, loadSource);
      flashStatus(`Loaded "${loaded.name}".`);
    } catch (error) {
      flashStatus(error instanceof Error ? error.message : "Failed to load journey.");
    }
  }

  return useMemo(() => buildJourneyUtilityMenuViewModel({
    actions,
    builtIns,
    canLoadJourney: onLoadJourneyState !== undefined,
    status,
    onSaveJourney: handleSaveJourney,
    onLoadJourney: () => void handleLoadJourney(),
    onDownloadLog: downloadLog,
    onViewBuildSha: () => {
      logEvent("build_sha_viewed", { source: "dreamscape_menu", gitSha: BUILD_GIT_SHA });
      flashStatus(`Build Git SHA: ${BUILD_GIT_SHA}`);
    },
  }), [actions, builtIns, onLoadJourneyState, status]);
}
