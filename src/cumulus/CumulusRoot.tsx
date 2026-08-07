import type { ReactNode } from "react";
import { LocalizationProvider } from "@fluent/react";
import { appLocalization } from "../data/localization";
import { RevealCoordinatorProvider } from "./internal/reveal/context";

/** Installs Cumulus's application-wide localization and reveal coordination. */
export function CumulusRoot({ children }: { readonly children: ReactNode }) {
  return (
    <LocalizationProvider l10n={appLocalization}>
      <RevealCoordinatorProvider>{children}</RevealCoordinatorProvider>
    </LocalizationProvider>
  );
}
