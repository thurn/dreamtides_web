import type { ReactNode } from "react";
import { TroxLocalizationProvider } from "../runtime/localization/context";
import { RevealCoordinatorProvider } from "./internal/reveal/context";

/** Installs Cumulus's application-wide localization and reveal coordination. */
export function CumulusRoot({ children }: { readonly children: ReactNode }) {
  return (
    <TroxLocalizationProvider>
      <RevealCoordinatorProvider>{children}</RevealCoordinatorProvider>
    </TroxLocalizationProvider>
  );
}
