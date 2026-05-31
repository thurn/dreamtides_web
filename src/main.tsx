import { StrictMode } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "boxicons/css/boxicons.min.css";
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

if (pathname === "/editor") {
  renderStrict(<CardEditorApp />);
} else {
  const [
    { default: App },
    { HudDreamsignLayoutDemo },
    { TideDocumentationHoverDemo },
    { JourneyHoverCardDemo },
    { parseRuntimeConfig },
  ] = await Promise.all([
    import("./App.tsx"),
    import("./components/HudDreamsignLayoutDemo"),
    import("./components/TideDocumentationHoverDemo"),
    import("./journeys/ui/JourneyHoverCardDemo"),
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
    ) : demoParam === "tide-doc-hover" ? (
      <TideDocumentationHoverDemo />
    ) : demoParam === "journey-hover" ? (
      <JourneyHoverCardDemo />
    ) : (
      <App runtimeConfig={runtimeConfig} />
    ),
  );
}
