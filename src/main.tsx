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

  const runtimeConfig = parseRuntimeConfig(window.location.search);

  // Standalone component demos for browser QA. Mount with
  // `?demo=<name>` to bypass the full quest workflow when inspecting a
  // specific component in isolation.
  const demoParam = new URLSearchParams(window.location.search).get("demo");

  renderStrict(
    demoParam === "hud-dreamsign-layout" ? (
      <HudDreamsignLayoutDemo />
    ) : demoParam === "journey-hover" ? (
      <JourneyHoverCardDemo />
    ) : demoParam === "transfiguration" ? (
      <TransfigurationCardDemo />
    ) : (
      <App runtimeConfig={runtimeConfig} />
    ),
  );
}
