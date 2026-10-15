import { useGameState } from "../session/hooks";
import { JourneyStarterPurgeScreenAdapter } from "../screens/cumulus_adapters/JourneyStarterPurgeScreenAdapter";
import { JourneyDreamsignScreenAdapter } from "../screens/cumulus_adapters/JourneyDreamsignScreenAdapter";
import { CumulusJourneyChrome } from "./CumulusJourneyChrome";
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

/** Reflects the game's shared front-door fold and renders its current scene. */
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
  const screen = useGameState().journey.screen;

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

  const copyChoice = screen.type === "journeyDreamsign" && (screen.choice.kind === "copy" || screen.choice.kind === "typeRemap" || screen.choice.kind === "subtype" || screen.choice.kind === "openingHand") && state.phase === "tutorial" ? screen.choice : null;
  const starterChoice = screen.type === "journeyStarterPurge" && state.phase === "tutorial" ? screen.choice : null;
  const content =
    copyChoice !== null ? (
      <CumulusJourneyChrome><JourneyDreamsignScreenAdapter /></CumulusJourneyChrome>
    ) : starterChoice !== null ? (
      <CumulusJourneyChrome><JourneyStarterPurgeScreenAdapter /></CumulusJourneyChrome>
    ) : state.phase === "loading" ? (
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
      resetKey={`${state.phase}:${state.journeyId ?? "none"}${copyChoice === null ? "" : `:copy:${String(copyChoice.permissionSeq)}:${String(copyChoice.kind === "subtype" ? copyChoice.resume.sourceIndex : copyChoice.index)}`}${starterChoice === null ? "" : `:starter:${String(starterChoice.permissionSeq)}:${String(starterChoice.index)}`}`}
    >
      {content}
    </ErrorBoundary>
  );
}
