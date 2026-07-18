import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadingScreen } from "../../cumulus/screens/LoadingScreen";
import {
  MainMenuScreen,
  type MainMenuActionId,
  type MainMenuSocialId,
} from "../../cumulus/screens/MainMenuScreen";
import { logEvent } from "../../logging";
import { buildLoadingView } from "./loading-view-model";
import { buildMainMenuView } from "./main-menu-view-model";

/** Standalone `/main` wiring, including its cinematic New Journey transition. */
export function MainMenuScreenAdapter() {
  const hasLoggedPresentation = useRef(false);
  const hasCompletedJourneyTransition = useRef(false);
  const [activeScreen, setActiveScreen] = useState<"main" | "loading">("main");
  const [transitionPhase, setTransitionPhase] = useState<
    "visible" | "exiting"
  >("visible");
  const view = useMemo(() => buildMainMenuView(), []);
  const loadingView = useMemo(() => buildLoadingView(), []);

  useEffect(() => {
    if (hasLoggedPresentation.current) return;
    hasLoggedPresentation.current = true;
    logEvent("main_menu_presented", {
      actionIds: view.actions.map((action) => action.id),
      socialIds: view.socials.map((social) => social.id),
    });
  }, [view]);

  const handleAction = useCallback((actionId: MainMenuActionId) => {
    logEvent("main_menu_action_pressed", { actionId });
    if (actionId === "new-journey") setTransitionPhase("exiting");
  }, []);

  const handleSocial = useCallback((socialId: MainMenuSocialId) => {
    logEvent("main_menu_social_pressed", { socialId });
  }, []);

  const handleExitComplete = useCallback(() => {
    if (hasCompletedJourneyTransition.current) return;
    hasCompletedJourneyTransition.current = true;
    window.history.pushState(
      null,
      "",
      `/loading${window.location.search}${window.location.hash}`,
    );
    logEvent("loading_screen_presented", {
      source: "main_menu",
      attribution: loadingView.attribution,
    });
    setActiveScreen("loading");
  }, [loadingView]);

  if (activeScreen === "loading") {
    return <LoadingScreen view={loadingView} />;
  }

  return (
    <MainMenuScreen
      view={view}
      onAction={handleAction}
      onSocial={handleSocial}
      transitionPhase={transitionPhase}
      onExitComplete={handleExitComplete}
    />
  );
}
