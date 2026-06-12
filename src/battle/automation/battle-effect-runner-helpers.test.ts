import { describe, expect, it } from "vitest";
import type {
  BackRankSlotId,
  BattleCardInstance,
  BattleMutableState,
  BattleSide,
  FrontRankSlotId,
} from "../types";
import { BACK_RANK_SLOT_IDS, FRONT_RANK_SLOT_IDS } from "../types";
import {
  inPlayInstanceIds,
  materializedScriptEdits,
} from "./use-battle-effect-runner";

// ---------------------------------------------------------------------------
// Registered materialized UUID (from BATTLE_CARD_EFFECTS).
// ---------------------------------------------------------------------------

/** Ashwalker — ▸Materialized: Erode 3. */
const ASHWALKER = "1cfc72e9-b75c-4d55-8bcf-54bb301d7e40";
/** Driftcaller Sovereign — ▸Dawn (not materialized). */
const DRIFTCALLER_SOVEREIGN = "9b9c2743-75b3-499d-b5fb-c3429c92d420";
/** A card with no registered script. */
const UNREGISTERED = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Fixtures — only the fields these helpers read.
// ---------------------------------------------------------------------------

interface InstanceSpec {
  battleCardId: string;
  cardId: string;
  controller?: BattleSide;
  name?: string;
}

interface SideSpec {
  back?: Partial<Record<BackRankSlotId, InstanceSpec>>;
  front?: Partial<Record<FrontRankSlotId, InstanceSpec>>;
}

function makeInstance(spec: InstanceSpec): BattleCardInstance {
  return {
    battleCardId: spec.battleCardId,
    controller: spec.controller ?? "player",
    definition: { cardId: spec.cardId, name: spec.name ?? spec.cardId },
  } as unknown as BattleCardInstance;
}

function emptyBackRank(): Record<BackRankSlotId, string | null> {
  return Object.fromEntries(BACK_RANK_SLOT_IDS.map((s) => [s, null])) as Record<
    BackRankSlotId,
    string | null
  >;
}

function emptyFrontRank(): Record<FrontRankSlotId, string | null> {
  return Object.fromEntries(FRONT_RANK_SLOT_IDS.map((s) => [s, null])) as Record<
    FrontRankSlotId,
    string | null
  >;
}

function makeState(sides: Partial<Record<BattleSide, SideSpec>>): BattleMutableState {
  const cardInstances: Record<string, BattleCardInstance> = {};
  const sideStates: Record<
    BattleSide,
    { backRank: Record<BackRankSlotId, string | null>; frontRank: Record<FrontRankSlotId, string | null> }
  > = {
    player: { backRank: emptyBackRank(), frontRank: emptyFrontRank() },
    enemy: { backRank: emptyBackRank(), frontRank: emptyFrontRank() },
  };

  for (const side of ["player", "enemy"] as BattleSide[]) {
    const spec = sides[side];
    if (spec === undefined) continue;
    for (const [slot, inst] of Object.entries(spec.back ?? {})) {
      if (inst === undefined) continue;
      sideStates[side].backRank[slot as BackRankSlotId] = inst.battleCardId;
      cardInstances[inst.battleCardId] = makeInstance({ controller: side, ...inst });
    }
    for (const [slot, inst] of Object.entries(spec.front ?? {})) {
      if (inst === undefined) continue;
      sideStates[side].frontRank[slot as FrontRankSlotId] = inst.battleCardId;
      cardInstances[inst.battleCardId] = makeInstance({ controller: side, ...inst });
    }
  }

  return { sides: sideStates, cardInstances } as unknown as BattleMutableState;
}

describe("materializedScriptEdits", () => {
  it("returns the ▸Materialized edits for a registered materialized card", () => {
    const instance = makeInstance({
      battleCardId: "ash",
      cardId: ASHWALKER,
      controller: "enemy",
    });
    const state = makeState({});

    // Ashwalker — ▸Materialized: Erode 3, for the controller's side.
    expect(materializedScriptEdits(instance, state, 0)).toEqual([
      { kind: "ERODE", side: "enemy", count: 3 },
    ]);
  });

  it("returns [] for a card whose trigger is not materialized", () => {
    const instance = makeInstance({ battleCardId: "drift", cardId: DRIFTCALLER_SOVEREIGN });
    expect(materializedScriptEdits(instance, makeState({}), 0)).toEqual([]);
  });

  it("returns [] for an unregistered card", () => {
    const instance = makeInstance({ battleCardId: "plain", cardId: UNREGISTERED });
    expect(materializedScriptEdits(instance, makeState({}), 0)).toEqual([]);
  });
});

describe("inPlayInstanceIds", () => {
  it("collects all non-null front/back occupants of both sides", () => {
    const state = makeState({
      player: {
        back: { B1: { battleCardId: "pb1", cardId: UNREGISTERED } },
        front: { F0: { battleCardId: "pf0", cardId: UNREGISTERED } },
      },
      enemy: {
        front: { F2: { battleCardId: "ef2", cardId: UNREGISTERED } },
      },
    });

    expect(new Set(inPlayInstanceIds(state))).toEqual(new Set(["pb1", "pf0", "ef2"]));
  });

  it("returns [] for an empty board", () => {
    expect(inPlayInstanceIds(makeState({}))).toEqual([]);
  });
});
