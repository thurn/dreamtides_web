// Journey utility-menu controller — app-shell state and effects for the shared
// Cumulus corner menu. It owns persistence, logging, and transient status;
// Cumulus owns every rendered menu surface and interaction detail.

import { useEffect, useMemo, useRef, useState } from "react";
import { logEvent } from "../logging";
import { BUILD_GIT_SHA } from "../runtime/build-info";
import { useLocalGameControls } from "../session/game-controls";
import {
  chooseJourneySaveFile,
  downloadJourneySaveFile,
  serializedJourneyScreenType,
} from "../state/journey-save-files";
import {
  useJourney,
  type JourneyMutationSource,
} from "../state/journey-context";
import type {
  CommandMenuAction,
  CommandMenuGroup,
  CommandMenuItem,
  CommandMenuStatusCopy,
} from "../cumulus/components/overlay/CommandMenu";
import { GLYPHS } from "../cumulus/primitives/glyph";

/** A route-supplied command that the journey utility menu may render. */
export type JourneyUtilityMenuAction = CommandMenuAction | CommandMenuGroup;

export type JourneyUtilityMenuBuiltIn =
  "saveJourney" | "loadJourney" | "exportLog" | "buildSha";

/** Plain command data supplied to the Cumulus corner utility-menu offering. */
export interface JourneyUtilityMenuViewModel {
  /** Root commands and groups, with named glyphs and semantic callbacks. */
  actions: readonly CommandMenuItem[];
  /** A transient result Cumulus presents beneath the trigger. */
  status: CommandMenuStatusCopy | null;
}

/** Inputs that wire journey-specific effects into the pure utility-menu model. */
export interface BuildJourneyUtilityMenuViewModelInput {
  actions: readonly JourneyUtilityMenuAction[];
  builtIns: readonly JourneyUtilityMenuBuiltIn[];
  canLoadJourney: boolean;
  /** Whether a local game is open, so its log can be exported. */
  canExportLog: boolean;
  status: CommandMenuStatusCopy | null;
  onSaveJourney: () => void;
  onLoadJourney: () => void;
  onExportLog: () => void;
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
  canExportLog,
  status,
  onSaveJourney,
  onLoadJourney,
  onExportLog,
  onViewBuildSha,
}: BuildJourneyUtilityMenuViewModelInput): JourneyUtilityMenuViewModel {
  const builtInActions = builtIns.flatMap(
    (builtIn): readonly CommandMenuItem[] => {
      switch (builtIn) {
        case "saveJourney":
          return [
            {
              kind: "action",
              id: "saveJourney",
              label: "Save Journey",
              glyph: GLYPHS.save,
              onCommand: onSaveJourney,
            },
          ];
        case "loadJourney":
          return canLoadJourney
            ? [
                {
                  kind: "action",
                  id: "loadJourney",
                  label: "Load Journey",
                  glyph: GLYPHS.folderOpen,
                  onCommand: onLoadJourney,
                },
              ]
            : [];
        case "exportLog":
          return canExportLog
            ? [
                {
                  kind: "action",
                  id: "exportLog",
                  label: "Export Log",
                  glyph: GLYPHS.download,
                  onCommand: onExportLog,
                },
              ]
            : [];
        case "buildSha":
          return [
            {
              kind: "action",
              id: "buildSha",
              label: "Build SHA",
              glyph: GLYPHS.code,
              onCommand: onViewBuildSha,
            },
          ];
      }
    },
  );

  return { actions: [...actions, ...builtInActions], status };
}

/** App-shell inputs for {@link useJourneyUtilityMenuController}. */
export interface JourneyUtilityMenuControllerOptions {
  actions: readonly JourneyUtilityMenuAction[];
  builtIns: readonly JourneyUtilityMenuBuiltIn[];
  onLoadJourneyState?: (
    state: unknown,
    source: JourneyMutationSource,
  ) => void;
  saveSource: JourneyMutationSource;
  loadSource: JourneyMutationSource;
}

/**
 * Owns saved-journey persistence, logging, game-log export, build reporting, and
 * transient status timing. The returned view model has no presentation escape
 * hatch and is rendered by `CommandMenu` in app chrome.
 */
export function useJourneyUtilityMenuController({
  actions,
  builtIns,
  onLoadJourneyState,
  saveSource,
  loadSource,
}: JourneyUtilityMenuControllerOptions): JourneyUtilityMenuViewModel {
  const { state } = useJourney();
  const gameControls = useLocalGameControls();
  const [status, setStatus] = useState<CommandMenuStatusCopy | null>(null);
  const statusTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (statusTimerRef.current !== null) clearTimeout(statusTimerRef.current);
    },
    [],
  );

  function flashStatus(copy: CommandMenuStatusCopy): void {
    setStatus(copy);
    if (statusTimerRef.current !== null) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => {
      setStatus(null);
      statusTimerRef.current = null;
    }, 4000);
  }

  function handleSaveJourney(): void {
    const entered = window.prompt(
      "Save current journey as:",
    );
    if (entered === null) return;
    const trimmed = entered.trim();
    if (trimmed === "") {
      flashStatus(
        "Save cancelled: a name is required.",
      );
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
      flashStatus(
        `Downloaded "${fileName}".`,
      );
    } catch (error) {
      logEvent("debug_journey_save_failed", {
        source: saveSource,
        errorKind: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : null,
      });
      flashStatus(
        "Failed to save journey.",
      );
    }
  }

  async function handleLoadJourney(): Promise<void> {
    if (onLoadJourneyState === undefined) {
      flashStatus(
        "Loading is unavailable in this context.",
      );
      return;
    }
    try {
      const loaded = await chooseJourneySaveFile();
      if (loaded === null) return;
      logEvent("debug_journey_loaded", {
        source: loadSource,
        name: loaded.name,
        screen: serializedJourneyScreenType(loaded.journeyState),
        fileName: loaded.fileName,
        buildGitSha: loaded.buildGitSha,
      });
      onLoadJourneyState(loaded.journeyState, loadSource);
      flashStatus(
        `Loaded "${loaded.name}".`,
      );
    } catch (error) {
      logEvent("debug_journey_load_failed", {
        source: loadSource,
        errorKind: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : null,
      });
      flashStatus(
        "Failed to load journey.",
      );
    }
  }

  function handleExportLog(): void {
    if (gameControls === null) return;
    gameControls.exportLog({ source: "game_menu" }).then(
      () => flashStatus("Game log downloaded."),
      () => flashStatus("Failed to export the game log."),
    );
  }

  return useMemo(
    () =>
      buildJourneyUtilityMenuViewModel({
        actions,
        builtIns,
        canLoadJourney: onLoadJourneyState !== undefined,
        canExportLog: gameControls !== null,
        status,
        onSaveJourney: handleSaveJourney,
        onLoadJourney: () => void handleLoadJourney(),
        onExportLog: handleExportLog,
        onViewBuildSha: () => {
          logEvent("build_sha_viewed", {
            source: "dreamscape_menu",
            gitSha: BUILD_GIT_SHA,
          });
          flashStatus(
            `Build Git SHA: ${BUILD_GIT_SHA}`,
          );
        },
      }),
    [actions, builtIns, gameControls, onLoadJourneyState, status],
  );
}
