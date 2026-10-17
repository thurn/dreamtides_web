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
  const [
    { default: App },
    { parseRuntimeConfig },
    { resumesRecentGame },
    { findD97QaScene },
  ] = await Promise.all([
    import("./App.tsx"),
    import("./runtime/runtime-config"),
    import("./session/game-selection"),
    import("./runtime/qa-scene-entry"),
  ]);

  const search = window.location.search;
  const runtimeConfig = parseRuntimeConfig(search);
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
  const newGameMode =
    pathname === "/d97" ||
    (runtimeConfig.gotoScene != null &&
      findD97QaScene(runtimeConfig.gotoScene) !== null)
      ? "d97"
      : "journey";
  renderStrict(
    root,
    <App
      runtimeConfig={runtimeConfig}
      frontDoorEntry={frontDoorEntry}
      newGameMode={newGameMode}
      resumeRecentGame={resumesRecentGame(pathname, search)}
      directTutorialBattle={directTutorialBattle}
      previewTutorialVictory={previewTutorialVictory}
    />,
  );
}

/**
 * Render the game for the browser URL; every path is the journey route, and
 * `/d97` creates a Dreamtides 97 game when the URL names none.
 */
export async function renderRootRoute(root: Root): Promise<RootRouteId> {
  await renderJourneyRoute(root, normalizedPathname(window.location.pathname));
  return "journey";
}
