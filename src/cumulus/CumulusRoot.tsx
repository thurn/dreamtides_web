import type { ReactNode } from "react";
import { TroxLocalizationProvider } from "../runtime/localization/context";
import { RevealCoordinatorProvider } from "./internal/reveal/context";
import { TutorialPlacementProvider } from "./components/overlay/tutorial-placement";

/** Installs Cumulus's application-wide localization and reveal coordination. */
export function CumulusRoot({ children }: { readonly children: ReactNode }) {
  return (
    <TroxLocalizationProvider>
      <RevealCoordinatorProvider>
        <TutorialPlacementProvider>{children}</TutorialPlacementProvider>
      </RevealCoordinatorProvider>
    </TroxLocalizationProvider>
  );
}
