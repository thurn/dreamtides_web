import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./vendor/boxicons/boxicons.css";
import "./vendor/boxicons/boxicons-filled.css";
// Font Awesome solid glyphs. The Dream Atlas leans on Boxicons 3 for site
// iconography, but a few marks (the Transfiguration hammer, the starter flag,
// the boss skull, completion checks) come from Font Awesome where Boxicons has
// no matching glyph. Self-hosted via the bundled package, not a CDN.
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./index.css";
// Tango design tokens. The Tango redesign is adopted incrementally across the
// app (SiteNode, Dreamsign reveals, InfoCard popovers, …), so its semantic
// token sheet must ship on every entry, not only the /tango doc app that
// imports it locally. Every rule inside is scoped to `.tango { … }` and
// declares only custom properties, so loading it globally defines the tokens
// without applying a single style until an element opts in via that class —
// which is exactly what the portaled reveals do (see PressPopover /
// HoverPopover). This is what lets a reveal that portals OUT of a `.tango`
// subtree (to a screen root or `document.body`) still resolve its surface,
// radius, shadow, and text tokens.
import "./tango/primitives/tango-tokens.css";
import "./tango/primitives/legibility.css";
import CardEditorApp from "./editor/CardEditorApp";
import { verifyFonts } from "./runtime/verify-fonts";

// Warn (console + on-screen banner) if the card webfonts failed to load, e.g.
// when the Google Fonts CDN is blocked or offline and cards silently fall
// back to system fonts.
void verifyFonts();

const root = createRoot(document.getElementById("root")!);

function renderStrict(children: ReactNode) {
  root.render(<StrictMode>{children}</StrictMode>);
}

const pathname = window.location.pathname.replace(/\/+$/, "");

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
  const { default: DreamsignEditorApp } = await import(
    "./editor/DreamsignEditorApp"
  );
  renderStrict(<DreamsignEditorApp />);
} else if (pathname === "/dreamcallers") {
  const { default: DreamcallerEditorApp } = await import(
    "./editor/DreamcallerEditorApp"
  );
  renderStrict(<DreamcallerEditorApp />);
} else if (pathname === "/tides") {
  const { default: TidesEditorApp } = await import("./editor/TidesEditorApp");
  renderStrict(<TidesEditorApp />);
} else if (pathname === "/dreamscapes") {
  const { default: DreamscapeEditorApp } = await import(
    "./editor/DreamscapeEditorApp"
  );
  renderStrict(<DreamscapeEditorApp />);
} else if (pathname === "/figments") {
  const { default: FigmentEditorApp } = await import(
    "./editor/FigmentEditorApp"
  );
  renderStrict(<FigmentEditorApp />);
} else if (pathname === "/dreamwell") {
  const { default: DreamwellEditorApp } = await import(
    "./editor/DreamwellEditorApp"
  );
  renderStrict(<DreamwellEditorApp />);
} else if (pathname === "/images") {
  const { default: ImageViewerApp } = await import(
    "./image_viewer/ImageViewerApp"
  );
  renderStrict(<ImageViewerApp />);
} else if (pathname === "/opponent") {
  // Standalone opponent-generation debugging tool: simulate the pre-battle
  // opponent build (Dreamcaller, dreamsigns, deck) for any run position and
  // dreamscape, and re-roll the same parameters. See `src/debug/OpponentDebugApp`.
  const { default: OpponentDebugApp } = await import(
    "./debug/OpponentDebugApp"
  );
  renderStrict(<OpponentDebugApp />);
} else if (pathname === "/sigdecks") {
  // Temporary visualization: the real draft deck most strongly correlated with
  // each signature-carrying Dreamcaller. See `src/debug/SignatureDecksApp`.
  const { default: SignatureDecksApp } = await import(
    "./debug/SignatureDecksApp"
  );
  renderStrict(<SignatureDecksApp />);
} else if (pathname === "/tango") {
  const { default: TangoApp } = await import("./tango/docs/TangoApp");
  renderStrict(<TangoApp />);
} else {
  // The dev card/figment/config data hot-reload plugins (see vite.config.ts)
  // emit targeted custom HMR events instead of a full reload, so that saving in
  // the card or figment editor never reloads the editor page. The running
  // battle/quest app opts in here: it reloads to pick up edited card, figment,
  // or Dream Atlas config data (the catalogs are re-fetched and rehydrated on
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
  }

  const [
    { default: App },
    { HudDreamsignLayoutDemo },
    { JourneyHoverCardDemo },
    { TransfigurationCardDemo },
    { parseRuntimeConfig },
  ] = await Promise.all([
    import("./App.tsx"),
    import("./components/HudDreamsignLayoutDemo"),
    import("./journeys/ui/JourneyHoverCardDemo"),
    import("./components/TransfigurationCardDemo"),
    import("./runtime/runtime-config"),
  ]);

  // DEV-ONLY: the floating panel for dialing in mobile InfoCard typography.
  // Removed once the value is baked into MOBILE_TEXT_SCALE.
  const InfoCardScaleTweakPanel = import.meta.env.DEV
    ? (
        await import("./tango/screens/devtools/InfoCardScaleTweakPanel")
      ).InfoCardScaleTweakPanel
    : null;

  const runtimeConfig = parseRuntimeConfig(window.location.search);

  // Standalone component demos for browser QA. Mount with
  // `?demo=<name>` to bypass the full quest workflow when inspecting a
  // specific component in isolation.
  const demoParam = new URLSearchParams(window.location.search).get("demo");

  renderStrict(
    <>
      {demoParam === "hud-dreamsign-layout" ? (
        <HudDreamsignLayoutDemo />
      ) : demoParam === "journey-hover" ? (
        <JourneyHoverCardDemo />
      ) : demoParam === "transfiguration" ? (
        <TransfigurationCardDemo />
      ) : (
        <App runtimeConfig={runtimeConfig} />
      )}
      {InfoCardScaleTweakPanel && <InfoCardScaleTweakPanel />}
    </>,
  );
}
