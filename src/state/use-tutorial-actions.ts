import { useEffect, useState } from "react";
import { loadTutorialActions } from "../data/tutorial-actions";
import { logEvent } from "../logging";
import type { TutorialAction } from "../types/tutorial";

export interface TutorialActionsState {
  readonly actions: readonly TutorialAction[];
  readonly loaded: boolean;
}

/** Load the authored tutorial sequence once for playback. */
export function useTutorialActions(): TutorialActionsState {
  const [state, setState] = useState<TutorialActionsState>({
    actions: [],
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    void loadTutorialActions().then(
      (actions) => {
        if (cancelled) return;
        setState({ actions, loaded: true });
        logEvent("tutorial_actions_loaded", {
          actionCount: actions.length,
          actionIds: actions.map((action) => action.id),
        });
      },
      (error: unknown) => {
        if (cancelled) return;
        logEvent("tutorial_actions_load_failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
