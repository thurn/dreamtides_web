// What the player can interact with on the overworld: anchors stand on their
// tiles (which the player cannot enter), the player interacts with the anchor
// it faces, and a click on an anchor walks to the nearest tile beside it. A
// hidden anchor is neither: its tile is open ground.
// What an interaction does is `resolveInteraction`, one exhaustive case per
// anchor kind: the intent events to append, the panel to open, or a refusal,
// with the log records the overworld writes for it. Refusals come from the
// rules' own predicates (`doorRefusal`, `waypointRefusal`, `isDreamShop`,
// `battleRefusal`, `roomPassage`), so the overworld never offers what the
// reducer bounces. A building door steps into or out of one of the dream's
// rooms (decision P19).
// Battle residents route through ./encounter-routing.ts. Pure.

import type { D97DreamRoom, D97DreamTopology } from "../../content/d97/dreams/schema";
import { battleRefusal } from "../../rules/d97/d97-encounters";
import { roomPassage } from "../../rules/d97/d97-rooms";
import { isDreamShop } from "../../rules/d97/d97-shop";
import type { D97Run } from "../../rules/d97/d97-state";
import { doorRefusal, waypointRefusal } from "../../rules/d97/d97-travel";
import type { D97Intent } from "../../rules/d97/events";
import type { DreamAnchorId } from "../../types/identifiers";
import { findPath } from "../map/pathfinding";
import { isWalkable, type CompiledAnchor, type WalkabilityGrid } from "../map/compiled";
import type { TilePoint } from "../map/definition";
import { routeBattleResident, routeChallenge } from "./encounter-routing";
import type { OverworldOccupants } from "./occupants";
import { FACING_STEPS } from "./walker";

/** What an interaction reads: the run, its dream's topology and rooms, and who stands where. */
export interface InteractionContext {
  readonly run: D97Run;
  readonly topology: D97DreamTopology;
  readonly rooms: readonly D97DreamRoom[];
  readonly occupants: OverworldOccupants;
}

/** A panel an interaction opens. */
export type InteractionPanel =
  | { readonly kind: "conversation"; readonly anchorId: DreamAnchorId }
  | { readonly kind: "shop"; readonly anchorId: DreamAnchorId }
  | { readonly kind: "preview"; readonly anchorId: DreamAnchorId }
  | { readonly kind: "deck" };

/** Why an interaction does nothing. `noInteraction`: the anchor's kind has none. */
export type InteractionRefusal =
  | "noInteraction"
  | "silent"
  | "beaten"
  | "notPreviewed"
  | "deckTooSmall"
  | "noDestination"
  | "guardianStanding"
  | "notTheWaypoint"
  | "notTheShop"
  | "noRoom"
  | "notHere";

/** A record the overworld logs for an interaction. */
export interface InteractionLog {
  readonly event: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface InteractionResult {
  readonly intents: readonly D97Intent[];
  readonly open?: InteractionPanel;
  readonly refusal?: InteractionRefusal;
  readonly logs: readonly InteractionLog[];
}

const refuse = (refusal: InteractionRefusal, logs: readonly InteractionLog[] = []): InteractionResult => ({ intents: [], refusal, logs });

function hasDialogue({ occupants }: InteractionContext, anchorId: DreamAnchorId): boolean {
  return occupants.get(anchorId)?.dialogue != null;
}

/** Open the conversation with the resident at `anchorId`. */
function converse({ run }: InteractionContext, anchorId: DreamAnchorId): InteractionResult {
  return {
    intents: [],
    open: { kind: "conversation", anchorId },
    logs: [{ event: "d97_dialogue_opened", fields: { runId: run.runId, anchorId } }],
  };
}

/** Talk to the resident at `anchorId`; one without a dialogue stays silent. */
function talk(ctx: InteractionContext, anchorId: DreamAnchorId): InteractionResult {
  return hasDialogue(ctx, anchorId) ? converse(ctx, anchorId) : refuse("silent");
}

/**
 * Open the encounter preview at `anchorId`, as interacting with it or a
 * dialogue's challenge does: never for a beaten opponent; the first opening
 * records the encounter.
 */
export function resolveChallenge({ run }: InteractionContext, anchorId: DreamAnchorId): InteractionResult {
  const encounter = run.encounters[anchorId];
  if (routeChallenge({ beaten: encounter?.beaten === true }) === "none") return refuse("beaten");
  const firstPreview = encounter === undefined;
  return {
    intents: firstPreview ? [{ type: "D97_PREVIEW_ENCOUNTER", payload: { anchorId } }] : [],
    open: { kind: "preview", anchorId },
    logs: [{ event: "d97_encounter_opened", fields: { runId: run.runId, anchorId, firstPreview } }],
  };
}

/** Open the dream's shop at `anchorId`, from its shopkeeper or a conversation's hand-off. */
export function resolveShopOpening({ topology }: InteractionContext, anchorId: DreamAnchorId): InteractionResult {
  if (!isDreamShop(topology, anchorId)) return refuse("notTheShop");
  return { intents: [{ type: "D97_OPEN_SHOP", payload: { anchorId } }], open: { kind: "shop", anchorId }, logs: [] };
}

/** Fight in the preview at `anchorId`: a deck below its minimum opens the deck editor instead. */
export function resolveFight({ run }: InteractionContext, anchorId: DreamAnchorId): InteractionResult {
  const refusal = battleRefusal(run, anchorId);
  if (refusal === "deckTooSmall") {
    return {
      intents: [],
      open: { kind: "deck" },
      refusal,
      logs: [
        { event: "d97_encounter_deck_too_small", fields: { runId: run.runId, anchorId } },
        { event: "d97_deck_editor_opened", fields: { runId: run.runId } },
      ],
    };
  }
  return refusal === null ? { intents: [{ type: "D97_BEGIN_BATTLE", payload: { anchorId } }], logs: [] } : refuse(refusal);
}

function battleResident(ctx: InteractionContext, anchor: CompiledAnchor): InteractionResult {
  const route = routeBattleResident({ hasDialogue: hasDialogue(ctx, anchor.id), beaten: ctx.run.encounters[anchor.id]?.beaten === true });
  const routed: InteractionLog = { event: "d97_battle_resident_routed", fields: { runId: ctx.run.runId, anchorId: anchor.id, kind: anchor.kind, route } };
  const result = route === "conversation" ? converse(ctx, anchor.id) : route === "preview" ? resolveChallenge(ctx, anchor.id) : refuse("beaten");
  return { ...result, logs: [routed, ...result.logs] };
}

function door({ run, topology }: InteractionContext, anchorId: DreamAnchorId): InteractionResult {
  const reason = doorRefusal(run, topology, anchorId);
  if (reason !== null) return refuse(reason, [{ event: "d97_door_unopened", fields: { runId: run.runId, anchorId, reason } }]);
  return { intents: [{ type: "D97_STEP_THROUGH_DOOR", payload: { anchorId } }], logs: [] };
}

/** Step through the building door at `anchorId`: into its room, or out of the room the player is in. */
function buildingDoor({ run, rooms }: InteractionContext, anchorId: DreamAnchorId): InteractionResult {
  const passage = roomPassage(run, rooms, anchorId);
  if (passage.kind === "refused") {
    return refuse(passage.refusal, [{ event: "d97_door_unopened", fields: { runId: run.runId, anchorId, reason: passage.refusal } }]);
  }
  const type = passage.kind === "enter" ? "D97_ENTER_ROOM" : "D97_LEAVE_ROOM";
  return { intents: [{ type, payload: { anchorId } }], logs: [] };
}

/** What interacting with `anchor` does, by its kind. */
export function resolveInteraction(ctx: InteractionContext, anchor: CompiledAnchor): InteractionResult {
  const anchorId = anchor.id;
  switch (anchor.kind) {
    case "friendly":
    case "townsfolk":
      return talk(ctx, anchorId);
    // A shopkeeper with a dialogue talks first (its Shop choice opens the
    // shop); one without opens the shop at once.
    case "shop":
      return hasDialogue(ctx, anchorId) ? converse(ctx, anchorId) : resolveShopOpening(ctx, anchorId);
    case "challenger":
    case "guardian":
      return battleResident(ctx, anchor);
    case "object":
      return { intents: [{ type: "D97_PICK_UP_OBJECT", payload: { anchorId } }], logs: [] };
    case "waypoint": {
      const refusal = waypointRefusal(ctx.topology, anchorId);
      return refusal === null ? { intents: [{ type: "D97_ACTIVATE_WAYPOINT", payload: { anchorId } }], logs: [] } : refuse(refusal);
    }
    case "door":
      return door(ctx, anchorId);
    case "buildingDoor":
      return buildingDoor(ctx, anchorId);
    case "chest":
      return refuse("noInteraction");
    default: {
      const unhandled: never = anchor.kind;
      throw new Error(`Unknown anchor kind ${String(unhandled)}`);
    }
  }
}

function key([x, y]: TilePoint): string {
  return `${String(x)},${String(y)}`;
}

/** The anchor standing on each occupied tile. */
function anchorsByTile(
  anchors: readonly CompiledAnchor[],
): ReadonlyMap<string, CompiledAnchor> {
  return new Map(anchors.map((anchor) => [key(anchor.at), anchor]));
}

/** The anchor on `tile`, if any. */
export function anchorAt(
  byTile: ReadonlyMap<string, CompiledAnchor>,
  tile: TilePoint,
): CompiledAnchor | undefined {
  return byTile.get(key(tile));
}

/**
 * The grid the player walks on: the map's walkability with every anchor's
 * tile blocked, since anchors stand where they are.
 */
export function movementGrid(
  grid: WalkabilityGrid,
  anchors: readonly CompiledAnchor[],
): WalkabilityGrid {
  const cells = Array.from(grid.walkable);
  for (const { at } of anchors) {
    if (isWalkable(grid, at)) cells[at[1] * grid.width + at[0]] = "0";
  }
  return { width: grid.width, height: grid.height, walkable: cells.join("") };
}

/** What the player walks around and interacts with among the shown anchors. */
export interface AnchorMovement {
  readonly grid: WalkabilityGrid;
  readonly byTile: ReadonlyMap<string, CompiledAnchor>;
}

/**
 * Movement among `anchors` with the `hidden` ones left out: a hidden anchor
 * blocks no tile and stands on none.
 */
export function shownMovement(
  grid: WalkabilityGrid,
  anchors: readonly CompiledAnchor[],
  hidden: ReadonlySet<DreamAnchorId>,
): AnchorMovement {
  const shown = anchors.filter((anchor) => !hidden.has(anchor.id));
  return { grid: movementGrid(grid, shown), byTile: anchorsByTile(shown) };
}

/**
 * The shortest walk on `grid` (a movement grid) from `from` to a tile beside
 * `target`, or null when none is reachable. Standing beside it already is a
 * one-tile path.
 */
export function pathBeside(
  grid: WalkabilityGrid,
  from: TilePoint,
  target: TilePoint,
): TilePoint[] | null {
  let best: TilePoint[] | null = null;
  for (const [dx, dy] of Object.values(FACING_STEPS)) {
    const beside: TilePoint = [target[0] + dx, target[1] + dy];
    if (beside[0] === from[0] && beside[1] === from[1]) return [from];
    const path = findPath(grid, from, beside);
    if (path !== null && (best === null || path.length < best.length)) best = path;
  }
  return best;
}
