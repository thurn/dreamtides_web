import { StrictMode, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { CumulusRoot } from "./cumulus/CumulusRoot";

type StandaloneRouteId = "recovery";

export type RootRouteId = StandaloneRouteId | "journey";

interface StandaloneRoute {
  readonly id: StandaloneRouteId;
  readonly render: () => Promise<ReactNode>;
}

const STANDALONE_ROUTES: Readonly<Partial<Record<string, StandaloneRoute>>> = {
  "/recover": {
    id: "recovery",
    render: async () => {
      const { default: RecoveryApp } = await import("./coop/RecoveryApp");
      return <RecoveryApp />;
    },
  },
};

export const STANDALONE_ROUTE_PATHS = Object.freeze(
  Object.keys(STANDALONE_ROUTES),
);

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

function installGlossaryReload(): void {
  if (import.meta.hot) {
    import.meta.hot.on("glossary-data:changed", () => {
      window.location.reload();
    });
  }
}

async function renderJourneyRoute(root: Root, pathname: string): Promise<void> {
  if (import.meta.hot) {
    const reloadForData = () => {
      window.location.reload();
    };
    import.meta.hot.on("card-data:changed", reloadForData);
    import.meta.hot.on("figment-data:changed", reloadForData);
    import.meta.hot.on("dreamwell-data:changed", reloadForData);
    import.meta.hot.on("config-data:changed", reloadForData);
    import.meta.hot.on("exploration-data:changed", reloadForData);
  }

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

/** Resolve and render the application surface selected by the browser URL. */
export async function renderRootRoute(root: Root): Promise<RootRouteId> {
  const pathname = normalizedPathname(window.location.pathname);
  installGlossaryReload();
  const standaloneRoute = STANDALONE_ROUTES[pathname];
  if (standaloneRoute !== undefined) {
    renderStrict(root, await standaloneRoute.render());
    return standaloneRoute.id;
  }

  await renderJourneyRoute(root, pathname);
  return "journey";
}
