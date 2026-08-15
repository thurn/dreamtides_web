import React from "react";
import { createRoot } from "react-dom/client";

import "../../../src/cumulus/primitives/cumulus-tokens.css";
import { glassSurfaceStyle } from "../../../src/cumulus/internal/glass-surface";
import {
  parseParityScenarioId,
  type ParityScenarioId,
} from "../../../src/types/tool-identifiers";

type Manifest = {
  capture: {
    width: number;
    height: number;
    edgePanel: { x: number; y: number; width: number; height: number };
  };
  scenarios: Array<{
    id: ParityScenarioId;
    background: string;
    purpose: "interior" | "edge";
  }>;
};

const query = new URLSearchParams(window.location.search);
const requestedScenarioId = query.get("scenario");
const mode = query.get("mode");
if (mode !== "bare" && mode !== "glass") {
  throw new Error("Expected ?scenario=<id>&mode=bare|glass");
}

const manifestUrl = new URL("../manifest.json", import.meta.url);
const rawManifest = (await fetch(manifestUrl).then((response) => {
  if (!response.ok) throw new Error(`Could not load parity manifest: ${response.status}`);
  return response.json();
})) as Omit<Manifest, "scenarios"> & {
  scenarios: Array<Omit<Manifest["scenarios"][number], "id"> & { id: unknown }>;
};
const manifest: Manifest = {
  ...rawManifest,
  scenarios: rawManifest.scenarios.map((scenario) => ({
    ...scenario,
    id: parseParityScenarioId(scenario.id),
  })),
};
const scenario = manifest.scenarios.find(
  (candidate) => candidate.id === requestedScenarioId,
);
if (!scenario) throw new Error(`Unknown parity scenario: ${String(requestedScenarioId)}`);
const backgroundUrl = new URL(scenario.background, manifestUrl).href;
const glassBounds =
  scenario.purpose === "edge"
    ? manifest.capture.edgePanel
    : { x: 0, y: 0, width: manifest.capture.width, height: manifest.capture.height };
const image = new Image();
image.src = backgroundUrl;
await image.decode();

document.documentElement.style.width = `${manifest.capture.width}px`;
document.documentElement.style.height = `${manifest.capture.height}px`;
document.body.style.cssText = "margin:0;overflow:hidden;background:#000";

function ParityFrame() {
  return (
    <main
      className="cumulus"
      data-parity-frame=""
      data-parity-ready="true"
      style={{
        position: "relative",
        width: manifest.capture.width,
        height: manifest.capture.height,
        overflow: "hidden",
        backgroundImage: `url(${backgroundUrl})`,
        backgroundSize: "100% 100%",
      }}
    >
      {mode === "glass" ? (
        <div
          data-parity-glass=""
          style={{
            ...glassSurfaceStyle({ radius: null }),
            position: "absolute",
            left: glassBounds.x,
            top: glassBounds.y,
            width: glassBounds.width,
            height: glassBounds.height,
            boxSizing: "border-box",
          }}
        />
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<ParityFrame />);
