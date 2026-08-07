import { useCallback, useEffect, useMemo, useRef } from "react";
import { LoadingScreen } from "../../cumulus/screens/LoadingScreen";
import { logEvent } from "../../logging";
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
  const { journeyContent } = useJourney();
  const { cardDatabase } = journeyContent;
  const featuredCards = journeyContent.tutorial?.battle.featuredCards;
  if (featuredCards === undefined) {
    throw new Error("Tutorial loading configuration is missing.");
  }
  const source = state.journeyId?.startsWith("event:") ? "main_menu" : "direct";
  const view = useMemo(
    () => buildLoadingView(cardDatabase, featuredCards),
    [cardDatabase, featuredCards],
  );

  useEffect(() => {
    if (hasLoggedPresentation.current) return;
    hasLoggedPresentation.current = true;
    logEvent("loading_screen_presented", {
      source,
      tutorialPlaybackSpeed: playbackSpeed,
    });
  }, [playbackSpeed, source, view]);

  const handleBegin = useCallback(() => {
    if (state.phase !== "loading" || state.journeyId === null) {
      return;
    }
    const journeyId = state.journeyId;
    logEvent("loading_begin_pressed", {
      source,
      tutorialPlaybackSpeed: playbackSpeed,
    });
    void mutations.advance("loading", journeyId).catch((error: unknown) => {
      console.error("Coop loading transition failed", error);
    });
  }, [mutations, playbackSpeed, source, state.journeyId, state.phase]);

  return (
    <LoadingScreen
      view={view}
      playbackSpeed={playbackSpeed}
      onBegin={handleBegin}
    />
  );
}
