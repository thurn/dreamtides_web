// Mounts the overworld's Pixi canvas with @pixi/react and runs one
// OverworldScene over it. The canvas fills its container; React owns its
// lifecycle and the input-focus flag, Pixi owns every frame.

import { Application, useApplication } from "@pixi/react";
import { useEffect, useRef, useState } from "react";
import type { D97CharacterTunables, D97OverworldTunables } from "../../content/d97/tunables";
import type { D97CharacterId, DreamAnchorId } from "../../types/identifiers";
import type { BadgeKind } from "./characters/badges";
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
  /** The anchor the player starts beside (after its battle), if any. */
  readonly returnAnchorId: DreamAnchorId | null;
  /** False while a React panel is open: the canvas ignores input. */
  readonly inputEnabled: boolean;
  /** Head icons shown in place of occupants' role badges (quest icons). */
  readonly badges: ReadonlyMap<DreamAnchorId, BadgeKind>;
  /** Anchors neither drawn nor interactive (quest objects out of their quest). */
  readonly hiddenAnchorIds: ReadonlySet<DreamAnchorId>;
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
  returnAnchorId,
  inputEnabled,
  badges,
  hiddenAnchorIds,
  assets,
}: OverworldCanvasProps & { readonly assets: SceneAssets }) {
  const { app, isInitialised } = useApplication();
  const sceneRef = useRef<OverworldScene | null>(null);
  const [scene, setScene] = useState<OverworldScene | null>(null);

  useEffect(() => {
    if (!isInitialised) return;
    const scene = new OverworldScene({
      app,
      map,
      textures: assets.textures,
      looks: assets.looks,
      occupants,
      playerCharacter,
      returnAnchorId,
      registry,
      tunables,
      characterTunables,
      desktop: () => window.innerWidth >= DESKTOP_MIN_WIDTH,
    });
    sceneRef.current = scene;
    setScene(scene);
    const uninstall = import.meta.env.DEV ? installD97QaSurface(map, scene) : () => undefined;
    return () => {
      uninstall();
      sceneRef.current = null;
      setScene(null);
      scene.destroy();
    };
  }, [app, assets, characterTunables, isInitialised, map, occupants, playerCharacter, registry, returnAnchorId, tunables]);

  useEffect(() => {
    sceneRef.current?.setInputEnabled(inputEnabled);
  }, [inputEnabled, isInitialised]);

  useEffect(() => {
    scene?.setHiddenAnchors(hiddenAnchorIds);
    scene?.setBadges(badges);
  }, [badges, hiddenAnchorIds, scene]);

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
