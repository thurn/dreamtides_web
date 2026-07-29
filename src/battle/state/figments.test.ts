import { describe, expect, it } from "vitest";
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

function makeDefinition(
  name: string,
  printedSpark: number,
  subtype = "Shadow",
): BattleDeckCardDefinition {
  return {
    sourceDeckEntryId: null,
    cardId: "",
    cardNumber: 0,
    name,
    battleCardKind: "character",
    subtype,
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

function figmentProvenance(subtype: string, chosenSpark: number): BattleCardProvenance {
  return {
    kind: "generated-figment",
    sourceBattleCardId: null,
    chosenSpark,
    chosenSubtype: subtype,
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
  battleCardId: string,
  figments: number[],
  options: { subtype?: string; printedSpark?: number } = {},
): BattleCardInstance {
  const subtype = options.subtype ?? "Shadow";
  return {
    battleCardId,
    definition: makeDefinition(battleCardId, options.printedSpark ?? figments[0] ?? 0, subtype),
    owner: "player",
    controller: "player",
    figments: [...figments],
    sparkDelta: 0,
    staticSparkBonus: 0,
    isRevealedToPlayer: true,
    status: createDefaultBattleCardStatus(),
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: figmentProvenance(subtype, options.printedSpark ?? figments[0] ?? 0),
  };
}

function makeNonFigment(battleCardId: string, printedSpark: number): BattleCardInstance {
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
    battleId: "figments-test",
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
    expect(selectFigmentCount(makeNonFigment("c0", 4))).toBe(1);
  });

  it("returns the member count for a figment stack", () => {
    expect(selectFigmentCount(makeFigment("f0", [2, 2, 2]))).toBe(3);
  });
});

describe("selectEffectiveSparkForInstance", () => {
  it("sums member sparks for a figment stack", () => {
    expect(selectEffectiveSparkForInstance(makeFigment("f0", [3, 1]))).toBe(4);
  });

  it("clamps negative member sparks to zero before summing", () => {
    expect(selectEffectiveSparkForInstance(makeFigment("f0", [2, -5, 1]))).toBe(3);
  });

  it("uses printedSpark + sparkDelta for non-figments", () => {
    const instance = makeNonFigment("c0", 3);
    instance.sparkDelta = 2;
    expect(selectEffectiveSparkForInstance(instance)).toBe(5);
  });

  it("clamps non-figment effective spark to zero", () => {
    const instance = makeNonFigment("c0", 1);
    instance.sparkDelta = -4;
    expect(selectEffectiveSparkForInstance(instance)).toBe(0);
  });

  it("adds staticSparkBonus on top of printedSpark + sparkDelta for non-figments", () => {
    const instance = makeNonFigment("c0", 3);
    instance.sparkDelta = 1;
    instance.staticSparkBonus = 2;
    // printedSpark 3 + sparkDelta 1 + staticSparkBonus 2 = 6
    expect(selectEffectiveSparkForInstance(instance)).toBe(6);
  });

  it("adds the topmost gain once and the anthem per figment for a figment stack", () => {
    const instance = makeFigment("f0", [3, 1]);
    instance.sparkDelta = 1;
    instance.staticSparkBonus = 2;
    // members (3 + 1) + sparkDelta 1 (topmost gain) + anthem 2 × 2 figments = 9
    expect(selectEffectiveSparkForInstance(instance)).toBe(9);
  });

  it("clamps effective spark to zero even when staticSparkBonus is negative", () => {
    const instance = makeNonFigment("c0", 1);
    instance.sparkDelta = 0;
    instance.staticSparkBonus = -5;
    expect(selectEffectiveSparkForInstance(instance)).toBe(0);
  });
});

describe("selectFigmentSparks", () => {
  it("returns the members in stack order, topmost first", () => {
    expect(selectFigmentSparks(makeFigment("f0", [1, 3, 2]))).toEqual([1, 3, 2]);
  });

  it("returns an empty array for non-figments", () => {
    expect(selectFigmentSparks(makeNonFigment("c0", 4))).toEqual([]);
  });

  it("falls back to printedSpark for a figment with no recorded members", () => {
    const instance = makeFigment("f0", [], { printedSpark: 2 });
    instance.figments = undefined;
    expect(selectFigmentSparks(instance)).toEqual([2]);
  });
});

describe("selectTopmostFigmentSpark / selectFigmentReserveSpark", () => {
  it("reads the topmost member (index 0) plus its riding gain and one anthem share", () => {
    const instance = makeFigment("f0", [3, 1, 1]);
    instance.sparkDelta = 2;
    instance.staticSparkBonus = 1;
    // topmost 3 + sparkDelta 2 + anthem 1 = 6
    expect(selectTopmostFigmentSpark(instance)).toBe(6);
    // total: members (3+1+1=5) + sparkDelta 2 + anthem 1×3 = 10; reserves 10 − 6 = 4
    expect(selectEffectiveSparkForInstance(instance)).toBe(10);
    expect(selectFigmentReserveSpark(instance)).toBe(4);
  });

  it("returns the plain effective spark for a non-figment and zero reserves", () => {
    const instance = makeNonFigment("c0", 4);
    instance.sparkDelta = 1;
    expect(selectTopmostFigmentSpark(instance)).toBe(5);
    expect(selectFigmentReserveSpark(instance)).toBe(0);
  });

  it("a single-figment stack has no reserve spark", () => {
    expect(selectFigmentReserveSpark(makeFigment("f0", [2]))).toBe(0);
  });
});

describe("countAlliedWarriors / Legion dynamic spark", () => {
  it("counts each figment member individually and non-figment warriors once", () => {
    const warriorStack = makeFigment("w", [1, 1, 1], { subtype: "Warrior" });
    const state = makeStateWith(warriorStack);
    state.sides.player.frontRank.F0 = "w";
    state.cardInstances.nonfig = makeNonFigment("nonfig", 5); // subtype Warrior
    state.sides.player.frontRank.F1 = "nonfig";
    // three Warrior figments + one non-figment Warrior = four allied warriors
    expect(countAlliedWarriors(state, "player")).toBe(4);
  });

  it("gives each Legion member spark equal to the allied-warrior count", () => {
    const legion = makeFigment("l", [1, 1, 1], { subtype: "Legion" });
    const state = makeStateWith(legion);
    state.sides.player.frontRank.F0 = "l";
    // Three Legion figments alone are three allied warriors, so each is 3✦.
    const ctx = { alliedWarriorCount: countAlliedWarriors(state, "player") };
    expect(ctx.alliedWarriorCount).toBe(3);
    expect(selectTopmostFigmentSpark(legion, ctx)).toBe(3);
    expect(selectEffectiveSparkForInstance(legion, ctx)).toBe(9);
  });

  it("falls back to the stack's own member count when no board context is given", () => {
    const legion = makeFigment("l", [1, 1], { subtype: "Legion" });
    expect(selectEffectiveSparkForInstance(legion)).toBe(4);
  });
});

describe("addFigmentsToStackInPlace", () => {
  it("appends new members at the given base spark to the bottom of the stack", () => {
    const instance = makeFigment("f0", [3, 1]);
    const state = makeStateWith(instance);
    addFigmentsToStackInPlace(state, "f0", 2, 2);
    expect(state.cardInstances.f0.figments).toEqual([3, 1, 2, 2]);
  });

  it("ignores non-figment targets", () => {
    const instance = makeNonFigment("c0", 4);
    const state = makeStateWith(instance);
    addFigmentsToStackInPlace(state, "c0", 1, 2);
    expect(state.cardInstances.c0.figments).toBeUndefined();
  });
});

describe("mergeFigmentsIntoStackInPlace", () => {
  it("appends incoming members to the bottom, preserving stack order", () => {
    const instance = makeFigment("f0", [2, 2]);
    const state = makeStateWith(instance);
    mergeFigmentsIntoStackInPlace(state, "f0", [3, 1]);
    expect(state.cardInstances.f0.figments).toEqual([2, 2, 3, 1]);
  });
});

describe("dissolveFigmentsFromStackInPlace", () => {
  it("drops the top k members (topmost first), keeps the rest, and resets the topmost gain", () => {
    const instance = makeFigment("f0", [3, 2, 2, 1]);
    instance.sparkDelta = 4;
    const state = makeStateWith(instance);
    const emptied = dissolveFigmentsFromStackInPlace(state, "f0", 2);
    expect(emptied).toBe(false);
    expect(state.cardInstances.f0.figments).toEqual([2, 1]);
    expect(state.cardInstances.f0.sparkDelta).toBe(0);
  });

  it("empties the stack and returns true when k covers the stack", () => {
    const instance = makeFigment("f0", [2, 2]);
    const state = makeStateWith(instance);
    const emptied = dissolveFigmentsFromStackInPlace(state, "f0", 5);
    expect(emptied).toBe(true);
    expect(state.cardInstances.f0.figments).toEqual([]);
  });

  it("returns true for non-figment targets without mutating them", () => {
    const instance = makeNonFigment("c0", 4);
    const state = makeStateWith(instance);
    expect(dissolveFigmentsFromStackInPlace(state, "c0", 1)).toBe(true);
    expect(state.cardInstances.c0.figments).toBeUndefined();
  });
});

describe("isFigmentInstance / canMergeFigments / findBattlefieldFigmentStack", () => {
  it("identifies figment instances by provenance", () => {
    expect(isFigmentInstance(makeFigment("f0", [2]))).toBe(true);
    expect(isFigmentInstance(makeNonFigment("c0", 2))).toBe(false);
    expect(isFigmentInstance(null)).toBe(false);
  });

  it("merges only same-subtype figments (case/whitespace-insensitive)", () => {
    const shadowA = makeFigment("f0", [2], { subtype: " shadow " });
    const shadowB = makeFigment("f1", [2], { subtype: "Shadow" });
    const wisp = makeFigment("f2", [2], { subtype: "Wisp" });
    expect(canMergeFigments(shadowA, shadowB)).toBe(true);
    expect(canMergeFigments(shadowA, wisp)).toBe(false);
    expect(canMergeFigments(shadowA, makeNonFigment("c0", 2))).toBe(false);
  });

  it("uses authored UUID identity and requires matching exhaustion", () => {
    const source = makeFigment("f0", [1], { subtype: "Warrior" });
    const sameIdentity = makeFigment("f1", [1], { subtype: "Warrior" });
    const differentIdentity = makeFigment("f2", [1], { subtype: "Warrior" });
    source.definition.cardId = "00000000-0000-4000-8000-000000000001";
    sameIdentity.definition.cardId = "00000000-0000-4000-8000-000000000001";
    differentIdentity.definition.cardId =
      "00000000-0000-4000-8000-000000000002";

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
    const source = makeFigment("f0", [2], { subtype: "Shadow" });
    const destination = makeFigment("f1", [2], { subtype: "Shadow" });
    source.sparkDelta = 3;
    source.staticSparkBonus = 4;
    const state = makeStateWith(source);
    state.cardInstances.f1 = destination;

    expect(selectFigmentMergeSpark(source)).toBe(5);
    expect(mergeFigmentSparkInPlace(state, "f0", "f1")).toMatchObject({
      kind: "eligible",
      addedSpark: 5,
    });
    expect(state.cardInstances.f1.sparkDelta).toBe(5);
    expect(state.cardInstances.f1.figments).toEqual([2]);
  });

  it("lists eligible and exhaustion-blocked twins as occupied merge targets", () => {
    const source = makeFigment("f0", [2]);
    const eligible = makeFigment("f1", [2]);
    const blocked = makeFigment("f2", [2]);
    blocked.status.isExhausted = true;
    const state = makeStateWith(source);
    state.cardInstances.f1 = eligible;
    state.cardInstances.f2 = blocked;
    state.sides.player.backRank.B0 = "f0";
    state.sides.player.backRank.B1 = "f1";
    state.sides.player.backRank.B2 = "f2";

    const targets = selectBattlefieldFigmentMergeTargets(state, "f0");

    expect(targets).toHaveLength(2);
    expect(targets[0]?.destinationBattleCardId).toBe("f1");
    expect(targets[0]?.location).toEqual({ side: "player", zone: "backRank", slotId: "B1" });
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
    const stack = makeFigment("f0", [2, 2], { subtype: "Shadow" });
    const state = makeStateWith(stack);
    state.sides.player.frontRank.F1 = "f0";
    expect(findBattlefieldFigmentStack(state, "player", "Shadow")).toEqual({
      battleCardId: "f0",
      location: { side: "player", zone: "frontRank", slotId: "F1" },
    });
    expect(findBattlefieldFigmentStack(state, "player", "Shadow", "f0")).toBeNull();
    expect(findBattlefieldFigmentStack(state, "player", "Wisp")).toBeNull();
  });
});
