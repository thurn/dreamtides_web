import { describe, expect, it } from "vitest";
import type {
  BackRankSlotId,
  BattleCardInstance,
  BattleMutableState,
  BattleSide,
  FrontRankSlotId,
} from "../types";
import { BACK_RANK_SLOT_IDS, FRONT_RANK_SLOT_IDS } from "../types";
import { collectDawnTriggerEdits } from "./battle-card-effects-table";

// ---------------------------------------------------------------------------
// Registered dawn UUID (from BATTLE_CARD_EFFECTS).
// ---------------------------------------------------------------------------

/** Driftcaller Sovereign — ▸Dawn: Gain 1●. */
const DRIFTCALLER_SOVEREIGN = "9b9c2743-75b3-499d-b5fb-c3429c92d420";
/** A card with no registered effect script. */
const UNREGISTERED = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Minimal fixture helpers. collectDawnTriggerEdits reads only:
//   - per-side backRank/frontRank slot maps
//   - cardInstances[id].definition.cardId
// We construct just those fields and cast to the full types.
// ---------------------------------------------------------------------------

interface InstanceSpec {
  battleCardId: string;
  cardId: string;
}

interface SideSpec {
  back?: Partial<Record<BackRankSlotId, InstanceSpec>>;
  front?: Partial<Record<FrontRankSlotId, InstanceSpec>>;
}

function makeInstance(spec: InstanceSpec): BattleCardInstance {
  return {
    battleCardId: spec.battleCardId,
    definition: { cardId: spec.cardId },
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
      cardInstances[inst.battleCardId] = makeInstance(inst);
    }
    for (const [slot, inst] of Object.entries(spec.front ?? {})) {
      if (inst === undefined) continue;
      sideStates[side].frontRank[slot as FrontRankSlotId] = inst.battleCardId;
      cardInstances[inst.battleCardId] = makeInstance(inst);
    }
  }

  return { sides: sideStates, cardInstances } as unknown as BattleMutableState;
}

describe("collectDawnTriggerEdits", () => {
  it("yields one +1 energy edit for an in-play Driftcaller Sovereign of the side", () => {
    const state = makeState({
      player: { front: { F0: { battleCardId: "drift", cardId: DRIFTCALLER_SOVEREIGN } } },
    });

    expect(collectDawnTriggerEdits(state, "player", 0)).toEqual([
      { kind: "ADJUST_CURRENT_ENERGY", side: "player", amount: 1 },
    ]);
  });

  it("yields nothing when no in-play character has a dawn script", () => {
    const state = makeState({
      player: {
        front: { F0: { battleCardId: "plain", cardId: UNREGISTERED } },
        back: { B0: { battleCardId: "plain-back", cardId: UNREGISTERED } },
      },
    });

    expect(collectDawnTriggerEdits(state, "player", 0)).toEqual([]);
  });

  it("ignores a dawn character controlled by the other side", () => {
    const state = makeState({
      enemy: { front: { F0: { battleCardId: "enemy-drift", cardId: DRIFTCALLER_SOVEREIGN } } },
    });

    // Computing for "player" sees nothing on its own ranks.
    expect(collectDawnTriggerEdits(state, "player", 0)).toEqual([]);
    // The enemy's own Dawn would gain it energy.
    expect(collectDawnTriggerEdits(state, "enemy", 0)).toEqual([
      { kind: "ADJUST_CURRENT_ENERGY", side: "enemy", amount: 1 },
    ]);
  });

  it("collects from a back-rank dawn character as well", () => {
    const state = makeState({
      player: { back: { B2: { battleCardId: "drift-back", cardId: DRIFTCALLER_SOVEREIGN } } },
    });

    expect(collectDawnTriggerEdits(state, "player", 0)).toEqual([
      { kind: "ADJUST_CURRENT_ENERGY", side: "player", amount: 1 },
    ]);
  });
});
