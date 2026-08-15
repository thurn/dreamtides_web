import { describe, expect, it } from "vitest";
import type {
  BackRankSlotId,
  BattleCardInstance,
  BattleMutableState,
  BattleSide,
  FrontRankSlotId,
} from "../../battle/types";
import {
  backRankSlotIds,
  createEmptySlotRecord,
  frontRankSlotIds,
  isBackRankSlotId,
  isFrontRankSlotId,
} from "../../battle/types";
import { planSupportRecompute } from "./battle-card-effects-table";
import { supportedDeploySlots } from "../../battle/engine/support";
import type { BattleCardId } from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";
import { parseBattleCardId } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";

// ---------------------------------------------------------------------------
// Registered support UUIDs (from BATTLE_CARD_EFFECTS).
// ---------------------------------------------------------------------------

/** Woodland Apparition — Support: supported allies have +2✦ (no predicate). */
const WOODLAND_APPARITION = "1268a899-b209-46bb-bce4-6def1dcd0404";
/** Eternal Stag — Support: supported spirit animals have +1✦ (predicate). */
const ETERNAL_STAG = "4e3c04a9-1cdd-468a-b42a-40157ed9c9d6";
/** Skyflame Commander — Support: +1✦ per allied warrior. */
const SKYFLAME_COMMANDER = "56411ed4-bda9-4fdf-82e5-b5492de67039";
/** A card with no registered support script. */
const UNREGISTERED = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Minimal fixture helpers. planSupportRecompute reads only:
//   - per-side backRank/frontRank slot maps
//   - cardInstances[id].{ definition.cardId, definition.subtype, staticSparkBonus }
// We construct just those fields and cast to the full types.
// ---------------------------------------------------------------------------

interface InstanceSpec {
  battleCardId: BattleCardId;
  cardId: CardId;
  subtype?: string;
  figmentCount?: number;
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
      battleCardKind: "character",
    },
    ...(spec.figmentCount === undefined
      ? {}
      : { figments: Array.from({ length: spec.figmentCount }, () => 1) }),
    provenance: {
      kind:
        spec.figmentCount === undefined ? "journey-deck" : "generated-figment",
    },
    staticSparkBonus: spec.staticSparkBonus ?? 0,
  } as unknown as BattleCardInstance;
}

function emptyBackRank(): Record<BackRankSlotId, BattleCardId | null> {
  return createEmptySlotRecord(backRankSlotIds(13));
}

function emptyFrontRank(): Record<FrontRankSlotId, BattleCardId | null> {
  return createEmptySlotRecord(frontRankSlotIds(12));
}

function makeState(
  sides: Partial<Record<BattleSide, SideSpec>>,
): BattleMutableState {
  const cardInstances: Record<string, BattleCardInstance> = {};
  const sideStates: Record<
    BattleSide,
    {
      backRank: Record<BackRankSlotId, BattleCardId | null>;
      frontRank: Record<FrontRankSlotId, BattleCardId | null>;
    }
  > = {
    player: { backRank: emptyBackRank(), frontRank: emptyFrontRank() },
    enemy: { backRank: emptyBackRank(), frontRank: emptyFrontRank() },
  };

  for (const side of ["player", "enemy"] as BattleSide[]) {
    const spec = sides[side];
    if (spec === undefined) continue;
    for (const [slot, inst] of Object.entries(spec.back ?? {})) {
      if (inst === undefined) continue;
      if (!isBackRankSlotId(slot)) continue;
      sideStates[side].backRank[slot] = inst.battleCardId;
      cardInstances[inst.battleCardId] = makeInstance(inst);
    }
    for (const [slot, inst] of Object.entries(spec.front ?? {})) {
      if (inst === undefined) continue;
      if (!isFrontRankSlotId(slot)) continue;
      sideStates[side].frontRank[slot] = inst.battleCardId;
      cardInstances[inst.battleCardId] = makeInstance(inst);
    }
  }

  return { sides: sideStates, cardInstances } as unknown as BattleMutableState;
}

// ---------------------------------------------------------------------------
// Geometry adjacency sanity (guards against table edits drifting from rules).
// ---------------------------------------------------------------------------

describe("supportedDeploySlots", () => {
  it("maps each back slot to its adjacent front slots (Bi backs F(i-1), Fi)", () => {
    // Starting-layout edges and interior.
    expect(supportedDeploySlots("B0")).toEqual(["F0"]);
    expect(supportedDeploySlots("B1")).toEqual(["F0", "F1"]);
    expect(supportedDeploySlots("B2")).toEqual(["F1", "F2"]);
    // The same staggered geometry holds at an expanded size.
    expect(supportedDeploySlots("B5")).toEqual(["F4", "F5"]);
  });
});

// ---------------------------------------------------------------------------
// Geometry correctness: B1 supporter reaches F0 + F1 only, not F2/F3.
// ---------------------------------------------------------------------------

describe("planSupportRecompute — geometry", () => {
  it("a B1 Woodland Apparition grants +2 to F0 and F1 only", () => {
    const state = makeState({
      player: {
        back: {
          B1: {
            battleCardId: parseBattleCardId("supporter"),
            cardId: testCardId(WOODLAND_APPARITION),
          },
        },
        front: {
          F0: {
            battleCardId: parseBattleCardId("f0"),
            cardId: testCardId(UNREGISTERED),
          },
          F1: {
            battleCardId: parseBattleCardId("f1"),
            cardId: testCardId(UNREGISTERED),
          },
          F2: {
            battleCardId: parseBattleCardId("f2"),
            cardId: testCardId(UNREGISTERED),
          },
          F3: {
            battleCardId: parseBattleCardId("f3"),
            cardId: testCardId(UNREGISTERED),
          },
        },
      },
    });

    const edits = planSupportRecompute(state, true, () => 0, 0);

    expect(edits).toContainEqual({
      kind: "SET_CARD_STATIC_SPARK_BONUS",
      battleCardId: parseBattleCardId("f0"),
      value: 2,
    });
    expect(edits).toContainEqual({
      kind: "SET_CARD_STATIC_SPARK_BONUS",
      battleCardId: parseBattleCardId("f1"),
      value: 2,
    });
    // F2 and F3 are outside B1's reach: never granted (current 0, no edit).
    expect(
      edits.some((e) => "battleCardId" in e && e.battleCardId === "f2"),
    ).toBe(false);
    expect(
      edits.some((e) => "battleCardId" in e && e.battleCardId === "f3"),
    ).toBe(false);
    // The supporter itself sits in the back rank and gains nothing.
    expect(
      edits.some((e) => "battleCardId" in e && e.battleCardId === "supporter"),
    ).toBe(false);
  });

  it("a Supporter in the FRONT rank grants nothing", () => {
    const state = makeState({
      player: {
        front: {
          F0: {
            battleCardId: parseBattleCardId("front-supporter"),
            cardId: testCardId(WOODLAND_APPARITION),
          },
          F1: {
            battleCardId: parseBattleCardId("ally"),
            cardId: testCardId(UNREGISTERED),
          },
        },
      },
    });

    expect(planSupportRecompute(state, true, () => 0, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Predicate filter: Eternal Stag only buffs spirit animals.
// ---------------------------------------------------------------------------

describe("planSupportRecompute — predicate filter", () => {
  it("Eternal Stag grants +1 to spirit animals but not other allies", () => {
    const state = makeState({
      player: {
        back: {
          B1: {
            battleCardId: parseBattleCardId("stag"),
            cardId: testCardId(ETERNAL_STAG),
          },
        },
        front: {
          F0: {
            battleCardId: parseBattleCardId("animal"),
            cardId: testCardId(UNREGISTERED),
            subtype: "Spirit Animal",
          },
          F1: {
            battleCardId: parseBattleCardId("other"),
            cardId: testCardId(UNREGISTERED),
            subtype: "Warrior",
          },
        },
      },
    });

    const edits = planSupportRecompute(state, true, () => 0, 0);

    expect(edits).toEqual([
      {
        kind: "SET_CARD_STATIC_SPARK_BONUS",
        battleCardId: parseBattleCardId("animal"),
        value: 1,
      },
    ]);
    // The non-spirit-animal ally has target 0; already 0 ⇒ no edit emitted.
    expect(
      edits.some((e) => "battleCardId" in e && e.battleCardId === "other"),
    ).toBe(false);
  });
});

describe("planSupportRecompute — dynamic warrior count", () => {
  it("Skyflame Commander grants +1 for each warrior its controller has in play", () => {
    const state = makeState({
      player: {
        back: {
          B0: {
            battleCardId: parseBattleCardId("warrior-0"),
            cardId: testCardId(UNREGISTERED),
            subtype: "Warrior",
          },
          B1: {
            battleCardId: parseBattleCardId("commander"),
            cardId: testCardId(SKYFLAME_COMMANDER),
            subtype: "Warrior",
          },
          B2: {
            battleCardId: parseBattleCardId("warrior-2"),
            cardId: testCardId(UNREGISTERED),
            subtype: "Warrior",
          },
          B3: {
            battleCardId: parseBattleCardId("non-warrior"),
            cardId: testCardId(UNREGISTERED),
            subtype: "Mage",
          },
        },
        front: {
          F0: {
            battleCardId: parseBattleCardId("supported-warrior"),
            cardId: testCardId(UNREGISTERED),
            subtype: "Warrior",
          },
        },
      },
    });

    expect(planSupportRecompute(state, true, () => 0, 0)).toContainEqual({
      kind: "SET_CARD_STATIC_SPARK_BONUS",
      battleCardId: parseBattleCardId("supported-warrior"),
      value: 4,
    });

    state.sides.player.backRank.B0 = null;
    expect(planSupportRecompute(state, true, () => 0, 0)).toContainEqual({
      kind: "SET_CARD_STATIC_SPARK_BONUS",
      battleCardId: parseBattleCardId("supported-warrior"),
      value: 3,
    });
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
          B1: {
            battleCardId: parseBattleCardId("s1"),
            cardId: testCardId(WOODLAND_APPARITION),
          },
          B2: {
            battleCardId: parseBattleCardId("s2"),
            cardId: testCardId(WOODLAND_APPARITION),
          },
        },
        front: {
          F1: {
            battleCardId: parseBattleCardId("shared"),
            cardId: testCardId(UNREGISTERED),
          },
        },
      },
    });

    const edits = planSupportRecompute(state, true, () => 0, 0);

    expect(edits).toEqual([
      {
        kind: "SET_CARD_STATIC_SPARK_BONUS",
        battleCardId: parseBattleCardId("shared"),
        value: 4,
      },
    ]);
  });

  it("stores the Support bonus once per figment on a supported stack", () => {
    const state = makeState({
      player: {
        back: {
          B0: {
            battleCardId: parseBattleCardId("supporter"),
            cardId: testCardId(WOODLAND_APPARITION),
          },
        },
        front: {
          F0: {
            battleCardId: parseBattleCardId("figments"),
            cardId: testCardId(UNREGISTERED),
            figmentCount: 3,
          },
        },
      },
    });

    expect(planSupportRecompute(state, true, () => 0, 0)).toEqual([
      {
        kind: "SET_CARD_STATIC_SPARK_BONUS",
        battleCardId: parseBattleCardId("figments"),
        value: 2,
      },
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
        front: {
          F0: {
            battleCardId: parseBattleCardId("stale"),
            cardId: testCardId(UNREGISTERED),
            staticSparkBonus: 2,
          },
        },
      },
    });

    expect(planSupportRecompute(state, true, () => 0, 0)).toEqual([
      {
        kind: "SET_CARD_STATIC_SPARK_BONUS",
        battleCardId: parseBattleCardId("stale"),
        value: 0,
      },
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
        back: {
          B1: {
            battleCardId: parseBattleCardId("supporter"),
            cardId: testCardId(WOODLAND_APPARITION),
          },
        },
        front: {
          F0: {
            battleCardId: parseBattleCardId("f0"),
            cardId: testCardId(UNREGISTERED),
            staticSparkBonus: 2,
          },
          F1: {
            battleCardId: parseBattleCardId("f1"),
            cardId: testCardId(UNREGISTERED),
            staticSparkBonus: 2,
          },
        },
      },
    });

    expect(planSupportRecompute(state, true, () => 0, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Disabled ⇒ every in-play instance target is 0.
// ---------------------------------------------------------------------------

describe("planSupportRecompute — disabled", () => {
  it("clears every in-play instance to 0 when disabled", () => {
    const state = makeState({
      player: {
        back: {
          B1: {
            battleCardId: parseBattleCardId("supporter"),
            cardId: testCardId(WOODLAND_APPARITION),
          },
        },
        front: {
          F0: {
            battleCardId: parseBattleCardId("f0"),
            cardId: testCardId(UNREGISTERED),
            staticSparkBonus: 2,
          },
          F1: {
            battleCardId: parseBattleCardId("f1"),
            cardId: testCardId(UNREGISTERED),
            staticSparkBonus: 2,
          },
        },
      },
    });

    const edits = planSupportRecompute(state, false, () => 0, 0);

    expect(edits).toContainEqual({
      kind: "SET_CARD_STATIC_SPARK_BONUS",
      battleCardId: parseBattleCardId("f0"),
      value: 0,
    });
    expect(edits).toContainEqual({
      kind: "SET_CARD_STATIC_SPARK_BONUS",
      battleCardId: parseBattleCardId("f1"),
      value: 0,
    });
    // The supporter already has bonus 0, so it needs no edit.
    expect(
      edits.some((e) => "battleCardId" in e && e.battleCardId === "supporter"),
    ).toBe(false);
  });

  it("emits no edits when disabled and everything is already 0", () => {
    const state = makeState({
      player: {
        back: {
          B1: {
            battleCardId: parseBattleCardId("supporter"),
            cardId: testCardId(WOODLAND_APPARITION),
          },
        },
        front: {
          F0: {
            battleCardId: parseBattleCardId("f0"),
            cardId: testCardId(UNREGISTERED),
          },
        },
      },
    });

    expect(planSupportRecompute(state, false, () => 0, 0)).toEqual([]);
  });
});
