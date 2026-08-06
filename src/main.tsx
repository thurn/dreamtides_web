import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./vendor/boxicons/boxicons.css";
import "./vendor/boxicons/boxicons-filled.css";
import "./vendor/boxicons/boxicons-logos.css";
// Font Awesome solid glyphs. The Dream Atlas leans on Boxicons 3 for site
// iconography, but a few marks (the Transfiguration hammer, the starter flag,
// the boss skull, completion checks) come from Font Awesome where Boxicons has
// no matching glyph. Self-hosted via the bundled package, not a CDN.
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./index.css";
// Cumulus design tokens ship on every entry so named components and the root
// entity-reveal coordinator resolve the same semantic surface vocabulary.
import "./cumulus/primitives/cumulus-tokens.css";
import "./cumulus/primitives/legibility.css";
import CardEditorApp from "./editor/CardEditorApp";
import { applyDeviceFrameFromSearch } from "./runtime/device-frame";
import { CumulusRoot } from "./cumulus/CumulusRoot";

// Screenshot mock-ups load the app in an iframe with no physical display
// cutout, so `env(safe-area-inset-*)` reads 0. When the device-screenshot tool
// injects a `deviceFrame` param, republish its simulated insets + cutout box as
// CSS custom properties before first paint (a no-op on real hardware). Runs for
// every route, since any screen can be captured.
applyDeviceFrameFromSearch(window.location.search);

const root = createRoot(document.getElementById("root")!);

function renderStrict(children: ReactNode) {
  root.render(
    <StrictMode>
      <CumulusRoot>{children}</CumulusRoot>
    </StrictMode>,
  );
}

const pathname = window.location.pathname.replace(/\/+$/, "");
if (import.meta.hot && pathname !== "/glossary") {
  import.meta.hot.on("glossary-data:changed", () => {
    window.location.reload();
  });
}

if (pathname === "/editor" || pathname === "/cards") {
  // `/cards` is the canonical card editor URL. `/editor` is a legacy alias that
  // redirects to `/cards` (rewriting the address bar in place, no reload) while
  // still rendering the editor so existing `/editor` links keep working.
  if (pathname === "/editor") {
    window.history.replaceState(
      null,
      "",
      "/cards" + window.location.search + window.location.hash,
    );
  }
  renderStrict(<CardEditorApp />);
} else if (pathname === "/dreamsigns") {
  const { default: DreamsignEditorApp } =
    await import("./editor/DreamsignEditorApp");
  renderStrict(<DreamsignEditorApp />);
} else if (pathname === "/glossary") {
  const { default: GlossaryEditorApp } =
    await import("./editor/GlossaryEditorApp");
  renderStrict(<GlossaryEditorApp />);
} else if (pathname === "/exploration_candidates") {
  const { default: ExplorationCandidatesEditorApp } =
    await import("./editor/ExplorationCandidatesEditorApp");
  renderStrict(<ExplorationCandidatesEditorApp />);
} else if (pathname === "/exploration") {
  const { default: ExplorationEditorApp } =
    await import("./editor/ExplorationEditorApp");
  renderStrict(<ExplorationEditorApp />);
} else if (
  pathname === "/dream-avatars" ||
  pathname === "/avatars" ||
  pathname === "/dreamavatars"
) {
  if (pathname !== "/dream-avatars") {
    window.history.replaceState(
      null,
      "",
      "/dream-avatars" + window.location.search + window.location.hash,
    );
  }
  const { default: DreamAvatarEditorApp } =
    await import("./editor/DreamAvatarEditorApp");
  renderStrict(<DreamAvatarEditorApp />);
} else if (pathname === "/tides") {
  const { default: TidesEditorApp } = await import("./editor/TidesEditorApp");
  renderStrict(<TidesEditorApp />);
} else if (pathname === "/dreamscapes") {
  const { default: DreamscapeEditorApp } =
    await import("./editor/DreamscapeEditorApp");
  renderStrict(<DreamscapeEditorApp />);
} else if (pathname === "/figments") {
  const { default: FigmentEditorApp } =
    await import("./editor/FigmentEditorApp");
  renderStrict(<FigmentEditorApp />);
} else if (pathname === "/dreamwell") {
  const { default: DreamwellEditorApp } =
    await import("./editor/DreamwellEditorApp");
  renderStrict(<DreamwellEditorApp />);
} else if (pathname === "/images" || pathname === "/images/favorites") {
  const { default: ImageViewerApp } =
    await import("./image_viewer/ImageViewerApp");
  renderStrict(<ImageViewerApp />);
} else if (pathname === "/opponent") {
  // Standalone opponent-generation debugging tool: simulate the pre-battle
  // opponent build (DreamAvatar, dreamsigns, deck) for any run position and
  // dreamscape, and re-roll the same parameters. See `src/debug/OpponentDebugApp`.
  const { default: OpponentDebugApp } =
    await import("./debug/OpponentDebugApp");
  renderStrict(<OpponentDebugApp />);
} else if (pathname === "/sigdecks") {
  // Temporary visualization: the real draft deck most strongly correlated with
  // each signature-carrying avatar. See `src/debug/SignatureDecksApp`.
  const { default: SignatureDecksApp } =
    await import("./debug/SignatureDecksApp");
  renderStrict(<SignatureDecksApp />);
} else if (pathname === "/offers") {
  const { default: OffersDebugApp } = await import("./debug/OffersDebugApp");
  renderStrict(<OffersDebugApp />);
} else if (pathname === "/cumulus") {
  const { default: CumulusApp } = await import("./cumulus/docs/CumulusApp");
  renderStrict(<CumulusApp />);
} else {
  // The dev card/figment/config data hot-reload plugins (see vite.config.ts)
  // emit targeted custom HMR events instead of a full reload, so that saving in
  // the card or figment editor never reloads the editor page. The running
  // battle/journey app opts in here: it reloads to pick up edited card, figment,
  // or Dream Atlas data (the catalogs are re-fetched and rehydrated on
  // load). The editor routes above never register these handlers, so an editor
  // save leaves the page — and any open art editor — untouched.
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
  const previewTutorialVictory =
    runtimeConfig.gotoScene === "tutorial-victory";
  const frontDoorEntry =
    directTutorialBattle || previewTutorialVictory
      ? "tutorial"
      : pathname === "/main" ||
          pathname === "/loading" ||
          pathname === "/tutorial"
        ? pathname.slice(1) as "main" | "loading" | "tutorial"
        : undefined;

  // Standalone component demos for browser QA. Mount with
  // `?demo=<name>` to bypass the full journey workflow when inspecting a
  // specific component in isolation.
  const demoParam = new URLSearchParams(window.location.search).get("demo");

  renderStrict(
    <>
      {demoParam === "device-frame" ? (
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
      )}
    </>,
  );
}
