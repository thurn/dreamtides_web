import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadTutorialActions,
  parseTutorialActions,
} from "../data/tutorial-actions";
import { saveTutorialActions } from "../data/tutorial-editor-api";
import { logEvent } from "../logging";
import type {
  BeginTutorialOptions,
  TutorialAction,
  TutorialEditorSaveStatus,
} from "../types/tutorial";

export interface TutorialEditorState {
  readonly actions: readonly TutorialAction[];
  readonly loaded: boolean;
  readonly saveStatus: TutorialEditorSaveStatus;
  readonly saveError: string | null;
  readonly onActionsChange: (
    actions: readonly TutorialAction[],
    persist: boolean,
  ) => void;
}

/** Build the replay callback around the latest unsaved editor draft. */
export function useTutorialReplay(
  actions: readonly TutorialAction[],
  beginTutorial: (
    actions: readonly TutorialAction[],
    options?: BeginTutorialOptions,
  ) => Promise<number>,
): (startActionId?: string) => void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  return useCallback(
    (startActionId?: string): void => {
      let normalized: readonly TutorialAction[];
      try {
        normalized = parseTutorialActions(actionsRef.current);
      } catch (error) {
        logEvent("tutorial_replay_failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      const startActionIndex =
        startActionId === undefined
          ? normalized.length === 0
            ? null
            : 0
          : normalized.findIndex((action) => action.id === startActionId);
      if (startActionIndex === -1) {
        logEvent("tutorial_replay_failed", {
          message: `Tutorial action ${JSON.stringify(startActionId)} was not found.`,
        });
        return;
      }
      logEvent("tutorial_replay_requested", {
        actionCount: normalized.length,
        actionIds: normalized.map((action) => action.id),
        startActionId: startActionId ?? null,
        startActionIndex,
      });
      void beginTutorial(
        normalized,
        startActionId === undefined ? undefined : { startActionId },
      ).catch((error: unknown) => {
        logEvent("tutorial_replay_failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [beginTutorial],
  );
}

/** Own local tutorial authoring drafts and serialize filesystem saves. */
export function useTutorialEditor(): TutorialEditorState {
  const [actions, setActions] = useState<readonly TutorialAction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] =
    useState<TutorialEditorSaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const newestSaveSerial = useRef(0);

  useEffect(() => {
    if (saveStatus !== "saved") return undefined;
    const timeout = window.setTimeout(() => setSaveStatus("idle"), 1_500);
    return () => window.clearTimeout(timeout);
  }, [saveStatus]);

  useEffect(() => {
    let cancelled = false;
    void loadTutorialActions().then(
      (next) => {
        if (cancelled) return;
        setActions(next);
        setLoaded(true);
        logEvent("tutorial_actions_loaded", {
          actionCount: next.length,
          actionIds: next.map((action) => action.id),
        });
      },
      (error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setLoaded(false);
        setSaveStatus("error");
        setSaveError(message);
        logEvent("tutorial_actions_load_failed", { message });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const onActionsChange = useCallback(
    (next: readonly TutorialAction[], persist: boolean): void => {
      setActions(next);
      if (!persist) return;
      let normalized: readonly TutorialAction[];
      try {
        normalized = parseTutorialActions(next);
      } catch (error) {
        setSaveStatus("error");
        setSaveError(error instanceof Error ? error.message : String(error));
        return;
      }
      newestSaveSerial.current += 1;
      const serial = newestSaveSerial.current;
      setSaveStatus("saving");
      setSaveError(null);
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          const result = await saveTutorialActions(normalized);
          if (serial !== newestSaveSerial.current) return;
          setActions(result.actions);
          setSaveStatus("saved");
          setSaveError(null);
          logEvent("tutorial_actions_saved", {
            actionCount: result.actions.length,
            actionIds: result.actions.map((action) => action.id),
          });
        })
        .catch((error: unknown) => {
          if (serial !== newestSaveSerial.current) return;
          const message =
            error instanceof Error ? error.message : String(error);
          setSaveStatus("error");
          setSaveError(message);
          logEvent("tutorial_actions_save_failed", { message });
        });
    },
    [],
  );

  return { actions, loaded, saveStatus, saveError, onActionsChange };
}
