import { useEffect, type ReactNode } from "react";
import { logEvent } from "../logging";
import { LoadingScreenAdapter } from "../screens/cumulus_adapters/LoadingScreenAdapter";
import { MainMenuScreenAdapter } from "../screens/cumulus_adapters/MainMenuScreenAdapter";
import { TutorialScreenAdapter } from "../screens/cumulus_adapters/TutorialScreenAdapter";
import { TutorialBattleScreenAdapter } from "../screens/cumulus_adapters/TutorialBattleScreenAdapter";
import { battleModeOf } from "../rules/battle/fold";
import { useFrontDoor } from "../state/front-door-context";
import type { AvatarContent } from "../types/content";
import { ErrorBoundary } from "./ErrorBoundary";
import { RecoveryCheckpointCommitter } from "../coop/RecoveryCheckpointCommitter";

/** Reflects the room's shared front-door fold and renders its current scene. */
export function FrontDoorRouter({
  avatars,
  tutorialPlaybackSpeed = 1,
  directTutorialBattle = false,
  previewTutorialVictory = false,
  journey = null,
}: {
  readonly avatars: readonly AvatarContent[];
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

  const path =
    state.phase === "loading"
      ? "/loading"
      : state.phase === "tutorial"
        ? "/tutorial"
        : "/main";
  const content =
    state.phase === "loading" ? (
      <LoadingScreenAdapter playbackSpeed={tutorialPlaybackSpeed} />
    ) : state.phase === "tutorial" &&
      battle !== null &&
      battle !== undefined &&
      battleModeOf(battle).kind === "tutorial" ? (
      <TutorialBattleScreenAdapter previewVictory={previewTutorialVictory} />
    ) : state.phase === "tutorial" ? (
      <TutorialScreenAdapter
        avatars={avatars}
        playbackSpeed={tutorialPlaybackSpeed}
        directLive={directTutorialBattle || previewTutorialVictory}
      />
    ) : (
      <MainMenuScreenAdapter playbackSpeed={tutorialPlaybackSpeed} />
    );

  return (
    <ErrorBoundary
      scope={`screen:front-door:${state.phase}`}
      resetKey={`${state.phase}:${state.journeyId ?? "none"}`}
    >
      {content}
      <RecoveryCheckpointCommitter sourcePath={path} />
    </ErrorBoundary>
  );
}
