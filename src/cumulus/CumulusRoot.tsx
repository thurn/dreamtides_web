import type { ReactNode } from "react";
import { RevealCoordinatorProvider } from "./internal/reveal/context";
import { TutorialPlacementProvider } from "./components/overlay/tutorial-placement";

/** Installs Cumulus's application-wide reveal coordination and tutorial placement. */
export function CumulusRoot({ children }: { readonly children: ReactNode }) {
  return (
    <RevealCoordinatorProvider>
      <TutorialPlacementProvider>{children}</TutorialPlacementProvider>
    </RevealCoordinatorProvider>
  );
}
