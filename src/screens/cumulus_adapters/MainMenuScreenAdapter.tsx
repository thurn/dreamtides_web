import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  MainMenuScreen,
  type MainMenuActionId,
  type MainMenuSocialId,
} from "../../cumulus/screens/MainMenuScreen";
import { logEvent } from "../../logging";
import { buildMainMenuView } from "./main-menu-view-model";

/** Standalone `/main` wiring: structured logging around intentionally inert actions. */
export function MainMenuScreenAdapter() {
  const hasLoggedPresentation = useRef(false);
  const view = useMemo(() => buildMainMenuView(), []);

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
  }, []);

  const handleSocial = useCallback((socialId: MainMenuSocialId) => {
    logEvent("main_menu_social_pressed", { socialId });
  }, []);

  return (
    <MainMenuScreen
      view={view}
      onAction={handleAction}
      onSocial={handleSocial}
    />
  );
}
