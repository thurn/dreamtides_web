import { useEffect, useMemo, useRef } from "react";
import { LoadingScreen } from "../../cumulus/screens/LoadingScreen";
import { logEvent } from "../../logging";
import { useFrontDoor } from "../../state/front-door-context";
import { buildLoadingView } from "./loading-view-model";

const TUTORIAL_DELAY_MS = 5_000;

/** Coop-backed `/loading` wiring and presentation logging. */
export function LoadingScreenAdapter() {
  const hasLoggedPresentation = useRef(false);
  const { state, mutations } = useFrontDoor();
  const source = state.journeyId?.startsWith("event:") ? "main_menu" : "direct";
  const view = useMemo(() => buildLoadingView(), []);

  useEffect(() => {
    if (hasLoggedPresentation.current) return;
    hasLoggedPresentation.current = true;
    logEvent("loading_screen_presented", {
      source,
      attribution: view.attribution,
    });
  }, [source, view]);

  useEffect(() => {
    if (state.phase !== "loading" || state.journeyId === null) {
      return undefined;
    }
    const journeyId = state.journeyId;
    const timeout = window.setTimeout(() => {
      void mutations.advance("loading", journeyId).catch((error: unknown) => {
        console.error("Coop loading transition failed", error);
      });
    }, TUTORIAL_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [mutations, state.journeyId, state.phase]);

  return <LoadingScreen view={view} />;
}
