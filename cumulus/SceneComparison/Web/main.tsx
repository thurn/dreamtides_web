import React from "react";
import { createRoot } from "react-dom/client";
import { assertLocalized } from "@trox/runtime";

import "../../../src/cumulus/primitives/cumulus-tokens.css";
import { GlassButton } from "../../../src/cumulus/components/controls/GlassButton";
import { glassSurfaceStyle } from "../../../src/cumulus/internal/glass-surface";
import { parseDreamsignId, type DreamsignId } from "../../../src/types/identifiers";
import {
  parseSceneComparisonId,
  type SceneComparisonId,
} from "../../../src/types/tool-identifiers";

type DreamsignDefinition = {
  id: DreamsignId;
  art: string;
  xViewportHeight: number;
  yViewportHeight: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
};

type SceneDefinition = {
  id: SceneComparisonId;
  renderer: "shopGlassDemo" | "dreamsignGlassDemo";
  backdrop: string;
  panelViewportHeight: number;
  dreamsigns?: DreamsignDefinition[];
};

type Manifest = {
  scenes: SceneDefinition[];
};

const requestedSceneId = new URLSearchParams(window.location.search).get(
  "scene",
);

const manifestUrl = new URL("../manifest.json", import.meta.url);
const rawManifest = (await fetch(manifestUrl).then((response) => {
  if (!response.ok) throw new Error(`Could not load scene manifest: ${response.status}`);
  return response.json();
})) as {
  scenes: Array<
    Omit<SceneDefinition, "id" | "dreamsigns"> & {
      id: unknown;
      dreamsigns?: Array<Omit<DreamsignDefinition, "id"> & { id: unknown }>;
    }
  >;
};
const manifest: Manifest = {
  scenes: rawManifest.scenes.map((candidate) => ({
    ...candidate,
    id: parseSceneComparisonId(candidate.id),
    dreamsigns: candidate.dreamsigns?.map((dreamsign) => ({
      ...dreamsign,
      id: parseDreamsignId(dreamsign.id),
    })),
  })),
};
const scene = manifest.scenes.find(
  (candidate) => candidate.id === requestedSceneId,
);
if (!scene)
  throw new Error(`Unknown comparison scene: ${String(requestedSceneId)}`);

const backdropUrl = new URL(scene.backdrop, manifestUrl).href;
const dreamsigns = (scene.dreamsigns ?? []).map((dreamsign) => ({
  ...dreamsign,
  artUrl: new URL(dreamsign.art, manifestUrl).href,
}));
await Promise.all(
  [backdropUrl, ...dreamsigns.map((dreamsign) => dreamsign.artUrl)].map(
    async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
    },
  ),
);

document.documentElement.style.cssText = "width:100%;height:100%";
document.body.style.cssText = "width:100%;height:100%;margin:0;overflow:hidden;background:#0c0612";

function SceneFrame({ children }: React.PropsWithChildren) {
  const panelSize = `${scene.panelViewportHeight * 100}vh`;
  return (
    <main
      className="cumulus"
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
      {children}
    </main>
  );
}

function ShopGlassDemo() {
  return <SceneFrame />;
}

function DreamsignGlassDemo() {
  if (dreamsigns.length !== 3) {
    throw new Error("Dreamsign glass comparison requires exactly three dreamsigns");
  }

  return (
    <SceneFrame>
      {dreamsigns.map((dreamsign) => (
        <img
          key={dreamsign.id}
          data-scene-comparison-dreamsign={dreamsign.id}
          src={dreamsign.artUrl}
          alt=""
          style={{
            position: "absolute",
            width: "13vh",
            height: "13vh",
            left: `calc(50% + ${dreamsign.xViewportHeight * 100}vh)`,
            top: `calc(50% - ${dreamsign.yViewportHeight * 100}vh)`,
            objectFit: "cover",
            transform: `translate(-50%, -50%) rotateX(${dreamsign.rotateX}deg) rotateY(${dreamsign.rotateY}deg) rotateZ(${dreamsign.rotateZ}deg)`,
            filter:
              "brightness(1.08) saturate(1.08) drop-shadow(0 0.278vh 0.556vh rgba(0, 0, 0, 0.55)) drop-shadow(0 0 1.204vh rgba(147, 51, 234, 0.32))",
          }}
        />
      ))}
      <div
        data-scene-comparison-button=""
        style={{
          position: "absolute",
          left: "50%",
          bottom: "calc(50% - 23vh + 2.222222vh)",
          transform: "translateX(-50%) scale(calc(100vh / 1080px))",
          transformOrigin: "bottom center",
        }}
      >
        <GlassButton
          label={assertLocalized("Sort")}
          placement="onGlass"
          onPress={() => undefined}
        />
      </div>
    </SceneFrame>
  );
}

const renderers = {
  shopGlassDemo: ShopGlassDemo,
  dreamsignGlassDemo: DreamsignGlassDemo,
} satisfies Record<SceneDefinition["renderer"], React.ComponentType>;

const SceneRenderer = renderers[scene.renderer];
createRoot(document.getElementById("root")!).render(<SceneRenderer />);
