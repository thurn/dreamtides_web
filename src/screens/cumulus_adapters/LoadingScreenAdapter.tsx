import { useEffect, useMemo, useRef } from "react";
import { LoadingScreen } from "../../cumulus/screens/LoadingScreen";
import { logEvent } from "../../logging";
import { LOADING_SCREEN_DURATION_MS } from "../../runtime/front-door-timing";
import { useFrontDoor } from "../../state/front-door-context";
import { useJourney } from "../../state/journey-context";
import { buildLoadingView } from "./loading-view-model";

/** Coop-backed `/loading` wiring and presentation logging. */
export function LoadingScreenAdapter({
  playbackSpeed = 1,
}: {
  readonly playbackSpeed?: number;
}) {
  const hasLoggedPresentation = useRef(false);
  const { state, mutations } = useFrontDoor();
  const { cardDatabase } = useJourney();
  const source = state.journeyId?.startsWith("event:") ? "main_menu" : "direct";
  const view = useMemo(() => buildLoadingView(cardDatabase), [cardDatabase]);

  useEffect(() => {
    if (hasLoggedPresentation.current) return;
    hasLoggedPresentation.current = true;
    logEvent("loading_screen_presented", {
      source,
      tutorialPlaybackSpeed: playbackSpeed,
    });
  }, [playbackSpeed, source, view]);

  useEffect(() => {
    if (state.phase !== "loading" || state.journeyId === null) {
      return undefined;
    }
    const journeyId = state.journeyId;
    const timeout = window.setTimeout(() => {
      void mutations.advance("loading", journeyId).catch((error: unknown) => {
        console.error("Coop loading transition failed", error);
      });
    }, LOADING_SCREEN_DURATION_MS / playbackSpeed);
    return () => window.clearTimeout(timeout);
  }, [mutations, playbackSpeed, state.journeyId, state.phase]);

  return <LoadingScreen view={view} playbackSpeed={playbackSpeed} />;
}
