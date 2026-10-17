// The overworld's Pixi scene: the compiled map's tile layers drawn with
// off-screen culling, a y-sorted layer of tile objects, anchor markers and
// the player, the above-player layers, placeholder ground and capsules where
// art is missing, a camera that follows the player at whole-number zoom, and
// P14 input (keyboard steps, click or tap walking along A* paths, interact).
// Only animation and the walk live here; nothing it does is game state.

import { Container, Graphics, Sprite, type Application, type FederatedPointerEvent } from "pixi.js";
import type { D97OverworldTunables } from "../../content/d97/tunables";
import { logEvent } from "../../logging";
import type { CompiledAnchor, CompiledDreamMap, WalkabilityGrid } from "../map/compiled";
import { isWalkable } from "../map/compiled";
import type { TilePoint } from "../map/definition";
import { findPath } from "../map/pathfinding";
import { TILED_FLIP_BITS } from "../map/tiled";
import {
  chooseZoom,
  followCamera,
  visibleTiles,
  type CameraView,
  type TileRange,
  type Viewport,
} from "./camera";
import {
  anchorAt,
  anchorsByTile,
  movementGrid,
  pathBeside,
  type InteractionRegistry,
} from "./interactions";
import {
  PLACEHOLDER_ANCHORS,
  PLACEHOLDER_GROUND,
  PLACEHOLDER_OUTLINE,
  PLACEHOLDER_PLAYER,
} from "./placeholder-palette";
import { spawnTile } from "./spawn";
import type { TileTextures } from "./tile-textures";
import {
  advanceWalker,
  faceTile,
  facedTile,
  followPath,
  holdDirection,
  initialWalker,
  isIdle,
  placeWalker,
  walkerPosition,
  type Facing,
  type WalkerState,
} from "./walker";

const FLIP_HORIZONTAL = 0x80000000;
const FLIP_VERTICAL = 0x40000000;

/** Tiles drawn beyond the view's edge so scrolling never shows a seam. */
const CULL_MARGIN = 2;

/**
 * The longest frame the walk advances by. Walking follows real elapsed time
 * (slow frames do not slow the walk), but a frame after a hidden tab does not
 * jump the player across the map.
 */
const MAX_FRAME_SECONDS = 0.25;

const KEY_DIRECTIONS: Readonly<Record<string, Facing>> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};
const INTERACT_KEYS: ReadonlySet<string> = new Set(["KeyE", "Space"]);

export interface OverworldSceneOptions {
  readonly app: Application;
  readonly map: CompiledDreamMap;
  readonly textures: TileTextures;
  readonly registry: InteractionRegistry;
  readonly tunables: D97OverworldTunables;
  /** Whether the viewport counts as desktop for zoom. */
  readonly desktop: () => boolean;
}

/** What the QA surface and the adapter can observe or drive. */
export interface OverworldSceneHandle {
  readonly walker: () => WalkerState;
  readonly camera: () => CameraView;
  readonly viewport: () => Viewport;
  readonly walkToTile: (tile: TilePoint) => boolean;
  readonly walkToAnchor: (anchor: CompiledAnchor) => boolean;
  readonly interact: () => boolean;
  /** Stand on `tile` at once, optionally facing `face`. */
  readonly teleport: (tile: TilePoint, face?: TilePoint) => boolean;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export class OverworldScene implements OverworldSceneHandle {
  private readonly app: Application;
  private readonly map: CompiledDreamMap;
  private readonly textures: TileTextures;
  private readonly registry: InteractionRegistry;
  private readonly tunables: D97OverworldTunables;
  private readonly desktop: () => boolean;
  private readonly grid: WalkabilityGrid;
  private readonly byTile: ReadonlyMap<string, CompiledAnchor>;

  private readonly world = new Container();
  private readonly ground = new Graphics();
  private readonly below = new Container();
  private readonly sorted = new Container();
  private readonly above = new Container();
  private readonly player = new Container();

  private state: WalkerState;
  private pendingAnchor: CompiledAnchor | null = null;
  private view: CameraView = { x: 0, y: 0, zoom: 1 };
  private range: TileRange | null = null;
  private inputEnabled = true;
  private readonly held: Facing[] = [];

  constructor(options: OverworldSceneOptions) {
    this.app = options.app;
    this.map = options.map;
    this.textures = options.textures;
    this.registry = options.registry;
    this.tunables = options.tunables;
    this.desktop = options.desktop;
    this.grid = movementGrid(this.map, this.map.anchors);
    this.byTile = anchorsByTile(this.map.anchors);
    this.state = initialWalker(spawnTile(this.map, this.grid));

    this.sorted.sortableChildren = true;
    this.world.addChild(this.ground, this.below, this.sorted, this.above);
    this.app.stage.addChild(this.world);
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointertap", this.onPointerTap);

    this.buildObjects();
    this.buildAnchors();
    this.buildPlayer();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.releaseKeys);
    this.app.ticker.add(this.onTick);
    this.layout();
  }

  destroy(): void {
    this.app.ticker.remove(this.onTick);
    this.app.stage.off("pointertap", this.onPointerTap);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.releaseKeys);
    this.world.destroy({ children: true });
  }

  /** While a React panel is open the canvas ignores input and the walk pauses. */
  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) this.releaseKeys();
  }

  // --- handle ---------------------------------------------------------------

  walker = (): WalkerState => this.state;
  camera = (): CameraView => this.view;
  viewport = (): Viewport => ({ width: this.app.screen.width, height: this.app.screen.height });

  walkToTile = (tile: TilePoint): boolean => {
    const anchor = anchorAt(this.byTile, tile);
    if (anchor !== undefined) return this.walkToAnchor(anchor);
    const path = findPath(this.grid, this.origin(), tile);
    if (path === null) return false;
    this.pendingAnchor = null;
    this.state = followPath(this.state, path, this.canEnter);
    return true;
  };

  walkToAnchor = (anchor: CompiledAnchor): boolean => {
    const path = pathBeside(this.grid, this.origin(), anchor.at);
    if (path === null) return false;
    this.pendingAnchor = anchor;
    this.state = followPath(this.state, path, this.canEnter);
    this.arriveIfIdle();
    return true;
  };

  interact = (): boolean => {
    const anchor = anchorAt(this.byTile, facedTile(this.state));
    if (anchor === undefined) return false;
    return this.interactWith(anchor);
  };

  teleport = (tile: TilePoint, face?: TilePoint): boolean => {
    if (!isWalkable(this.grid, tile)) return false;
    this.pendingAnchor = null;
    this.state = placeWalker(this.state, tile);
    if (face !== undefined) this.state = faceTile(this.state, face);
    this.placePlayer();
    return true;
  };

  // --- building ---------------------------------------------------------------

  private readonly canEnter = (tile: TilePoint): boolean => isWalkable(this.grid, tile);

  private origin(): TilePoint {
    return this.state.step?.to ?? this.state.tile;
  }

  private buildObjects(): void {
    for (const object of this.map.objects) {
      const texture = this.textures.get(object.gid);
      if (texture === null) continue;
      const sprite = new Sprite(texture);
      sprite.width = object.width;
      sprite.height = object.height;
      sprite.position.set(object.x, object.y - object.height);
      if (object.above) {
        this.above.addChild(sprite);
      } else {
        sprite.zIndex = object.y;
        this.sorted.addChild(sprite);
      }
    }
  }

  private buildAnchors(): void {
    const { tileWidth: w, tileHeight: h } = this.map;
    for (const anchor of this.map.anchors) {
      const color = PLACEHOLDER_ANCHORS[anchor.kind];
      const marker = new Graphics();
      const [x, y] = anchor.at;
      if (anchor.kind === "door") {
        marker.roundRect(w * 0.15, -h * 1.1, w * 0.7, h * 1.1, w * 0.3).fill(color).stroke({ color: PLACEHOLDER_OUTLINE, width: 2 });
      } else if (anchor.kind === "waypoint") {
        marker.poly([w / 2, -h * 1.2, w * 0.8, -h * 0.1, w * 0.2, -h * 0.1]).fill(color).stroke({ color: PLACEHOLDER_OUTLINE, width: 2 });
      } else if (anchor.kind === "chest" || anchor.kind === "object") {
        marker.rect(w * 0.2, -h * 0.6, w * 0.6, h * 0.5).fill(color).stroke({ color: PLACEHOLDER_OUTLINE, width: 2 });
      } else {
        drawCapsule(marker, w, h, color);
      }
      marker.position.set(x * w, (y + 1) * h);
      marker.zIndex = (y + 1) * h;
      marker.label = `anchor:${anchor.id}`;
      this.sorted.addChild(marker);
    }
  }

  private buildPlayer(): void {
    const { tileWidth: w, tileHeight: h } = this.map;
    const ring = new Graphics().ellipse(w / 2, -h * 0.08, w * 0.42, h * 0.16).stroke({ color: PLACEHOLDER_PLAYER.ring, width: 3 });
    const body = new Graphics();
    drawCapsule(body, w, h, PLACEHOLDER_PLAYER.body);
    this.player.addChild(ring, body);
    this.player.label = "player";
    this.sorted.addChild(this.player);
    this.placePlayer();
  }

  // --- frame ------------------------------------------------------------------

  private readonly onTick = (): void => {
    if (this.inputEnabled) {
      const before = this.state;
      const seconds = Math.min(this.app.ticker.elapsedMS / 1000, MAX_FRAME_SECONDS);
      this.state = advanceWalker(this.state, seconds, this.tunables.walkTilesPerSecond, this.canEnter);
      if (before.step !== null && this.state.step === null) this.arriveIfIdle();
    }
    this.placePlayer();
    this.layout();
  };

  private arriveIfIdle(): void {
    const anchor = this.pendingAnchor;
    if (anchor === null || !isIdle(this.state)) return;
    this.pendingAnchor = null;
    const [x, y] = this.state.tile;
    if (Math.abs(x - anchor.at[0]) + Math.abs(y - anchor.at[1]) !== 1) return;
    this.state = faceTile(this.state, anchor.at);
    this.interactWith(anchor);
  }

  private interactWith(anchor: CompiledAnchor): boolean {
    const handled = this.registry.interact(anchor);
    logEvent("d97_overworld_interaction", {
      mapId: this.map.id,
      anchorId: anchor.id,
      kind: anchor.kind,
      handled,
    });
    return handled;
  }

  private placePlayer(): void {
    const position = walkerPosition(this.state);
    const zoom = this.view.zoom;
    const x = Math.round(position.x * this.map.tileWidth * zoom) / zoom;
    const footY = Math.round((position.y + 1) * this.map.tileHeight * zoom) / zoom;
    this.player.position.set(x, footY);
    this.player.zIndex = footY;
  }

  private layout(): void {
    const viewport = this.viewport();
    const zoom = chooseZoom(viewport, this.map.tileWidth, this.desktop(), this.tunables);
    const position = walkerPosition(this.state);
    this.view = followCamera(
      { x: (position.x + 0.5) * this.map.tileWidth, y: (position.y + 0.5) * this.map.tileHeight },
      viewport,
      this.map,
      zoom,
    );
    this.world.scale.set(zoom);
    this.world.position.set(-this.view.x * zoom, -this.view.y * zoom);
    const range = visibleTiles(this.view, viewport, this.map, CULL_MARGIN);
    const previous = this.range;
    if (
      previous === null ||
      previous.x0 !== range.x0 ||
      previous.y0 !== range.y0 ||
      previous.x1 !== range.x1 ||
      previous.y1 !== range.y1
    ) {
      this.range = range;
      this.drawRange(range);
    }
  }

  /** Redraw the ground and tile layers for the tiles in `range`. */
  private drawRange(range: TileRange): void {
    const { tileWidth: w, tileHeight: h, width } = this.map;
    this.ground.clear();
    for (let y = range.y0; y <= range.y1; y += 1) {
      for (let x = range.x0; x <= range.x1; x += 1) {
        const walkable = this.map.walkable[y * width + x] === "1";
        const color = walkable
          ? (x + y) % 2 === 0
            ? PLACEHOLDER_GROUND.walkable
            : PLACEHOLDER_GROUND.walkableAlternate
          : PLACEHOLDER_GROUND.blocked;
        this.ground.rect(x * w, y * h, w, h).fill(color);
      }
    }
    for (const container of [this.below, this.above]) {
      for (const child of container.removeChildren()) child.destroy();
    }
    for (const layer of this.map.layers) {
      const target = new Container();
      target.alpha = layer.opacity;
      target.position.set(layer.offset.x, layer.offset.y);
      for (let y = range.y0; y <= range.y1; y += 1) {
        for (let x = range.x0; x <= range.x1; x += 1) {
          const gid = layer.gids[y * width + x];
          if (gid === undefined || (gid & ~TILED_FLIP_BITS) === 0) continue;
          const texture = this.textures.get(gid);
          if (texture === null) continue;
          const sprite = new Sprite(texture);
          const flipX = (gid & FLIP_HORIZONTAL) !== 0;
          const flipY = (gid & FLIP_VERTICAL) !== 0;
          sprite.anchor.set(flipX ? 1 : 0, flipY ? 1 : 0);
          sprite.scale.set(flipX ? -1 : 1, flipY ? -1 : 1);
          // Oversized tiles draw bottom-left aligned to their cell, as in Tiled.
          sprite.position.set(x * w, (y + 1) * h - texture.height);
          target.addChild(sprite);
        }
      }
      if (target.children.length === 0) {
        target.destroy();
        continue;
      }
      (layer.above ? this.above : this.below).addChild(target);
    }
  }

  // --- input ------------------------------------------------------------------

  private readonly onPointerTap = (event: FederatedPointerEvent): void => {
    if (!this.inputEnabled) return;
    const tile: TilePoint = [
      Math.floor((event.global.x / this.view.zoom + this.view.x) / this.map.tileWidth),
      Math.floor((event.global.y / this.view.zoom + this.view.y) / this.map.tileHeight),
    ];
    this.walkToTile(tile);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.inputEnabled || isEditable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    const direction = KEY_DIRECTIONS[event.code];
    if (direction !== undefined) {
      event.preventDefault();
      if (event.repeat) return;
      this.held.push(direction);
      this.pendingAnchor = null;
      this.state = holdDirection(this.state, direction, this.canEnter);
      return;
    }
    if (INTERACT_KEYS.has(event.code)) {
      event.preventDefault();
      if (!event.repeat) this.interact();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const direction = KEY_DIRECTIONS[event.code];
    if (direction === undefined) return;
    const index = this.held.lastIndexOf(direction);
    if (index !== -1) this.held.splice(index, 1);
    this.state = holdDirection(this.state, this.held[this.held.length - 1] ?? null, this.canEnter);
  };

  private readonly releaseKeys = (): void => {
    this.held.length = 0;
    this.state = holdDirection(this.state, null, this.canEnter);
  };
}

/** A capsule character standing on its tile's bottom edge. */
function drawCapsule(graphics: Graphics, w: number, h: number, color: number): void {
  graphics
    .ellipse(w / 2, -h * 0.06, w * 0.3, h * 0.1)
    .fill({ color: PLACEHOLDER_OUTLINE, alpha: 0.35 })
    .roundRect(w * 0.25, -h * 1.05, w * 0.5, h, w * 0.25)
    .fill(color)
    .stroke({ color: PLACEHOLDER_OUTLINE, width: 2 });
}
