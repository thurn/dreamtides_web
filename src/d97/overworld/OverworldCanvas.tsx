// Mounts the overworld's Pixi canvas with @pixi/react and runs one
// OverworldScene over it. The canvas fills its container; React owns its
// lifecycle and the input-focus flag, Pixi owns every frame.

import { Application, useApplication } from "@pixi/react";
import { useEffect, useRef, useState } from "react";
import type { D97OverworldTunables } from "../../content/d97/tunables";
import { DESKTOP_MIN_WIDTH } from "../../cumulus/primitives/use-is-desktop";
import type { CompiledDreamMap } from "../map/compiled";
import type { InteractionRegistry } from "./interactions";
import { OverworldScene } from "./overworld-scene";
import { installD97QaSurface } from "./qa-surface";
import { loadTileTextures, type TileTextures } from "./tile-textures";

/** The canvas clear color behind the map (the void past its edges). */
const VOID_COLOR = 0x0b0d12;

export interface OverworldCanvasProps {
  readonly map: CompiledDreamMap;
  readonly registry: InteractionRegistry;
  readonly tunables: D97OverworldTunables;
  /** False while a React panel is open: the canvas ignores input. */
  readonly inputEnabled: boolean;
}

function SceneMount({
  map,
  registry,
  tunables,
  inputEnabled,
  textures,
}: OverworldCanvasProps & { readonly textures: TileTextures }) {
  const { app, isInitialised } = useApplication();
  const sceneRef = useRef<OverworldScene | null>(null);

  useEffect(() => {
    if (!isInitialised) return;
    const scene = new OverworldScene({
      app,
      map,
      textures,
      registry,
      tunables,
      desktop: () => window.innerWidth >= DESKTOP_MIN_WIDTH,
    });
    sceneRef.current = scene;
    const uninstall = import.meta.env.DEV ? installD97QaSurface(map, scene) : () => undefined;
    return () => {
      uninstall();
      sceneRef.current = null;
      scene.destroy();
    };
  }, [app, isInitialised, map, registry, textures, tunables]);

  useEffect(() => {
    sceneRef.current?.setInputEnabled(inputEnabled);
  }, [inputEnabled, isInitialised]);

  return null;
}

/** The overworld canvas, sized to its parent. */
export function OverworldCanvas(props: OverworldCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [textures, setTextures] = useState<{ map: CompiledDreamMap; textures: TileTextures } | null>(null);

  useEffect(() => {
    let current = true;
    void loadTileTextures(props.map).then((loaded) => {
      if (current) setTextures({ map: props.map, textures: loaded });
    });
    return () => {
      current = false;
    };
  }, [props.map]);

  return (
    <div
      ref={hostRef}
      data-d97-overworld-canvas=""
      style={{ position: "absolute", inset: 0, overflow: "hidden", touchAction: "none" }}
    >
      {textures !== null && textures.map === props.map && (
        <Application
          resizeTo={hostRef}
          background={VOID_COLOR}
          antialias={false}
          autoDensity
          resolution={window.devicePixelRatio}
          roundPixels
        >
          <SceneMount {...props} textures={textures.textures} />
        </Application>
      )}
    </div>
  );
}
