import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "boxicons/css/boxicons.min.css";
import App from "./App.tsx";
import "./index.css";
import { HudDreamsignLayoutDemo } from "./components/HudDreamsignLayoutDemo";
import { TideDocumentationHoverDemo } from "./components/TideDocumentationHoverDemo";
import { JourneyHoverCardDemo } from "./journeys/ui/JourneyHoverCardDemo";
import { parseRuntimeConfig } from "./runtime/runtime-config";

const runtimeConfig = parseRuntimeConfig(window.location.search);

// Standalone component demos for browser QA. Mount with
// `?demo=<name>` to bypass the full quest workflow when inspecting a
// specific component in isolation.
const demoParam = new URLSearchParams(window.location.search).get("demo");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {demoParam === "hud-dreamsign-layout" ? (
      <HudDreamsignLayoutDemo />
    ) : demoParam === "tide-doc-hover" ? (
      <TideDocumentationHoverDemo />
    ) : demoParam === "journey-hover" ? (
      <JourneyHoverCardDemo />
    ) : (
      <App runtimeConfig={runtimeConfig} />
    )}
  </StrictMode>,
);
