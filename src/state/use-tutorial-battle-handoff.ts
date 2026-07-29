import { useEffect, useRef } from "react";
import { logEvent } from "../logging";
import type { TutorialPlaybackState } from "../types/tutorial";

/** Appends the durable tutorial-battle handoff after the shared cursor settles. */
export function useTutorialBattleHandoff(
  tutorial: TutorialPlaybackState | null,
  beginTutorialBattle: ((tutorialRunId: string) => Promise<number>) | undefined,
): void {
  const requestedKey = useRef<string | null>(null);
  useEffect(() => {
    if (
      tutorial === null ||
      tutorial.currentActionIndex !== null ||
      beginTutorialBattle === undefined
    ) return;
    const intentKey = `tutorial-battle:${tutorial.runId}:begin`;
    if (requestedKey.current === intentKey) return;
    requestedKey.current = intentKey;
    logEvent("tutorial_battle_handoff_requested", {
      tutorialRunId: tutorial.runId,
      source: "tutorial-terminal-cursor",
    });
    void beginTutorialBattle(tutorial.runId).catch(() => {
      requestedKey.current = null;
    });
  }, [beginTutorialBattle, tutorial]);
}
