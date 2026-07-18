import { useEffect, useMemo, useRef, useState } from "react";
import { LoadingScreen } from "../../cumulus/screens/LoadingScreen";
import { logEvent } from "../../logging";
import { buildLoadingView } from "./loading-view-model";
import { TutorialScreenAdapter } from "./TutorialScreenAdapter";

const TUTORIAL_DELAY_MS = 5_000;

/** Standalone `/loading` wiring and presentation logging. */
export function LoadingScreenAdapter({
  source = "direct",
}: {
  readonly source?: "direct" | "main_menu";
}) {
  const hasLoggedPresentation = useRef(false);
  const [activeScreen, setActiveScreen] = useState<"loading" | "tutorial">(
    "loading",
  );
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
    const timeout = window.setTimeout(() => {
      window.history.replaceState(
        null,
        "",
        `/tutorial${window.location.search}${window.location.hash}`,
      );
      setActiveScreen("tutorial");
    }, TUTORIAL_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, []);

  if (activeScreen === "tutorial") {
    return <TutorialScreenAdapter />;
  }

  return <LoadingScreen view={view} />;
}
