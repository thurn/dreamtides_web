import type { ReactNode } from "react";
import { RevealCoordinatorProvider } from "./internal/reveal/context";

/** Installs Cumulus's single application-wide entity-reveal coordinator. */
export function CumulusRoot({ children }: { readonly children: ReactNode }) {
  return <RevealCoordinatorProvider>{children}</RevealCoordinatorProvider>;
}
