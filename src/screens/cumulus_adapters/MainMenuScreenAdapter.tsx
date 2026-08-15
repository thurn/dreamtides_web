import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  MainMenuScreen,
  type MainMenuActionId,
  type MainMenuSocialId,
} from "../../cumulus/screens/MainMenuScreen";
import { logEvent } from "../../logging";
import { useFrontDoor } from "../../state/front-door-context";
import { buildMainMenuView } from "./main-menu-view-model";
import { parseFrontDoorActionId } from "../../types/identifiers";

/** Coop-backed `/main` wiring, including its cinematic New Journey transition. */
export function MainMenuScreenAdapter({
  playbackSpeed = 1,
}: {
  readonly playbackSpeed?: number;
}) {
  const hasLoggedPresentation = useRef(false);
  const { state, mutations } = useFrontDoor();
  const view = useMemo(() => buildMainMenuView(), []);

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
      void mutations
        .action("main", parseFrontDoorActionId(actionId))
        .catch((error: unknown) => {
          console.error("Coop main-menu action failed", error);
        });
    },
    [mutations],
  );

  const handleSocial = useCallback(
    (socialId: MainMenuSocialId) => {
      logEvent("main_menu_social_pressed", { socialId });
      void mutations
        .action("main", parseFrontDoorActionId(socialId))
        .catch((error: unknown) => {
          console.error("Coop main-menu social action failed", error);
        });
    },
    [mutations],
  );

  const handleExitComplete = useCallback(() => {
    if (state.phase !== "mainExiting" || state.journeyId === null) return;
    void mutations
      .advance("mainExiting", state.journeyId)
      .catch((error: unknown) => {
        console.error("Coop main-menu transition failed", error);
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
