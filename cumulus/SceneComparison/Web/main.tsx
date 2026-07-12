import React from "react";
import { createRoot } from "react-dom/client";

import "../../../src/tango/primitives/tango-tokens.css";
import { glassSurfaceStyle } from "../../../src/tango/internal/glass-surface";

type SceneDefinition = {
  id: string;
  renderer: "shopGlassDemo";
  backdrop: string;
  panelViewportHeight: number;
};

type Manifest = {
  scenes: SceneDefinition[];
};

const sceneId = new URLSearchParams(window.location.search).get("scene");
if (!sceneId) throw new Error("Expected ?scene=<scene-id>");

const manifestUrl = new URL("../manifest.json", import.meta.url);
const manifest = (await fetch(manifestUrl).then((response) => {
  if (!response.ok) throw new Error(`Could not load scene manifest: ${response.status}`);
  return response.json();
})) as Manifest;
const scene = manifest.scenes.find((candidate) => candidate.id === sceneId);
if (!scene) throw new Error(`Unknown comparison scene: ${sceneId}`);

const backdropUrl = new URL(scene.backdrop, manifestUrl).href;
const image = new Image();
image.src = backdropUrl;
await image.decode();

document.documentElement.style.cssText = "width:100%;height:100%";
document.body.style.cssText = "width:100%;height:100%;margin:0;overflow:hidden;background:#0c0612";

function ShopGlassDemo() {
  const panelSize = `${scene.panelViewportHeight * 100}vh`;
  return (
    <main
      className="tango"
      data-scene-comparison-frame=""
      data-scene-comparison-ready="true"
      data-scene-id={scene.id}
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundImage: `url(${backdropUrl})`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <div
        data-scene-comparison-glass=""
        style={{
          ...glassSurfaceStyle(),
          position: "absolute",
          boxSizing: "border-box",
          width: panelSize,
          height: panelSize,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />
    </main>
  );
}

const renderers = {
  shopGlassDemo: ShopGlassDemo,
} satisfies Record<SceneDefinition["renderer"], React.ComponentType>;

const SceneRenderer = renderers[scene.renderer];
createRoot(document.getElementById("root")!).render(<SceneRenderer />);
