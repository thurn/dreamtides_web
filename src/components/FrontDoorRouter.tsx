import { useEffect, type ReactNode } from "react";
import { logEvent } from "../logging";
import { LoadingScreenAdapter } from "../screens/cumulus_adapters/LoadingScreenAdapter";
import { MainMenuScreenAdapter } from "../screens/cumulus_adapters/MainMenuScreenAdapter";
import { TutorialScreenAdapter } from "../screens/cumulus_adapters/TutorialScreenAdapter";
import { TutorialBattleScreenAdapter } from "../screens/cumulus_adapters/TutorialBattleScreenAdapter";
import { battleModeOf } from "../rules/battle/fold";
import { useFrontDoor } from "../state/front-door-context";
import type { DreamAvatarContent } from "../types/content";

/** Reflects the room's shared front-door fold and renders its current scene. */
export function FrontDoorRouter({
  dreamAvatars,
  tutorialPlaybackSpeed = 1,
  directTutorialBattle = false,
  previewTutorialVictory = false,
  journey = null,
}: {
  readonly dreamAvatars: readonly DreamAvatarContent[];
  readonly tutorialPlaybackSpeed?: number;
  readonly directTutorialBattle?: boolean;
  readonly previewTutorialVictory?: boolean;
  readonly journey?: ReactNode;
}) {
  const { state, battle } = useFrontDoor();

  useEffect(() => {
    if (state.phase === "journey") return;
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

  if (state.phase === "journey") {
    return journey;
  }

  if (state.phase === "loading") {
    return <LoadingScreenAdapter playbackSpeed={tutorialPlaybackSpeed} />;
  }
  if (state.phase === "tutorial") {
    if (
      battle !== null &&
      battle !== undefined &&
      battleModeOf(battle).kind === "tutorial"
    ) {
      return (
        <TutorialBattleScreenAdapter
          previewVictory={previewTutorialVictory}
        />
      );
    }
    return (
      <TutorialScreenAdapter
        dreamAvatars={dreamAvatars}
        playbackSpeed={tutorialPlaybackSpeed}
        directLive={directTutorialBattle || previewTutorialVictory}
      />
    );
  }
  return <MainMenuScreenAdapter playbackSpeed={tutorialPlaybackSpeed} />;
}
