import { useCallback } from "react";
import { logEvent } from "../logging";
import type { FrontDoorMutations } from "./front-door-context";
import type { TutorialRunId } from "../types/identifiers";
import type { TutorialActionId } from "../types/identifiers";

/** Submit and log automatic completion of the currently presented tutorial action. */
export function useTutorialActionComplete(
  completeTutorialAction: FrontDoorMutations["completeTutorialAction"],
) {
  return useCallback(
    (runId: TutorialRunId, actionId: TutorialActionId): void => {
      logEvent("tutorial_action_completion_requested", { runId, actionId });
      void completeTutorialAction(runId, actionId).catch((error: unknown) => {
        logEvent("tutorial_action_completion_failed", {
          runId,
          actionId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [completeTutorialAction],
  );
}
