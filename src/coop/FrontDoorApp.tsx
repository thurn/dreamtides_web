import type { ReactNode } from "react";
import App from "../App";
import type { RuntimeConfig } from "../runtime/runtime-config";

export type FrontDoorEntry = "main" | "loading" | "tutorial";

interface FrontDoorAppProps {
  runtimeConfig: RuntimeConfig;
  entry: FrontDoorEntry;
  directTutorialBattle?: boolean;
  previewTutorialVictory?: boolean;
}

/**
 * Compatibility entry for callers that still import the historical front-door
 * component. It delegates to the single room runtime used by every game path.
 */
export default function FrontDoorApp({
  runtimeConfig,
  entry,
  directTutorialBattle = false,
  previewTutorialVictory = false,
}: FrontDoorAppProps): ReactNode {
  return (
    <App
      runtimeConfig={runtimeConfig}
      frontDoorEntry={entry}
      directTutorialBattle={directTutorialBattle}
      previewTutorialVictory={previewTutorialVictory}
    />
  );
}
