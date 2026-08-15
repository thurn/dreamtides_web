// Journey utility-menu controller — app-shell state and effects for the shared
// Cumulus corner menu. It owns persistence, logging, and transient status;
// Cumulus owns every rendered menu surface and interaction detail.

import { useEffect, useMemo, useRef, useState } from "react";
import { downloadLog, logEvent } from "../logging";
import { BUILD_GIT_SHA } from "../runtime/build-info";
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
import { tx, txa } from "@trox/runtime";
import { useLocalizer } from "../runtime/localization/use-localizer";

/** A route-supplied command that the journey utility menu may render. */
export type JourneyUtilityMenuAction = CommandMenuAction | CommandMenuGroup;

export type JourneyUtilityMenuBuiltIn =
  "saveJourney" | "loadJourney" | "downloadLog" | "buildSha";

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
  status: CommandMenuStatusCopy | null;
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
  const builtInActions = builtIns.flatMap(
    (builtIn): readonly CommandMenuItem[] => {
      switch (builtIn) {
        case "saveJourney":
          return [
            {
              kind: "action",
              id: "saveJourney",
              label: tx(
                "Save Journey",
                "[journey] Command in the Journey utility menu that downloads the current journey as a save file.",
              ),
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
                  label: tx(
                    "Load Journey",
                    "[journey] Command in the Journey utility menu that imports a Journey save file.",
                  ),
                  glyph: GLYPHS.folderOpen,
                  onCommand: onLoadJourney,
                },
              ]
            : [];
        case "downloadLog":
          return [
            {
              kind: "action",
              id: "downloadLog",
              label: tx(
                "Download Log",
                "[journey] [developer] Command in the Journey utility menu that downloads the diagnostic Journey log.",
              ),
              glyph: GLYPHS.download,
              onCommand: onDownloadLog,
            },
          ];
        case "buildSha":
          return [
            {
              kind: "action",
              id: "buildSha",
              label: tx(
                "Build SHA",
                "[journey] Command in the Journey utility menu that displays the current build identifier.",
              ),
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
 * Owns saved-journey persistence, logging, log download, build reporting, and
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
  const resolve = useLocalizer();
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
      resolve(
        tx(
          "Save current journey as:",
          "[journey] Native browser prompt text for naming a downloaded Journey save. The prompt is visible before the file is created and asks for the player's authored name.",
        ),
      ),
    );
    if (entered === null) return;
    const trimmed = entered.trim();
    if (trimmed === "") {
      flashStatus(
        tx(
          "Save cancelled: a name is required.",
          "[journey] Transient status after the player submits an empty Journey save name.",
        ),
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
        txa(
          'Downloaded "{file_name}".',
          { file_name: fileName },
          "[journey] Transient status after a Journey save download. file_name is a generated filename and remains an opaque technical value.",
        ),
      );
    } catch (error) {
      logEvent("debug_journey_save_failed", {
        source: saveSource,
        errorKind: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : null,
      });
      flashStatus(
        tx(
          "Failed to save journey.",
          "[journey] Transient status when a Journey save fails.",
        ),
      );
    }
  }

  async function handleLoadJourney(): Promise<void> {
    if (onLoadJourneyState === undefined) {
      flashStatus(
        tx(
          "Loading is unavailable in this context.",
          "[journey] [loading] Transient status when Journey loading is unavailable in the current route context.",
        ),
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
        txa(
          'Loaded "{save_name}".',
          { save_name: loaded.name },
          "[journey] Transient status after a Journey save is imported. save_name is the player's authored save name and remains grammatically opaque.",
        ),
      );
    } catch (error) {
      logEvent("debug_journey_load_failed", {
        source: loadSource,
        errorKind: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : null,
      });
      flashStatus(
        tx(
          "Failed to load journey.",
          "[journey] Transient status when a Journey load fails.",
        ),
      );
    }
  }

  return useMemo(
    () =>
      buildJourneyUtilityMenuViewModel({
        actions,
        builtIns,
        canLoadJourney: onLoadJourneyState !== undefined,
        status,
        onSaveJourney: handleSaveJourney,
        onLoadJourney: () => void handleLoadJourney(),
        onDownloadLog: downloadLog,
        onViewBuildSha: () => {
          logEvent("build_sha_viewed", {
            source: "dreamscape_menu",
            gitSha: BUILD_GIT_SHA,
          });
          flashStatus(
            txa(
              "Build Git SHA: {git_sha}",
              { git_sha: BUILD_GIT_SHA },
              "[ui] Transient status after the player requests the current build identifier. git_sha is an opaque technical build identifier.",
            ),
          );
        },
      }),
    [actions, builtIns, onLoadJourneyState, status, resolve],
  );
}
