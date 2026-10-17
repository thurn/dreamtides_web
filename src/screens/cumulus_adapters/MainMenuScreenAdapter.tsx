import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MainMenuScreen,
  type MainMenuActionId,
  type MainMenuSocialId,
} from "../../cumulus/screens/MainMenuScreen";
import { logEvent } from "../../logging";
import { useFrontDoor } from "../../state/front-door-context";
import { buildMainMenuView } from "./main-menu-view-model";
import { parseFrontDoorActionId, type GameId } from "../../types/identifiers";
import { useGameSwitch } from "../../session/game-switch";

/**
 * Game-log-backed `/main` wiring, including its cinematic New Journey
 * transition and the Dreamtides 97 entries, which switch to a D97 game.
 */
export function MainMenuScreenAdapter({
  playbackSpeed = 1,
}: {
  readonly playbackSpeed?: number;
}) {
  const hasLoggedPresentation = useRef(false);
  const { state, mutations } = useFrontDoor();
  const gameSwitch = useGameSwitch();
  // The stored D97 run Continue opens; null hides Continue.
  const [recentD97Run, setRecentD97Run] = useState<GameId | null>(null);
  useEffect(() => {
    if (gameSwitch === null) return;
    let current = true;
    void gameSwitch.findRecentD97Run().then(
      (gameId) => {
        if (current) setRecentD97Run(gameId);
      },
      (error: unknown) => {
        console.error("D97 run lookup failed", error);
      },
    );
    return () => {
      current = false;
    };
  }, [gameSwitch]);
  const view = useMemo(
    () => buildMainMenuView({ d97ContinueAvailable: recentD97Run !== null }),
    [recentD97Run],
  );

  useEffect(() => {
    if (hasLoggedPresentation.current) return;
    hasLoggedPresentation.current = true;
    logEvent("main_menu_presented", {
      actionIds: view.actions.map((action) => action.id),
      socialIds: view.socials.map((social) => social.id),
      tutorialPlaybackSpeed: playbackSpeed,
    });
  }, [playbackSpeed, view]);

  const handleAction = useCallback(
    (actionId: MainMenuActionId) => {
      logEvent("main_menu_action_pressed", { actionId });
      if (actionId === "d97-new-run") {
        gameSwitch?.startD97Run({ source: "main_menu" });
        return;
      }
      if (actionId === "d97-continue") {
        if (recentD97Run !== null) {
          gameSwitch?.continueD97Run({ source: "main_menu" }, recentD97Run);
        }
        return;
      }
      if (actionId !== "new-journey") return;
      void mutations
        .action("main", parseFrontDoorActionId(actionId))
        .catch((error: unknown) => {
          console.error("Main-menu action failed", error);
        });
    },
    [gameSwitch, mutations, recentD97Run],
  );

  const handleSocial = useCallback(
    (socialId: MainMenuSocialId) => {
      logEvent("main_menu_social_pressed", { socialId });
    },
    [],
  );

  const handleExitComplete = useCallback(() => {
    if (state.phase !== "mainExiting" || state.journeyId === null) return;
    void mutations
      .advance("mainExiting", state.journeyId)
      .catch((error: unknown) => {
        console.error("Main-menu transition failed", error);
      });
  }, [mutations, state.journeyId, state.phase]);

  return (
    <MainMenuScreen
      view={view}
      onAction={handleAction}
      onSocial={handleSocial}
      transitionPhase={state.phase === "mainExiting" ? "exiting" : "visible"}
      onExitComplete={handleExitComplete}
      playbackSpeed={playbackSpeed}
    />
  );
}
