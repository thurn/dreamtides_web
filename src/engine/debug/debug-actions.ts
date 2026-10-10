/**
 * Engine debug actions (D4), for development builds only: the battle
 * screen's debug panel (`?debug=1`) submits them as `BATTLE_DEBUG` intents,
 * so the event log stays the source of truth and a reload replays them.
 *
 * Each action changes the committed state at a decision boundary (nothing
 * in flight, the battle not over), runs the state-based victory check, and
 * keeps every engine invariant (`testing/invariants.ts`), or is rejected
 * and changes nothing. Undo rebuilds the slice from its history
 * (`BattleSlice.history`): the base slice, then every recorded intent and
 * debug action before the chosen entry, each re-validated as it applies.
 */
import type { Engine } from "../engine";
import { createFoldAdapter, type BattleSlice, type HistoryEntry } from "../fold/slice";
import { leftmostOpenBackSlot, setOccupant } from "../rules/zones";
import { checkVictory } from "../rules/victory";
import { cloneState } from "../state/clone";
import { freshStatus } from "../state/create";
import { SIDES, type CardId, type InstanceId, type Side, type Zone } from "../state/ids";
import type { BattleState } from "../state/types";
import { Context } from "../steps/context";
import { NO_PROMPTS } from "../steps/sources";
import { invariantViolations } from "../testing/invariants";
import { isCardId, parseCardId } from "../../types/card-identity";

/** The zones a debug action may add a card to; `play` takes the leftmost open back-rank position. */
export const DEBUG_ZONES = ["hand", "deck", "void", "banished", "play"] as const;
export type DebugZone = (typeof DEBUG_ZONES)[number];

export type DebugOp =
  /** Adds a new card by UUID, base variant, owned by `side`; on top of a deck, or ready in play. */
  | { readonly kind: "addCard"; readonly side: Side; readonly card: CardId; readonly zone: DebugZone }
  /** Sets a side's current energy. */
  | { readonly kind: "setEnergy"; readonly side: Side; readonly energy: number }
  /** Sets a side's score; reaching the score to win ends the battle. */
  | { readonly kind: "setScore"; readonly side: Side; readonly score: number }
  /** Puts the topmost deck card printing `card` on top of `side`'s deck, so it is drawn next. */
  | { readonly kind: "forceDraw"; readonly side: Side; readonly card: CardId }
  /** Changes nothing: starts a journey battle's history, so later intents can be undone. */
  | { readonly kind: "mark" }
  /** Rebuilds the slice from its history, keeping the first `keep` entries. */
  | { readonly kind: "undo"; readonly keep: number };

export type DebugRejection =
  | "stepInFlight"
  | "battleOver"
  | "unknownCard"
  | "notACharacter"
  | "noOpenSlot"
  | "notInDeck"
  | "noHistory"
  | "historyDiverged"
  | "invariants";

export type DebugOutcome =
  | { readonly kind: "applied"; readonly slice: BattleSlice }
  | { readonly kind: "rejected"; readonly reason: DebugRejection; readonly detail?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** A debug action from an intent payload, or `null` when it is malformed. */
export function debugOpFromUnknown(value: unknown): DebugOp | null {
  if (!isRecord(value)) return null;
  if (value.kind === "mark") return { kind: "mark" };
  if (value.kind === "undo") {
    const keep = count(value.keep);
    return keep === null ? null : { kind: "undo", keep };
  }
  const side = value.side === "player" || value.side === "enemy" ? value.side : null;
  if (side === null) return null;
  const card = typeof value.card === "string" && isCardId(value.card) ? parseCardId(value.card) : null;
  switch (value.kind) {
    case "addCard": {
      const zone = DEBUG_ZONES.find((candidate) => candidate === value.zone);
      return card === null || zone === undefined ? null : { kind: "addCard", side, card, zone };
    }
    case "forceDraw":
      return card === null ? null : { kind: "forceDraw", side, card };
    case "setEnergy": {
      const energy = count(value.energy);
      return energy === null ? null : { kind: "setEnergy", side, energy };
    }
    case "setScore": {
      const score = count(value.score);
      return score === null ? null : { kind: "setScore", side, score };
    }
    default:
      return null;
  }
}

/** Mints a new, non-created instance of `card` for `side` in `zone`, unlisted. */
function mint(state: BattleState, side: Side, card: CardId, zone: Zone): InstanceId {
  const id: InstanceId = `i${state.nextInstance}`;
  state.nextInstance += 1;
  state.instances[id] = {
    id,
    printing: { kind: "card", cardId: card },
    owner: side,
    controller: side,
    zone,
    variant: { amplified: false },
    status: freshStatus(),
    enteredZoneAt: ++state.clock,
  };
  return id;
}

type Change = { readonly state: BattleState } | { readonly reason: DebugRejection; readonly detail?: string };

/** Applies one non-undo action to a copy of `committed`. */
function change(engine: Engine, committed: BattleState, op: Exclude<DebugOp, { kind: "undo" }>): Change {
  const state = cloneState(committed);
  if (op.kind === "mark") return { state: committed };
  const side = state.sides[op.side];
  switch (op.kind) {
    case "setEnergy":
      side.currentEnergy = op.energy;
      break;
    case "setScore":
      side.score = op.score;
      break;
    case "forceDraw": {
      const index = side.deck.findIndex((id) => {
        const printing = state.instances[id]?.printing;
        return printing?.kind === "card" && printing.cardId === op.card;
      });
      if (index < 0) return { reason: "notInDeck" };
      const [id] = side.deck.splice(index, 1);
      if (id !== undefined) side.deck.unshift(id);
      break;
    }
    case "addCard": {
      let definition;
      try {
        definition = engine.catalog.card(op.card);
      } catch {
        return { reason: "unknownCard" };
      }
      if (op.zone !== "play") {
        const id = mint(state, op.side, op.card, op.zone);
        side[op.zone].unshift(id);
        break;
      }
      if (definition.cardType !== "character") return { reason: "notACharacter" };
      const slot = leftmostOpenBackSlot(state, op.side);
      if (slot === null) return { reason: "noOpenSlot" };
      const id = mint(state, op.side, op.card, "play");
      setOccupant(state, op.side, slot, id);
      break;
    }
  }
  checkVictory(new Context(state, engine.catalog, NO_PROMPTS), []);
  state.version += 1;
  const problems = invariantViolations(state, engine.catalog);
  return problems.length === 0 ? { state } : { reason: "invariants", detail: problems.join("; ") };
}

/** A non-undo action applied to `slice`, without recording it in the history. */
function applyChange(engine: Engine, slice: BattleSlice, op: Exclude<DebugOp, { kind: "undo" }>): DebugOutcome {
  if (slice.committed.result !== null) return { kind: "rejected", reason: "battleOver" };
  if (slice.inFlight !== null) return { kind: "rejected", reason: "stepInFlight" };
  const changed = change(engine, slice.committed, op);
  if ("reason" in changed) return { kind: "rejected", ...changed };
  return { kind: "applied", slice: { ...slice, committed: changed.state, publishedEvents: 0 } };
}

/** `slice` without its history, as a base or a replayed slice. */
function withoutHistory(slice: BattleSlice): BattleSlice {
  const { history: _history, ...rest } = slice;
  return rest;
}

/** Replays `entries` over `base`; `null` when one no longer applies. */
function replay(engine: Engine, base: BattleSlice, entries: readonly HistoryEntry[]): BattleSlice | null {
  const adapter = createFoldAdapter(engine);
  let slice = base;
  for (const entry of entries) {
    if ("attempt" in entry) {
      slice = { ...slice, attempt: entry.attempt };
    } else if ("intent" in entry) {
      const outcome = adapter.reduce(slice, entry.intent);
      if (outcome.kind === "bounced") return null;
      slice = outcome.slice;
    } else {
      if (entry.debug.kind === "undo") return null;
      const outcome = applyChange(engine, slice, entry.debug);
      if (outcome.kind === "rejected") return null;
      slice = outcome.slice;
    }
  }
  return slice;
}

/**
 * Applies a debug action to a journey battle's engine slice. A slice
 * without history starts one at the state before the action. Undo keeps
 * the first `keep` history entries and continues with an attempt counter
 * above every one used so far, so the intent keys of a replayed decision
 * never collide with the undone ones.
 */
export function applyDebugOp(engine: Engine, slice: BattleSlice, op: DebugOp): DebugOutcome {
  if (op.kind === "undo") {
    const history = slice.history;
    if (history === undefined || !history.entries.slice(op.keep).some((entry) => !("attempt" in entry))) {
      return { kind: "rejected", reason: "noHistory" };
    }
    const kept = history.entries.slice(0, op.keep);
    const replayed = replay(engine, history.base, kept);
    if (replayed === null) return { kind: "rejected", reason: "historyDiverged" };
    const attempt = slice.attempt + 1;
    return {
      kind: "applied",
      slice: { ...replayed, attempt, history: { base: history.base, entries: [...kept, { attempt }] } },
    };
  }
  const outcome = applyChange(engine, slice, op);
  if (outcome.kind === "rejected") return outcome;
  const history = slice.history ?? { base: withoutHistory(slice), entries: [] };
  return { kind: "applied", slice: { ...outcome.slice, history: { ...history, entries: [...history.entries, { debug: op }] } } };
}

/** Starts a slice's history at itself, as the lab scenes do, so their whole battle can be undone. */
export function withHistory(slice: BattleSlice): BattleSlice {
  return { ...slice, history: { base: withoutHistory(slice), entries: [] } };
}

/** One hidden zone, revealed: a side's hand or deck, top first, by instance and printed card UUID. */
export interface RevealedZone {
  readonly side: Side;
  readonly zone: "hand" | "deck";
  readonly cards: readonly { readonly instance: InstanceId; readonly card: CardId | null }[];
}

/** Every hand and deck of `state`, unredacted: the debug panel's reveal. */
export function revealHiddenZones(state: BattleState): RevealedZone[] {
  return SIDES.flatMap((side) =>
    (["hand", "deck"] as const).map((zone) => ({
      side,
      zone,
      cards: state.sides[side][zone].map((instance) => {
        const printing = state.instances[instance]?.printing;
        return { instance, card: printing?.kind === "card" ? printing.cardId : null };
      }),
    })),
  );
}
