// The overworld's Pixi scene: the compiled map's tile layers drawn with
// off-screen culling, a y-sorted layer of tile objects, anchor markers and
// the player, the above-player layers, placeholder ground and capsules where
// art is missing, a camera that follows the player at whole-number zoom, and
// P14 input (keyboard steps, click or tap walking along A* paths, interact).
// Only animation and the walk live here; nothing it does is game state.

import { Container, Graphics, Sprite, type Application, type FederatedPointerEvent } from "pixi.js";
import type { D97CharacterTunables, D97OverworldTunables } from "../../content/d97/tunables";
import type { D97CharacterId, DreamAnchorId } from "../../types/identifiers";
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
import { anchorAt, pathBeside, shownMovement, type AnchorMovement, type InteractionRegistry } from "./interactions";
import { blockingGuardian, standingAnchors } from "./chokepoint";
import { DreamVeil, WaypointObelisk, type VeilVariant } from "./dream-veil";
import { idleFacing } from "./characters/animation";
import { BADGE_HEIGHT, BADGE_WIDTH, drawBadge, orderBadges, type BadgeKind } from "./characters/badges";
import type { CharacterLooks } from "./characters/character-looks";
import { CharacterView } from "./characters/character-view";
import { presentAnchors, type OverworldOccupants } from "./occupants";
import {
  drawCapsule,
  PLACEHOLDER_ANCHORS,
  PLACEHOLDER_GROUND,
  PLACEHOLDER_OUTLINE,
  PLACEHOLDER_PLAYER,
  BEATEN_TINT,
} from "./placeholder-palette";
import { arrivalPlacement, type OverworldArrival } from "./spawn";
import type { TileTextures } from "./tile-textures";
import {
  advanceWalker,
  FACING_STEPS,
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
  readonly characterTunables: D97CharacterTunables;
  /** Loaded looks for the occupants' and the player's characters. */
  readonly looks: CharacterLooks;
  readonly occupants: OverworldOccupants;
  /** The character the player walks as. */
  /** The player's look; null draws the player as a capsule. */
  readonly playerCharacter: D97CharacterId | null;
  /** Where the player starts: after a battle, or at the last door or waypoint used. */
  readonly arrival: OverworldArrival | null;
  /** Each door's veil; a door missing here shows the unexplored veil. */
  readonly veils: ReadonlyMap<DreamAnchorId, VeilVariant>;
  /** Activated waypoints, lit when the scene opens. */
  readonly activeWaypointIds: ReadonlySet<DreamAnchorId>;
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
  /** The characters at anchors and the player's look, for QA. */
  readonly characters: () => OverworldCharactersState;
  /** Anchors drawn and interactive neither (quest objects out of their quest). */
  readonly hiddenAnchorIds: () => readonly DreamAnchorId[];
  /** The grid the player walks on now: shown anchors block their tiles, hidden ones do not. */
  readonly grid: () => WalkabilityGrid;
  /** The anchors where they stand (beaten guardians moved aside). */
  readonly anchors: () => readonly CompiledAnchor[];
  /** The door veils and waypoint states drawn, for QA. */
  readonly markers: () => OverworldMarkersState;
  /** Every anchor with a view in the world (veil, marker or character), for QA. */
  readonly drawnAnchorIds: () => readonly DreamAnchorId[];
  /** The player's on-screen box in CSS pixels, for QA. */
  readonly playerScreenRect: () => { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** The player's body (a tile wide, feet to head) on screen, in CSS pixels. */
  readonly playerBodyScreenRect: () => { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
}

export interface OverworldMarkersState {
  readonly veils: readonly { readonly anchorId: DreamAnchorId; readonly variant: VeilVariant }[];
  readonly waypoints: readonly { readonly anchorId: DreamAnchorId; readonly active: boolean }[];
}

export interface OverworldCharactersState {
  readonly playerLayered: boolean;
  readonly residents: readonly {
    readonly anchorId: CompiledAnchor["id"];
    readonly facing: Facing;
    readonly layered: boolean;
    readonly badge: {
      readonly kind: BadgeKind;
      readonly alpha: number;
      readonly zIndex: number;
      /** The badge's box on screen, in CSS pixels. */
      readonly screenRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    } | null;
  }[];
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
  private readonly characterTunables: D97CharacterTunables;
  private readonly looks: CharacterLooks;
  private readonly occupants: OverworldOccupants;
  private readonly playerCharacter: D97CharacterId | null;
  private readonly desktop: () => boolean;
  private readonly anchorsStanding: readonly CompiledAnchor[];
  /** Unbeaten guardians, which close their chokepoints. */
  private readonly standingGuardians: readonly CompiledAnchor[];
  /** Walking and interaction among the shown anchors; rebuilt when visibility changes. */
  private movement: AnchorMovement;
  private readonly veils: ReadonlyMap<DreamAnchorId, VeilVariant>;
  private readonly veilViews = new Map<DreamAnchorId, DreamVeil>();
  private readonly waypointViews = new Map<DreamAnchorId, WaypointObelisk>();
  /** The guardian tile the held direction last walked into, so one bump opens one preview. */
  private bumped: string | null = null;

  private readonly world = new Container();
  private readonly ground = new Graphics();
  private readonly below = new Container();
  private readonly sorted = new Container();
  private readonly above = new Container();
  private readonly badges = new Container();
  private readonly player = new Container();
  private playerView: CharacterView | null = null;
  /** Characters standing at anchors, with their badges. */
  private readonly residents: {
    readonly anchor: CompiledAnchor;
    readonly view: CharacterView;
    /** The occupant's role badge, shown unless an override replaces it. */
    readonly roleBadge: BadgeKind | null;
    badgeKind: BadgeKind | null;
    badge: Graphics | null;
  }[] = [];
  /** The drawn marker or character of each anchor. */
  private readonly anchorViews = new Map<DreamAnchorId, Container>();
  private hidden: ReadonlySet<DreamAnchorId> = new Set();
  private clock = 0;

  private state: WalkerState;
  private pendingAnchor: CompiledAnchor | null = null;
  private view: CameraView = { x: 0, y: 0, zoom: 1 };
  private range: TileRange | null = null;
  private inputEnabled = true;
  private hudInset = 0;
  private readonly held: Facing[] = [];

  constructor(options: OverworldSceneOptions) {
    this.app = options.app;
    this.map = options.map;
    this.textures = options.textures;
    this.registry = options.registry;
    this.tunables = options.tunables;
    this.characterTunables = options.characterTunables;
    this.looks = options.looks;
    this.occupants = options.occupants;
    this.playerCharacter = options.playerCharacter;
    this.desktop = options.desktop;
    this.veils = options.veils;
    const beaten = new Set([...this.occupants].filter(([, occupant]) => occupant.beaten === true).map(([anchorId]) => anchorId));
    // A character anchor nobody stands at is empty ground: not drawn, walked
    // through and never interacted with.
    this.anchorsStanding = standingAnchors({ ...this.map, anchors: presentAnchors(this.map.anchors, this.occupants) }, beaten);
    this.standingGuardians = this.anchorsStanding.filter((anchor) => anchor.kind === "guardian" && !beaten.has(anchor.id));
    this.movement = shownMovement(this.map, this.anchorsStanding, this.hidden);
    const arrival = arrivalPlacement(this.map, this.anchorsStanding, this.movement.grid, options.arrival);
    this.state = initialWalker(arrival.tile);
    if (arrival.face !== null) this.state = faceTile(this.state, arrival.face);

    this.sorted.sortableChildren = true;
    this.badges.sortableChildren = true;
    this.world.addChild(this.ground, this.below, this.sorted, this.above, this.badges);
    this.app.stage.addChild(this.world);
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointertap", this.onPointerTap);

    this.buildObjects();
    this.buildAnchors();
    this.setBadges(new Map());
    this.setActiveWaypoints(options.activeWaypointIds);
    this.buildPlayer();
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.releaseKeys);
    this.app.ticker.add(this.onTick);
    this.layout();
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.releaseKeys);
    // When the canvas unmounts, @pixi/react may destroy the application (its
    // ticker, stage and display tree) before this cleanup runs.
    const app = this.app as Partial<Application>;
    app.ticker?.remove(this.onTick);
    app.stage?.off("pointertap", this.onPointerTap);
    if (!this.world.destroyed) this.world.destroy({ children: true });
  }

  /**
   * Show `overrides` (quest icons) over the characters at their anchors in
   * place of their role badges; every other character shows its role badge.
   */
  setBadges(overrides: ReadonlyMap<DreamAnchorId, BadgeKind>): void {
    for (const resident of this.residents) {
      const kind = overrides.get(resident.anchor.id) ?? resident.roleBadge;
      if (kind === resident.badgeKind) continue;
      resident.badge?.destroy();
      resident.badge = null;
      resident.badgeKind = kind;
      if (kind !== null) {
        const badge = drawBadge(new Graphics(), kind);
        badge.label = `badge:${resident.anchor.id}`;
        badge.visible = !this.hidden.has(resident.anchor.id);
        this.badges.addChild(badge);
        resident.badge = badge;
      }
    }
  }

  /**
   * Hide `anchorIds`: they are neither drawn nor interactive, and the player
   * walks through their tiles. A shown anchor blocks its tile again; a walk
   * whose path crosses it stops before stepping in.
   */
  setHiddenAnchors(anchorIds: ReadonlySet<DreamAnchorId>): void {
    this.hidden = anchorIds;
    this.movement = shownMovement(this.map, this.anchorsStanding, anchorIds);
    for (const [id, view] of this.anchorViews) view.visible = !anchorIds.has(id);
    for (const { anchor, badge } of this.residents) {
      if (badge !== null) badge.visible = !anchorIds.has(anchor.id);
    }
    if (this.pendingAnchor !== null && anchorIds.has(this.pendingAnchor.id)) this.pendingAnchor = null;
  }

  /** Light the activated waypoints and leave the rest dormant. */
  setActiveWaypoints(active: ReadonlySet<DreamAnchorId>): void {
    for (const [anchorId, view] of this.waypointViews) view.setActive(active.has(anchorId));
  }

  /**
   * Screen pixels at the bottom the HUD controls cover; the camera keeps the
   * world it frames, and so the player, above them by the HUD clearance.
   */
  setHudInset(bottom: number): void {
    this.hudInset = Math.max(0, bottom);
    this.layout();
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

  drawnAnchorIds = (): readonly DreamAnchorId[] => [...this.anchorViews.keys()];

  playerScreenRect = () => {
    const bounds = this.player.getBounds();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  };

  walkToTile = (tile: TilePoint): boolean => {
    const anchor = this.shownAnchorAt(tile);
    if (anchor !== undefined) return this.walkToAnchor(anchor);
    const path = findPath(this.movement.grid, this.origin(), tile);
    if (path === null) return this.walkToBlockingGuardian(tile, false);
    this.pendingAnchor = null;
    this.state = followPath(this.state, path, this.canEnter);
    return true;
  };

  walkToAnchor = (anchor: CompiledAnchor): boolean => {
    if (this.hidden.has(anchor.id)) return false;
    const path = pathBeside(this.movement.grid, this.origin(), anchor.at);
    if (path === null) return this.walkToBlockingGuardian(anchor.at, true);
    this.pendingAnchor = anchor;
    this.state = followPath(this.state, path, this.canEnter);
    this.arriveIfIdle();
    return true;
  };

  interact = (): boolean => {
    const anchor = this.shownAnchorAt(facedTile(this.state));
    if (anchor === undefined) return false;
    return this.interactWith(anchor);
  };

  teleport = (tile: TilePoint, face?: TilePoint): boolean => {
    if (!isWalkable(this.movement.grid, tile)) return false;
    this.pendingAnchor = null;
    this.state = placeWalker(this.state, tile);
    if (face !== undefined) this.state = faceTile(this.state, face);
    this.placePlayer();
    return true;
  };

  characters = (): OverworldCharactersState => ({
    playerLayered: this.playerView?.layered ?? false,
    residents: this.residents.map(({ anchor, view, badge, badgeKind }) => ({
      anchorId: anchor.id,
      facing: view.currentFacing,
      layered: view.layered,
      badge:
        badge === null || badgeKind === null
          ? null
          : {
              kind: badgeKind,
              alpha: badge.alpha,
              zIndex: badge.zIndex,
              screenRect: {
                x: (badge.x - this.view.x) * this.view.zoom,
                y: (badge.y - this.view.y) * this.view.zoom,
                width: BADGE_WIDTH * this.view.zoom,
                height: BADGE_HEIGHT * this.view.zoom,
              },
            },
    })),
  });

  hiddenAnchorIds = (): readonly DreamAnchorId[] => [...this.hidden];

  grid = (): WalkabilityGrid => this.movement.grid;

  anchors = (): readonly CompiledAnchor[] => this.anchorsStanding;

  markers = (): OverworldMarkersState => ({
    veils: [...this.veilViews].map(([anchorId, view]) => ({ anchorId, variant: view.variant })),
    waypoints: [...this.waypointViews].map(([anchorId, view]) => ({ anchorId, active: view.isActive })),
  });

  // --- building ---------------------------------------------------------------

  private readonly canEnter = (tile: TilePoint): boolean => isWalkable(this.movement.grid, tile);

  /** The shown anchor on `tile`, if any. */
  private shownAnchorAt(tile: TilePoint): CompiledAnchor | undefined {
    return anchorAt(this.movement.byTile, tile);
  }

  private origin(): TilePoint {
    return this.state.step?.to ?? this.state.tile;
  }

  /**
   * Walking toward something an unbeaten guardian's chokepoint closes off
   * walks to the guardian instead, which opens its preview (Appendix B §B5).
   */
  private walkToBlockingGuardian(tile: TilePoint, beside: boolean): boolean {
    const found = blockingGuardian(this.movement.grid, this.standingGuardians, this.origin(), { tile, beside });
    if (found === null) return false;
    logEvent("d97_chokepoint_blocked", { mapId: this.map.id, guardianAnchorId: found.guardian.id, target: tile });
    this.pendingAnchor = found.guardian;
    this.state = followPath(this.state, found.path, this.canEnter);
    this.arriveIfIdle();
    return true;
  }

  /** A held step into an unbeaten guardian opens its preview, once per bump. */
  private bumpGuardian(): void {
    const direction = this.held[this.held.length - 1];
    if (direction === undefined || !isIdle(this.state)) return;
    const [dx, dy] = FACING_STEPS[direction];
    const ahead: TilePoint = [this.state.tile[0] + dx, this.state.tile[1] + dy];
    const guardian = this.standingGuardians.find((candidate) => candidate.at[0] === ahead[0] && candidate.at[1] === ahead[1]);
    const key = guardian === undefined ? null : `${String(ahead[0])},${String(ahead[1])}`;
    if (guardian === undefined || key === this.bumped) {
      this.bumped = key;
      return;
    }
    this.bumped = key;
    this.state = faceTile(this.state, guardian.at);
    this.interactWith(guardian);
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
    this.anchorsStanding.forEach((anchor, index) => {
      const color = PLACEHOLDER_ANCHORS[anchor.kind];
      const [x, y] = anchor.at;
      if (anchor.kind === "door" || anchor.kind === "waypoint") {
        const view =
          anchor.kind === "door"
            ? new DreamVeil(this.veils.get(anchor.id) ?? "unexplored", w, h, index + 1)
            : new WaypointObelisk(w, h, index + 1);
        if (view instanceof DreamVeil) this.veilViews.set(anchor.id, view);
        else this.waypointViews.set(anchor.id, view);
        view.position.set(x * w, (y + 1) * h);
        view.zIndex = (y + 1) * h;
        view.label = `${anchor.kind}:${anchor.id}`;
        this.sorted.addChild(view);
        this.anchorViews.set(anchor.id, view);
        return;
      }
      const marker = new Graphics();
      if (anchor.kind === "chest" || anchor.kind === "object") {
        marker.rect(w * 0.2, -h * 0.6, w * 0.6, h * 0.5).fill(color).stroke({ color: PLACEHOLDER_OUTLINE, width: 2 });
      } else {
        const occupant = this.occupants.get(anchor.id);
        if (occupant !== undefined) {
          this.addResident(anchor, occupant);
          return;
        }
        drawCapsule(marker, w, h, color);
      }
      marker.position.set(x * w, (y + 1) * h);
      marker.zIndex = (y + 1) * h;
      marker.label = `anchor:${anchor.id}`;
      this.sorted.addChild(marker);
      this.anchorViews.set(anchor.id, marker);
    });
  }

  private addResident(anchor: CompiledAnchor, occupant: NonNullable<ReturnType<OverworldOccupants["get"]>>): void {
    const { tileWidth: w, tileHeight: h } = this.map;
    const view = new CharacterView(
      this.looks.get(occupant.character) ?? null,
      this.characterTunables.scales[occupant.scale],
      w,
      h,
      PLACEHOLDER_ANCHORS[anchor.kind],
    );
    const [x, y] = anchor.at;
    view.position.set(x * w + w / 2, (y + 1) * h);
    view.zIndex = (y + 1) * h;
    view.label = `character:${anchor.id}`;
    if (occupant.beaten === true) view.tint = BEATEN_TINT;
    this.sorted.addChild(view);
    this.anchorViews.set(anchor.id, view);
    this.residents.push({ anchor, view, roleBadge: occupant.badge, badgeKind: null, badge: null });
  }

  private buildPlayer(): void {
    const { tileWidth: w, tileHeight: h } = this.map;
    // The gold rune ring marks "you"; the player never carries a badge.
    const ring = new Graphics().ellipse(w / 2, -h * 0.08, w * 0.42, h * 0.16).stroke({ color: PLACEHOLDER_PLAYER.ring, width: 3 });
    const body = new CharacterView(
      (this.playerCharacter === null ? undefined : this.looks.get(this.playerCharacter)) ?? null,
      this.characterTunables.scales.standard,
      w,
      h,
      PLACEHOLDER_PLAYER.body,
    );
    body.position.set(w / 2, 0);
    this.playerView = body;
    this.player.addChild(ring, body);
    this.player.label = "player";
    this.sorted.addChild(this.player);
    this.placePlayer();
  }

  // --- frame ------------------------------------------------------------------

  private readonly onTick = (): void => {
    const seconds = Math.min(this.app.ticker.elapsedMS / 1000, MAX_FRAME_SECONDS);
    if (this.inputEnabled) {
      const before = this.state;
      this.state = advanceWalker(this.state, seconds, this.tunables.walkTilesPerSecond, this.canEnter);
      if (before.step !== null && this.state.step === null) this.arriveIfIdle();
      this.bumpGuardian();
    }
    this.clock += seconds;
    for (const view of this.veilViews.values()) view.advance(seconds);
    for (const view of this.waypointViews.values()) view.advance(seconds);
    this.placePlayer();
    this.animateCharacters(this.inputEnabled ? seconds : 0, seconds);
    this.layout();
  };

  /**
   * Pose and animate every character by `seconds`, then stack and fade their
   * badges over `fadeSeconds` of real time; a badge that would cover the
   * player's body fades out until the player steps away.
   */
  private animateCharacters(seconds: number, fadeSeconds: number): void {
    const tunables = this.characterTunables;
    const moving = this.state.step !== null;
    this.playerView?.setPose(this.state.facing, moving);
    this.playerView?.advance(seconds, tunables);
    const player = walkerPosition(this.state);
    const bob = Math.round(
      ((1 - Math.cos((2 * Math.PI * this.clock) / tunables.badgeBobSeconds)) / 2) * tunables.badgeBobPixels,
    );
    const placements: { x: number; y: number; distance: number }[] = [];
    const badged: Graphics[] = [];
    for (const { anchor, view, badge } of this.residents) {
      view.setPose(idleFacing(anchor.at, player, tunables.faceRangeTiles), false);
      view.advance(seconds, tunables);
      if (badge === null || !badge.visible) continue;
      const x = Math.round(view.x - BADGE_WIDTH / 2);
      const y = Math.round(view.y - view.headHeight - BADGE_HEIGHT - 2 - bob);
      badge.position.set(x, y);
      placements.push({ x, y, distance: Math.hypot(anchor.at[0] - player.x, anchor.at[1] - player.y) });
      badged.push(badge);
    }
    const step = tunables.badgeFadeSeconds <= 0 ? 1 : fadeSeconds / tunables.badgeFadeSeconds;
    orderBadges(placements, BADGE_WIDTH, BADGE_HEIGHT, this.playerBody()).forEach((order, index) => {
      const badge = badged[index];
      if (badge === undefined) return;
      badge.zIndex = order.zIndex;
      const target = order.hidden ? 0 : order.faded ? tunables.badgeOverlapAlpha : 1;
      badge.alpha = target > badge.alpha ? Math.min(target, badge.alpha + step) : Math.max(target, badge.alpha - step);
    });
  }

  /** The player's body in world pixels: a tile wide, from the feet to the top of the head. */
  private playerBody(): { x: number; y: number; width: number; height: number } | null {
    const view = this.playerView;
    if (view === null) return null;
    const { x, y } = this.player.position;
    return { x, y: y - view.headHeight, width: this.map.tileWidth, height: view.headHeight };
  }

  playerBodyScreenRect = () => {
    const body = this.playerBody();
    if (body === null) return null;
    const zoom = this.view.zoom;
    return {
      x: (body.x - this.view.x) * zoom,
      y: (body.y - this.view.y) * zoom,
      width: body.width * zoom,
      height: body.height * zoom,
    };
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
    const zoom = chooseZoom(viewport, this.map.tileWidth, this.desktop(), this.tunables, this.app.renderer.resolution);
    const position = walkerPosition(this.state);
    this.view = followCamera(
      { x: (position.x + 0.5) * this.map.tileWidth, y: (position.y + 0.5) * this.map.tileHeight },
      viewport,
      this.map,
      zoom,
      { bottom: this.hudInset === 0 ? 0 : this.hudInset + this.tunables.hudClearancePx },
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
