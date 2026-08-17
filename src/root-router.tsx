import { StrictMode, type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { CumulusRoot } from "./cumulus/CumulusRoot";

type StandaloneRouteId =
  | "cards"
  | "dreamsigns"
  | "glossary"
  | "exploration"
  | "avatars"
  | "tides"
  | "dreamscapes"
  | "figments"
  | "dreamwell"
  | "images"
  | "offers"
  | "cumulus"
  | "recovery";

export type RootRouteId = StandaloneRouteId | "journey";

interface StandaloneRoute {
  readonly id: StandaloneRouteId;
  readonly canonicalPath?: string;
  readonly render: () => Promise<ReactNode>;
}

const STANDALONE_ROUTES: Readonly<Partial<Record<string, StandaloneRoute>>> = {
  "/cards": {
    id: "cards",
    render: async () => {
      const { default: CardEditorApp } = await import("./editor/CardEditorApp");
      return <CardEditorApp />;
    },
  },
  "/editor": {
    id: "cards",
    canonicalPath: "/cards",
    render: async () => {
      const { default: CardEditorApp } = await import("./editor/CardEditorApp");
      return <CardEditorApp />;
    },
  },
  "/dreamsigns": {
    id: "dreamsigns",
    render: async () => {
      const { default: DreamsignEditorApp } =
        await import("./editor/DreamsignEditorApp");
      return <DreamsignEditorApp />;
    },
  },
  "/glossary": {
    id: "glossary",
    render: async () => {
      const { default: GlossaryEditorApp } =
        await import("./editor/GlossaryEditorApp");
      return <GlossaryEditorApp />;
    },
  },
  "/exploration": {
    id: "exploration",
    render: async () => {
      const { default: ExplorationEditorApp } =
        await import("./editor/ExplorationEditorApp");
      return <ExplorationEditorApp />;
    },
  },
  "/avatars": {
    id: "avatars",
    render: async () => {
      const { default: AvatarEditorApp } =
        await import("./editor/AvatarEditorApp");
      return <AvatarEditorApp />;
    },
  },
  "/tides": {
    id: "tides",
    render: async () => {
      const { default: TidesEditorApp } =
        await import("./editor/TidesEditorApp");
      return <TidesEditorApp />;
    },
  },
  "/dreamscapes": {
    id: "dreamscapes",
    render: async () => {
      const { default: DreamscapeEditorApp } =
        await import("./editor/DreamscapeEditorApp");
      return <DreamscapeEditorApp />;
    },
  },
  "/figments": {
    id: "figments",
    render: async () => {
      const { default: FigmentEditorApp } =
        await import("./editor/FigmentEditorApp");
      return <FigmentEditorApp />;
    },
  },
  "/dreamwell": {
    id: "dreamwell",
    render: async () => {
      const { default: DreamwellEditorApp } =
        await import("./editor/DreamwellEditorApp");
      return <DreamwellEditorApp />;
    },
  },
  "/images": {
    id: "images",
    render: async () => {
      const { default: ImageViewerApp } =
        await import("./image_viewer/ImageViewerApp");
      return <ImageViewerApp />;
    },
  },
  "/images/favorites": {
    id: "images",
    render: async () => {
      const { default: ImageViewerApp } =
        await import("./image_viewer/ImageViewerApp");
      return <ImageViewerApp />;
    },
  },
  "/offers": {
    id: "offers",
    render: async () => {
      const { default: OffersDebugApp } =
        await import("./debug/OffersDebugApp");
      return <OffersDebugApp />;
    },
  },
  "/cumulus": {
    id: "cumulus",
    render: async () => {
      const { default: CumulusApp } = await import("./cumulus/docs/CumulusApp");
      return <CumulusApp />;
    },
  },
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

function installGlossaryReload(pathname: string): void {
  if (import.meta.hot && pathname !== "/glossary") {
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

  const [
    { default: App },
    { DeviceFrameDemo },
    { EntityRevealConformanceDemo },
    { parseRuntimeConfig, removeUiParamFromSearch },
  ] = await Promise.all([
    import("./App.tsx"),
    import("./cumulus/screens/devtools/DeviceFrameDemo"),
    import("./cumulus/screens/devtools/EntityRevealConformanceDemo"),
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
  const demoParam = new URLSearchParams(window.location.search).get("demo");

  renderStrict(
    root,
    demoParam === "device-frame" ? (
      <DeviceFrameDemo />
    ) : demoParam === "entity-reveals" ? (
      <EntityRevealConformanceDemo />
    ) : (
      <App
        runtimeConfig={runtimeConfig}
        frontDoorEntry={frontDoorEntry}
        directTutorialBattle={directTutorialBattle}
        previewTutorialVictory={previewTutorialVictory}
      />
    ),
  );
}

/** Resolve and render the application surface selected by the browser URL. */
export async function renderRootRoute(root: Root): Promise<RootRouteId> {
  const pathname = normalizedPathname(window.location.pathname);
  installGlossaryReload(pathname);
  const standaloneRoute = STANDALONE_ROUTES[pathname];
  if (standaloneRoute !== undefined) {
    if (
      standaloneRoute.canonicalPath !== undefined &&
      pathname !== standaloneRoute.canonicalPath
    ) {
      window.history.replaceState(
        null,
        "",
        standaloneRoute.canonicalPath +
          window.location.search +
          window.location.hash,
      );
    }
    renderStrict(root, await standaloneRoute.render());
    return standaloneRoute.id;
  }

  await renderJourneyRoute(root, pathname);
  return "journey";
}
