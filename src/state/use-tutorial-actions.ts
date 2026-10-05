import { useEffect, useMemo } from "react";
import { loadTutorialActions } from "../data/tutorial-actions";
import { logEvent } from "../logging";
import type { TutorialAction } from "../types/tutorial";

/** The authored tutorial sequence for playback. */
export function useTutorialActions(): readonly TutorialAction[] {
  const actions = useMemo(loadTutorialActions, []);
  useEffect(() => {
    logEvent("tutorial_actions_loaded", {
      actionCount: actions.length,
      actionIds: actions.map((action) => action.id),
    });
  }, [actions]);
  return actions;
}
