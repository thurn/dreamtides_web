import { describe, expect, it } from "vitest";
import type {
  BackRankSlotId,
  BattleCardInstance,
  BattleMutableState,
  BattleSide,
  FrontRankSlotId,
} from "../types";
import { BACK_RANK_SLOT_IDS, FRONT_RANK_SLOT_IDS } from "../types";
import { planSupportRecompute, SUPPORT_ADJACENCY } from "./battle-card-effects-table";

// ---------------------------------------------------------------------------
// Registered support UUIDs (from BATTLE_CARD_EFFECTS).
// ---------------------------------------------------------------------------

/** Woodland Apparition — Support: supported allies have +2✦ (no predicate). */
const WOODLAND_APPARITION = "1268a899-b209-46bb-bce4-6def1dcd0404";
/** Eternal Stag — Support: supported spirit animals have +1✦ (predicate). */
const ETERNAL_STAG = "4e3c04a9-1cdd-468a-b42a-40157ed9c9d6";
/** A card with no registered support script. */
const UNREGISTERED = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Minimal fixture helpers. planSupportRecompute reads only:
//   - per-side backRank/frontRank slot maps
//   - cardInstances[id].{ definition.cardId, definition.subtype, staticSparkBonus }
// We construct just those fields and cast to the full types.
// ---------------------------------------------------------------------------

interface InstanceSpec {
  battleCardId: string;
  cardId: string;
  subtype?: string;
  staticSparkBonus?: number;
}

interface SideSpec {
  back?: Partial<Record<BackRankSlotId, InstanceSpec>>;
  front?: Partial<Record<FrontRankSlotId, InstanceSpec>>;
}

function makeInstance(spec: InstanceSpec): BattleCardInstance {
  return {
    battleCardId: spec.battleCardId,
    definition: {
      cardId: spec.cardId,
      subtype: spec.subtype ?? null,
    },
    staticSparkBonus: spec.staticSparkBonus ?? 0,
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
  const sideStates: Record<BattleSide, { backRank: Record<BackRankSlotId, string | null>; frontRank: Record<FrontRankSlotId, string | null> }> = {
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

// ---------------------------------------------------------------------------
// Geometry adjacency sanity (guards against table edits drifting from rules).
// ---------------------------------------------------------------------------

describe("SUPPORT_ADJACENCY", () => {
  it("maps each back slot to its supported front slots", () => {
    expect(SUPPORT_ADJACENCY).toEqual({
      B0: ["F0"],
      B1: ["F0", "F1"],
      B2: ["F1", "F2"],
      B3: ["F2", "F3"],
      B4: ["F3"],
    });
  });
});

// ---------------------------------------------------------------------------
// Geometry correctness: B1 supporter reaches F0 + F1 only, not F2/F3.
// ---------------------------------------------------------------------------

describe("planSupportRecompute — geometry", () => {
  it("a B1 Woodland Apparition grants +2 to F0 and F1 only", () => {
    const state = makeState({
      player: {
        back: { B1: { battleCardId: "supporter", cardId: WOODLAND_APPARITION } },
        front: {
          F0: { battleCardId: "f0", cardId: UNREGISTERED },
          F1: { battleCardId: "f1", cardId: UNREGISTERED },
          F2: { battleCardId: "f2", cardId: UNREGISTERED },
          F3: { battleCardId: "f3", cardId: UNREGISTERED },
        },
      },
    });

    const edits = planSupportRecompute(state, true, 0);

    expect(edits).toContainEqual({
      kind: "SET_CARD_STATIC_SPARK_BONUS",
      battleCardId: "f0",
      value: 2,
    });
    expect(edits).toContainEqual({
      kind: "SET_CARD_STATIC_SPARK_BONUS",
      battleCardId: "f1",
      value: 2,
    });
    // F2 and F3 are outside B1's reach: never granted (current 0, no edit).
    expect(edits.some((e) => "battleCardId" in e && e.battleCardId === "f2")).toBe(false);
    expect(edits.some((e) => "battleCardId" in e && e.battleCardId === "f3")).toBe(false);
    // The supporter itself sits in the back rank and gains nothing.
    expect(edits.some((e) => "battleCardId" in e && e.battleCardId === "supporter")).toBe(false);
  });

  it("a Supporter in the FRONT rank grants nothing", () => {
    const state = makeState({
      player: {
        front: {
          F0: { battleCardId: "front-supporter", cardId: WOODLAND_APPARITION },
          F1: { battleCardId: "ally", cardId: UNREGISTERED },
        },
      },
    });

    expect(planSupportRecompute(state, true, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Predicate filter: Eternal Stag only buffs spirit animals.
// ---------------------------------------------------------------------------

describe("planSupportRecompute — predicate filter", () => {
  it("Eternal Stag grants +1 to spirit animals but not other allies", () => {
    const state = makeState({
      player: {
        back: { B1: { battleCardId: "stag", cardId: ETERNAL_STAG } },
        front: {
          F0: { battleCardId: "animal", cardId: UNREGISTERED, subtype: "Spirit Animal" },
          F1: { battleCardId: "other", cardId: UNREGISTERED, subtype: "Warrior" },
        },
      },
    });

    const edits = planSupportRecompute(state, true, 0);

    expect(edits).toEqual([
      { kind: "SET_CARD_STATIC_SPARK_BONUS", battleCardId: "animal", value: 1 },
    ]);
    // The non-spirit-animal ally has target 0; already 0 ⇒ no edit emitted.
    expect(edits.some((e) => "battleCardId" in e && e.battleCardId === "other")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stacking: two supporters covering the same front slot sum their bonuses.
// ---------------------------------------------------------------------------

describe("planSupportRecompute — stacking", () => {
  it("two supporters covering F1 sum to +4 on that ally", () => {
    // B1 supports F0,F1; B2 supports F1,F2. F1 is covered by both.
    const state = makeState({
      player: {
        back: {
          B1: { battleCardId: "s1", cardId: WOODLAND_APPARITION },
          B2: { battleCardId: "s2", cardId: WOODLAND_APPARITION },
        },
        front: {
          F1: { battleCardId: "shared", cardId: UNREGISTERED },
        },
      },
    });

    const edits = planSupportRecompute(state, true, 0);

    expect(edits).toEqual([
      { kind: "SET_CARD_STATIC_SPARK_BONUS", battleCardId: "shared", value: 4 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Removed/moved: an unsupported ally with a stale bonus is cleared to 0.
// ---------------------------------------------------------------------------

describe("planSupportRecompute — clearing stale bonuses", () => {
  it("clears a non-zero bonus on an ally that no supporter reaches", () => {
    // No supporter present; the ally currently carries a stale +2.
    const state = makeState({
      player: {
        front: { F0: { battleCardId: "stale", cardId: UNREGISTERED, staticSparkBonus: 2 } },
      },
    });

    expect(planSupportRecompute(state, true, 0)).toEqual([
      { kind: "SET_CARD_STATIC_SPARK_BONUS", battleCardId: "stale", value: 0 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Idempotence (anti-loop guarantee): correct bonuses ⇒ empty edit list.
// ---------------------------------------------------------------------------

describe("planSupportRecompute — idempotence", () => {
  it("emits no edits when every staticSparkBonus already matches its target", () => {
    const state = makeState({
      player: {
        back: { B1: { battleCardId: "supporter", cardId: WOODLAND_APPARITION } },
        front: {
          F0: { battleCardId: "f0", cardId: UNREGISTERED, staticSparkBonus: 2 },
          F1: { battleCardId: "f1", cardId: UNREGISTERED, staticSparkBonus: 2 },
        },
      },
    });

    expect(planSupportRecompute(state, true, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Disabled ⇒ every in-play instance target is 0.
// ---------------------------------------------------------------------------

describe("planSupportRecompute — disabled", () => {
  it("clears every in-play instance to 0 when disabled", () => {
    const state = makeState({
      player: {
        back: { B1: { battleCardId: "supporter", cardId: WOODLAND_APPARITION } },
        front: {
          F0: { battleCardId: "f0", cardId: UNREGISTERED, staticSparkBonus: 2 },
          F1: { battleCardId: "f1", cardId: UNREGISTERED, staticSparkBonus: 2 },
        },
      },
    });

    const edits = planSupportRecompute(state, false, 0);

    expect(edits).toContainEqual({
      kind: "SET_CARD_STATIC_SPARK_BONUS",
      battleCardId: "f0",
      value: 0,
    });
    expect(edits).toContainEqual({
      kind: "SET_CARD_STATIC_SPARK_BONUS",
      battleCardId: "f1",
      value: 0,
    });
    // The supporter already has bonus 0, so it needs no edit.
    expect(edits.some((e) => "battleCardId" in e && e.battleCardId === "supporter")).toBe(false);
  });

  it("emits no edits when disabled and everything is already 0", () => {
    const state = makeState({
      player: {
        back: { B1: { battleCardId: "supporter", cardId: WOODLAND_APPARITION } },
        front: { F0: { battleCardId: "f0", cardId: UNREGISTERED } },
      },
    });

    expect(planSupportRecompute(state, false, 0)).toEqual([]);
  });
});
