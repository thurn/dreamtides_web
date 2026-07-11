import type { ReactNode } from "react";
import { RevealCoordinatorProvider } from "./internal/reveal/context";

/** Installs Tango's single application-wide entity-reveal coordinator. */
export function TangoRoot({ children }: { readonly children: ReactNode }) {
  return <RevealCoordinatorProvider>{children}</RevealCoordinatorProvider>;
}
