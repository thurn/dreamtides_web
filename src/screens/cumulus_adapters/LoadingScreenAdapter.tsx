import { useEffect, useMemo, useRef } from "react";
import { LoadingScreen } from "../../cumulus/screens/LoadingScreen";
import { logEvent } from "../../logging";
import { buildLoadingView } from "./loading-view-model";

/** Standalone `/loading` wiring and presentation logging. */
export function LoadingScreenAdapter() {
  const hasLoggedPresentation = useRef(false);
  const view = useMemo(() => buildLoadingView(), []);

  useEffect(() => {
    if (hasLoggedPresentation.current) return;
    hasLoggedPresentation.current = true;
    logEvent("loading_screen_presented", {
      source: "direct",
      attribution: view.attribution,
    });
  }, [view]);

  return <LoadingScreen view={view} />;
}
