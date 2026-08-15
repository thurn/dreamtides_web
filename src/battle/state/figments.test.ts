import { describe, expect, it } from "vitest";
import {
  testCardName,
  testCardSubtype,
} from "../../types/test-identities";
import {
  addFigmentsToStackInPlace,
  assessFigmentMerge,
  canMergeFigments,
  countAlliedWarriors,
  dissolveFigmentsFromStackInPlace,
  findBattlefieldFigmentStack,
  isFigmentInstance,
  mergeFigmentsIntoStackInPlace,
  mergeFigmentSparkInPlace,
  selectBattlefieldFigmentMergeTargets,
  selectEffectiveSparkForInstance,
  selectFigmentCount,
  selectFigmentReserveSpark,
  selectFigmentMergeSpark,
  selectFigmentSparks,
  selectTopmostFigmentSpark,
} from "./figments";
import { createDefaultBattleCardStatus } from "./create-initial-state";
import { emptyBackRankSlots, emptyFrontRankSlots } from "../test-support";
import type {
  BattleCardInstance,
  BattleCardProvenance,
  BattleDeckCardDefinition,
  BattleMutableState,
} from "../types";
import type { BattleCardId } from "../../types/identifiers";
import { parseBattleId } from "../../types/identifiers";
import { parseBattleCardId } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";

const CARD_C0_ID = parseBattleCardId("c0");
const CARD_F0_ID = parseBattleCardId("f0");
const CARD_F1_ID = parseBattleCardId("f1");
const CARD_F2_ID = parseBattleCardId("f2");
const CARD_LEGION_ID = parseBattleCardId("l");
const CARD_NONFIG_ID = parseBattleCardId("nonfig");
const CARD_WARRIOR_ID = parseBattleCardId("w");

function makeDefinition(
  name: string,
  printedSpark: number,
  subtype = "Shadow",
): BattleDeckCardDefinition {
  return {
    sourceDeckEntryId: null,
    cardId: testCardId(`fixture-figment-${subtype.trim().toLowerCase()}`),
    cardNumber: 0,
    name: testCardName(name),
    battleCardKind: "character",
    subtype: testCardSubtype(subtype),
    energyCost: 0,
    printedEnergyCost: 0,
    printedSpark,
    isFast: false,
    reclaimCost: null,
    renderedText: "",
    imageNumber: 0,
    transfiguration: null,
    isBane: false,
  };
}

function figmentProvenance(
  subtype: string,
  chosenSpark: number,
): BattleCardProvenance {
  return {
    kind: "generated-figment",
    sourceBattleCardId: null,
    chosenSpark,
    chosenSubtype: testCardSubtype(subtype),
    createdAtTurnNumber: 1,
    createdAtSide: "player",
    createdAtMs: 1,
  };
}

function journeyDeckProvenance(): BattleCardProvenance {
  return {
    kind: "journey-deck",
    sourceBattleCardId: null,
    chosenSpark: null,
    chosenSubtype: null,
    createdAtTurnNumber: null,
    createdAtSide: null,
    createdAtMs: null,
  };
}

function makeFigment(
  battleCardId: BattleCardId,
  figments: number[],
  options: { subtype?: string; printedSpark?: number } = {},
): BattleCardInstance {
  const subtype = options.subtype ?? "Shadow";
  return {
    battleCardId,
    definition: makeDefinition(
      battleCardId,
      options.printedSpark ?? figments[0] ?? 0,
      subtype,
    ),
    owner: "player",
    controller: "player",
    figments: [...figments],
    sparkDelta: 0,
    staticSparkBonus: 0,
    isRevealedToPlayer: true,
    status: createDefaultBattleCardStatus(),
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: figmentProvenance(
      subtype,
      options.printedSpark ?? figments[0] ?? 0,
    ),
  };
}

function makeNonFigment(
  battleCardId: BattleCardId,
  printedSpark: number,
): BattleCardInstance {
  return {
    battleCardId,
    definition: makeDefinition(battleCardId, printedSpark, "Warrior"),
    owner: "player",
    controller: "player",
    sparkDelta: 0,
    staticSparkBonus: 0,
    isRevealedToPlayer: true,
    status: createDefaultBattleCardStatus(),
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: journeyDeckProvenance(),
  };
}

function makeStateWith(instance: BattleCardInstance): BattleMutableState {
  return {
    battleId: parseBattleId("figments-test"),
    activeSide: "player",
    turnNumber: 1,
    phase: "challenge",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 1,
    sides: {
      player: makeEmptySide(),
      enemy: makeEmptySide(),
    },
    cardInstances: { [instance.battleCardId]: instance },
  };
}

function makeEmptySide(): BattleMutableState["sides"]["player"] {
  return {
    currentEnergy: 0,
    maxEnergy: 0,
    score: 0,
    visibility: {},
    deck: [],
    hand: [],
    void: [],
    banished: [],
    backRank: emptyBackRankSlots(),
    frontRank: emptyFrontRankSlots(),
    fatigueCount: 0,
    dreamwellCardIndex: null,
    dreamwellDrawnTurn: null,
  };
}

describe("selectFigmentCount", () => {
  it("returns 1 for non-figment instances", () => {
    expect(selectFigmentCount(makeNonFigment(CARD_C0_ID, 4))).toBe(1);
  });

  it("returns the member count for a figment stack", () => {
    expect(
      selectFigmentCount(makeFigment(CARD_F0_ID, [2, 2, 2])),
    ).toBe(3);
  });
});

describe("selectEffectiveSparkForInstance", () => {
  it("sums member sparks for a figment stack", () => {
    expect(
      selectEffectiveSparkForInstance(
        makeFigment(CARD_F0_ID, [3, 1]),
      ),
    ).toBe(4);
  });

  it("clamps negative member sparks to zero before summing", () => {
    expect(
      selectEffectiveSparkForInstance(
        makeFigment(CARD_F0_ID, [2, -5, 1]),
      ),
    ).toBe(3);
  });

  it("uses printedSpark + sparkDelta for non-figments", () => {
    const instance = makeNonFigment(CARD_C0_ID, 3);
    instance.sparkDelta = 2;
    expect(selectEffectiveSparkForInstance(instance)).toBe(5);
  });

  it("clamps non-figment effective spark to zero", () => {
    const instance = makeNonFigment(CARD_C0_ID, 1);
    instance.sparkDelta = -4;
    expect(selectEffectiveSparkForInstance(instance)).toBe(0);
  });

  it("adds staticSparkBonus on top of printedSpark + sparkDelta for non-figments", () => {
    const instance = makeNonFigment(CARD_C0_ID, 3);
    instance.sparkDelta = 1;
    instance.staticSparkBonus = 2;
    // printedSpark 3 + sparkDelta 1 + staticSparkBonus 2 = 6
    expect(selectEffectiveSparkForInstance(instance)).toBe(6);
  });

  it("adds the topmost gain once and the static bonus per figment for a stack", () => {
    const instance = makeFigment(CARD_F0_ID, [3, 1]);
    instance.sparkDelta = 1;
    instance.staticSparkBonus = 2;
    // members (3 + 1) + sparkDelta 1 + static bonus 2 × 2 figments = 9
    expect(selectEffectiveSparkForInstance(instance)).toBe(9);
  });

  it("clamps effective spark to zero even when staticSparkBonus is negative", () => {
    const instance = makeNonFigment(CARD_C0_ID, 1);
    instance.sparkDelta = 0;
    instance.staticSparkBonus = -5;
    expect(selectEffectiveSparkForInstance(instance)).toBe(0);
  });
});

describe("selectFigmentSparks", () => {
  it("returns the members in stack order, topmost first", () => {
    expect(
      selectFigmentSparks(makeFigment(CARD_F0_ID, [1, 3, 2])),
    ).toEqual([1, 3, 2]);
  });

  it("returns an empty array for non-figments", () => {
    expect(
      selectFigmentSparks(makeNonFigment(CARD_C0_ID, 4)),
    ).toEqual([]);
  });

  it("falls back to printedSpark for a figment with no recorded members", () => {
    const instance = makeFigment(CARD_F0_ID, [], { printedSpark: 2 });
    instance.figments = undefined;
    expect(selectFigmentSparks(instance)).toEqual([2]);
  });
});

describe("selectTopmostFigmentSpark / selectFigmentReserveSpark", () => {
  it("reads the topmost member plus its riding gain and one static-bonus share", () => {
    const instance = makeFigment(CARD_F0_ID, [3, 1, 1]);
    instance.sparkDelta = 2;
    instance.staticSparkBonus = 1;
    // topmost 3 + sparkDelta 2 + static bonus 1 = 6
    expect(selectTopmostFigmentSpark(instance)).toBe(6);
    // total: members 5 + sparkDelta 2 + static bonus 1×3 = 10; reserves = 4
    expect(selectEffectiveSparkForInstance(instance)).toBe(10);
    expect(selectFigmentReserveSpark(instance)).toBe(4);
  });

  it("returns the plain effective spark for a non-figment and zero reserves", () => {
    const instance = makeNonFigment(CARD_C0_ID, 4);
    instance.sparkDelta = 1;
    expect(selectTopmostFigmentSpark(instance)).toBe(5);
    expect(selectFigmentReserveSpark(instance)).toBe(0);
  });

  it("a single-figment stack has no reserve spark", () => {
    expect(
      selectFigmentReserveSpark(makeFigment(CARD_F0_ID, [2])),
    ).toBe(0);
  });
});

describe("countAlliedWarriors / Legion dynamic spark", () => {
  it("counts each figment member individually and non-figment warriors once", () => {
    const warriorStack = makeFigment(CARD_WARRIOR_ID, [1, 1, 1], {
      subtype: "Warrior",
    });
    const state = makeStateWith(warriorStack);
    state.sides.player.frontRank.F0 = CARD_WARRIOR_ID;
    state.cardInstances[CARD_NONFIG_ID] = makeNonFigment(CARD_NONFIG_ID, 5); // subtype Warrior
    state.sides.player.frontRank.F1 = CARD_NONFIG_ID;
    // three Warrior figments + one non-figment Warrior = four allied warriors
    expect(countAlliedWarriors(state, "player")).toBe(4);
  });

  it("gives each Legion member spark equal to the allied-warrior count", () => {
    const legion = makeFigment(CARD_LEGION_ID, [1, 1, 1], {
      subtype: "Legion",
    });
    const state = makeStateWith(legion);
    state.sides.player.frontRank.F0 = CARD_LEGION_ID;
    // Three Legion figments alone are three allied warriors, so each is 3✦.
    const ctx = { alliedWarriorCount: countAlliedWarriors(state, "player") };
    expect(ctx.alliedWarriorCount).toBe(3);
    expect(selectTopmostFigmentSpark(legion, ctx)).toBe(3);
    expect(selectEffectiveSparkForInstance(legion, ctx)).toBe(9);
  });

  it("falls back to the stack's own member count when no board context is given", () => {
    const legion = makeFigment(CARD_LEGION_ID, [1, 1], {
      subtype: "Legion",
    });
    expect(selectEffectiveSparkForInstance(legion)).toBe(4);
  });
});

describe("addFigmentsToStackInPlace", () => {
  it("appends new members at the given base spark to the bottom of the stack", () => {
    const instance = makeFigment(CARD_F0_ID, [3, 1]);
    const state = makeStateWith(instance);
    addFigmentsToStackInPlace(state, CARD_F0_ID, 2, 2);
    expect(state.cardInstances[CARD_F0_ID].figments).toEqual([3, 1, 2, 2]);
  });

  it("ignores non-figment targets", () => {
    const instance = makeNonFigment(CARD_C0_ID, 4);
    const state = makeStateWith(instance);
    addFigmentsToStackInPlace(state, CARD_C0_ID, 1, 2);
    expect(state.cardInstances[CARD_C0_ID].figments).toBeUndefined();
  });
});

describe("mergeFigmentsIntoStackInPlace", () => {
  it("appends incoming members to the bottom, preserving stack order", () => {
    const instance = makeFigment(CARD_F0_ID, [2, 2]);
    const state = makeStateWith(instance);
    mergeFigmentsIntoStackInPlace(state, CARD_F0_ID, [3, 1]);
    expect(state.cardInstances[CARD_F0_ID].figments).toEqual([2, 2, 3, 1]);
  });
});

describe("dissolveFigmentsFromStackInPlace", () => {
  it("drops the top k members (topmost first), keeps the rest, and resets the topmost gain", () => {
    const instance = makeFigment(CARD_F0_ID, [3, 2, 2, 1]);
    instance.sparkDelta = 4;
    const state = makeStateWith(instance);
    const emptied = dissolveFigmentsFromStackInPlace(
      state,
      CARD_F0_ID,
      2,
    );
    expect(emptied).toBe(false);
    expect(state.cardInstances[CARD_F0_ID].figments).toEqual([2, 1]);
    expect(state.cardInstances[CARD_F0_ID].sparkDelta).toBe(0);
  });

  it("empties the stack and returns true when k covers the stack", () => {
    const instance = makeFigment(CARD_F0_ID, [2, 2]);
    const state = makeStateWith(instance);
    const emptied = dissolveFigmentsFromStackInPlace(
      state,
      CARD_F0_ID,
      5,
    );
    expect(emptied).toBe(true);
    expect(state.cardInstances[CARD_F0_ID].figments).toEqual([]);
  });

  it("returns true for non-figment targets without mutating them", () => {
    const instance = makeNonFigment(CARD_C0_ID, 4);
    const state = makeStateWith(instance);
    expect(
      dissolveFigmentsFromStackInPlace(state, CARD_C0_ID, 1),
    ).toBe(true);
    expect(state.cardInstances[CARD_C0_ID].figments).toBeUndefined();
  });
});

describe("isFigmentInstance / canMergeFigments / findBattlefieldFigmentStack", () => {
  it("identifies figment instances by provenance", () => {
    expect(isFigmentInstance(makeFigment(CARD_F0_ID, [2]))).toBe(
      true,
    );
    expect(isFigmentInstance(makeNonFigment(CARD_C0_ID, 2))).toBe(
      false,
    );
    expect(isFigmentInstance(null)).toBe(false);
  });

  it("merges only same-subtype figments (case/whitespace-insensitive)", () => {
    const shadowA = makeFigment(CARD_F0_ID, [2], {
      subtype: " shadow ",
    });
    const shadowB = makeFigment(CARD_F1_ID, [2], {
      subtype: "Shadow",
    });
    const wisp = makeFigment(CARD_F2_ID, [2], { subtype: "Wisp" });
    expect(canMergeFigments(shadowA, shadowB)).toBe(true);
    expect(canMergeFigments(shadowA, wisp)).toBe(false);
    expect(
      canMergeFigments(shadowA, makeNonFigment(CARD_C0_ID, 2)),
    ).toBe(false);
  });

  it("uses authored UUID identity and requires matching exhaustion", () => {
    const source = makeFigment(CARD_F0_ID, [1], {
      subtype: "Warrior",
    });
    const sameIdentity = makeFigment(CARD_F1_ID, [1], {
      subtype: "Warrior",
    });
    const differentIdentity = makeFigment(CARD_F2_ID, [1], {
      subtype: "Warrior",
    });
    source.definition.cardId = testCardId("00000000-0000-4000-8000-000000000001");
    sameIdentity.definition.cardId = testCardId(
      "00000000-0000-4000-8000-000000000001",
    );
    differentIdentity.definition.cardId = testCardId(
      "00000000-0000-4000-8000-000000000002",
    );

    expect(assessFigmentMerge(source, sameIdentity)).toMatchObject({
      kind: "eligible",
      addedSpark: 1,
    });
    expect(assessFigmentMerge(source, differentIdentity)).toEqual({
      kind: "ineligible",
      reason: "different-identity",
    });

    sameIdentity.status.isExhausted = true;
    expect(assessFigmentMerge(source, sameIdentity)).toEqual({
      kind: "ineligible",
      reason: "exhaustion-mismatch",
    });
  });

  it("transfers own spark into one destination character without static bonuses", () => {
    const source = makeFigment(CARD_F0_ID, [2], {
      subtype: "Shadow",
    });
    const destination = makeFigment(CARD_F1_ID, [2], {
      subtype: "Shadow",
    });
    source.sparkDelta = 3;
    source.staticSparkBonus = 4;
    const state = makeStateWith(source);
    state.cardInstances[CARD_F1_ID] = destination;

    expect(selectFigmentMergeSpark(source)).toBe(5);
    expect(
      mergeFigmentSparkInPlace(
        state,
        CARD_F0_ID,
        CARD_F1_ID,
      ),
    ).toMatchObject({
      kind: "eligible",
      addedSpark: 5,
    });
    expect(state.cardInstances[CARD_F1_ID].sparkDelta).toBe(5);
    expect(state.cardInstances[CARD_F1_ID].figments).toEqual([2]);
  });

  it("lists eligible and exhaustion-blocked twins as occupied merge targets", () => {
    const source = makeFigment(CARD_F0_ID, [2]);
    const eligible = makeFigment(CARD_F1_ID, [2]);
    const blocked = makeFigment(CARD_F2_ID, [2]);
    blocked.status.isExhausted = true;
    const state = makeStateWith(source);
    state.cardInstances[CARD_F1_ID] = eligible;
    state.cardInstances[CARD_F2_ID] = blocked;
    state.sides.player.backRank.B0 = CARD_F0_ID;
    state.sides.player.backRank.B1 = CARD_F1_ID;
    state.sides.player.backRank.B2 = CARD_F2_ID;

    const targets = selectBattlefieldFigmentMergeTargets(
      state,
      CARD_F0_ID,
    );

    expect(targets).toHaveLength(2);
    expect(targets[0]?.destinationBattleCardId).toBe(CARD_F1_ID);
    expect(targets[0]?.location).toEqual({
      side: "player",
      zone: "backRank",
      slotId: "B1",
    });
    expect(targets[0]?.assessment.kind).toBe("eligible");
    expect(targets[1]).toEqual({
      destinationBattleCardId: "f2",
      location: { side: "player", zone: "backRank", slotId: "B2" },
      assessment: {
        kind: "ineligible",
        reason: "exhaustion-mismatch",
      },
    });
  });

  it("finds a same-type figment stack on the battlefield, skipping the excluded id", () => {
    const stack = makeFigment(CARD_F0_ID, [2, 2], {
      subtype: "Shadow",
    });
    const state = makeStateWith(stack);
    state.sides.player.frontRank.F1 = CARD_F0_ID;
    expect(findBattlefieldFigmentStack(state, "player", "Shadow")).toEqual({
      battleCardId: CARD_F0_ID,
      location: { side: "player", zone: "frontRank", slotId: "F1" },
    });
    expect(
      findBattlefieldFigmentStack(
        state,
        "player",
        "Shadow",
        CARD_F0_ID,
      ),
    ).toBeNull();
    expect(
      findBattlefieldFigmentStack(
        state,
        "player",
        testCardSubtype("Wisp"),
      ),
    ).toBeNull();
  });
});
