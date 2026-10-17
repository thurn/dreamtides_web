// Mounts the overworld's Pixi canvas with @pixi/react and runs one
// OverworldScene over it. The canvas fills its container; React owns its
// lifecycle and the input-focus flag, Pixi owns every frame.

import { Application, useApplication } from "@pixi/react";
import { useEffect, useRef, useState } from "react";
import type { D97CharacterTunables, D97OverworldTunables } from "../../content/d97/tunables";
import type { D97CharacterId } from "../../types/identifiers";
import { loadCharacterLooks, type CharacterLooks } from "./characters/character-looks";
import type { OverworldOccupants } from "./occupants";
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
  readonly characterTunables: D97CharacterTunables;
  readonly occupants: OverworldOccupants;
  /** The character the player walks as. */
  readonly playerCharacter: D97CharacterId;
  /** False while a React panel is open: the canvas ignores input. */
  readonly inputEnabled: boolean;
}

/** Everything a scene draws that loads asynchronously. */
interface SceneAssets {
  readonly textures: TileTextures;
  readonly looks: CharacterLooks;
}

function SceneMount({
  map,
  registry,
  tunables,
  characterTunables,
  occupants,
  playerCharacter,
  inputEnabled,
  assets,
}: OverworldCanvasProps & { readonly assets: SceneAssets }) {
  const { app, isInitialised } = useApplication();
  const sceneRef = useRef<OverworldScene | null>(null);

  useEffect(() => {
    if (!isInitialised) return;
    const scene = new OverworldScene({
      app,
      map,
      textures: assets.textures,
      looks: assets.looks,
      occupants,
      playerCharacter,
      registry,
      tunables,
      characterTunables,
      desktop: () => window.innerWidth >= DESKTOP_MIN_WIDTH,
    });
    sceneRef.current = scene;
    const uninstall = import.meta.env.DEV ? installD97QaSurface(map, scene) : () => undefined;
    return () => {
      uninstall();
      sceneRef.current = null;
      scene.destroy();
    };
  }, [app, assets, characterTunables, isInitialised, map, occupants, playerCharacter, registry, tunables]);

  useEffect(() => {
    sceneRef.current?.setInputEnabled(inputEnabled);
  }, [inputEnabled, isInitialised]);

  return null;
}

/** The overworld canvas, sized to its parent. */
export function OverworldCanvas(props: OverworldCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const { map, occupants, playerCharacter } = props;
  const [assets, setAssets] = useState<{ map: CompiledDreamMap; assets: SceneAssets } | null>(null);

  useEffect(() => {
    let current = true;
    const characters = [playerCharacter, ...[...occupants.values()].map((occupant) => occupant.character)];
    void Promise.all([loadTileTextures(map), loadCharacterLooks(characters)]).then(([textures, looks]) => {
      if (current) setAssets({ map, assets: { textures, looks } });
    });
    return () => {
      current = false;
    };
  }, [map, occupants, playerCharacter]);

  return (
    <div
      ref={hostRef}
      data-d97-overworld-canvas=""
      style={{ position: "absolute", inset: 0, overflow: "hidden", touchAction: "none" }}
    >
      {assets !== null && assets.map === map && (
        <Application
          resizeTo={hostRef}
          background={VOID_COLOR}
          antialias={false}
          autoDensity
          resolution={window.devicePixelRatio}
          roundPixels
        >
          <SceneMount {...props} assets={assets.assets} />
        </Application>
      )}
    </div>
  );
}
