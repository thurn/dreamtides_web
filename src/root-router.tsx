import { StrictMode, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { CumulusRoot } from "./cumulus/CumulusRoot";

export type RootRouteId = "journey";

function normalizedPathname(pathname: string): string {
  return pathname.replace(/\/+$/u, "");
}

function renderStrict(root: Root, children: ReactNode): void {
  root.render(
    <StrictMode>
      <CumulusRoot>{children}</CumulusRoot>
    </StrictMode>,
  );
}

async function renderJourneyRoute(root: Root, pathname: string): Promise<void> {
  const [{ default: App }, { parseRuntimeConfig, removeUiParamFromSearch }] =
    await Promise.all([
      import("./App.tsx"),
      import("./runtime/runtime-config"),
    ]);

  const canonicalSearch = removeUiParamFromSearch(window.location.search);
  if (canonicalSearch !== window.location.search) {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + canonicalSearch + window.location.hash,
    );
  }
  const runtimeConfig = parseRuntimeConfig(canonicalSearch);
  const directTutorialBattle = runtimeConfig.gotoScene === "tutorial-battle";
  const previewTutorialVictory = runtimeConfig.gotoScene === "tutorial-victory";
  const frontDoorEntry =
    directTutorialBattle || previewTutorialVictory
      ? "tutorial"
      : pathname === "/main" ||
          pathname === "/loading" ||
          pathname === "/tutorial"
        ? (pathname.slice(1) as "main" | "loading" | "tutorial")
        : undefined;
  renderStrict(
    root,
    <App
      runtimeConfig={runtimeConfig}
      frontDoorEntry={frontDoorEntry}
      directTutorialBattle={directTutorialBattle}
      previewTutorialVictory={previewTutorialVictory}
    />,
  );
}

/** Render the game for the browser URL; every path is the journey route. */
export async function renderRootRoute(root: Root): Promise<RootRouteId> {
  await renderJourneyRoute(root, normalizedPathname(window.location.pathname));
  return "journey";
}
