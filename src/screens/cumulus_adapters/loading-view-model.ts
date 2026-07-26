import type { LoadingView } from "../../cumulus/screens/LoadingScreen";

/** Build the authored copy for the cinematic loading endpoint. */
export function buildLoadingView(): LoadingView {
  return {
    quote:
      "“I looked, and there before me was a pale horse, and its rider was named Death.”",
    loadingLabel: "Loading",
  };
}
