import { useEffect } from "react";
import { logEvent } from "../logging";
import { LoadingScreenAdapter } from "../screens/cumulus_adapters/LoadingScreenAdapter";
import { MainMenuScreenAdapter } from "../screens/cumulus_adapters/MainMenuScreenAdapter";
import { TutorialScreenAdapter } from "../screens/cumulus_adapters/TutorialScreenAdapter";
import { TutorialBattleScreenAdapter } from "../screens/cumulus_adapters/TutorialBattleScreenAdapter";
import { battleModeOf } from "../rules/battle/fold";
import { useFrontDoor } from "../state/front-door-context";

/** Reflects the room's shared front-door fold and renders its current scene. */
export function FrontDoorRouter({
  tutorialPlaybackSpeed = 1,
}: {
  readonly tutorialPlaybackSpeed?: number;
}) {
  const { state, battle } = useFrontDoor();

  useEffect(() => {
    const pathname =
      state.phase === "loading"
        ? "/loading"
        : state.phase === "tutorial"
          ? "/tutorial"
          : "/main";
    if (window.location.pathname === pathname) return;

    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${window.location.search}${window.location.hash}`,
    );
    logEvent("front_door_url_synced", {
      path: pathname,
      phase: state.phase,
      journeyId: state.journeyId,
    });
  }, [state.journeyId, state.phase]);

  if (state.phase === "loading") {
    return <LoadingScreenAdapter playbackSpeed={tutorialPlaybackSpeed} />;
  }
  if (state.phase === "tutorial") {
    if (battle !== null && battle !== undefined && battleModeOf(battle).kind === "tutorial") {
      return <TutorialBattleScreenAdapter />;
    }
    return <TutorialScreenAdapter playbackSpeed={tutorialPlaybackSpeed} />;
  }
  return <MainMenuScreenAdapter playbackSpeed={tutorialPlaybackSpeed} />;
}
