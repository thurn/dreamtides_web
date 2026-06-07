import { describe, expect, it } from "vitest";
import {
  addFigmentsToStackInPlace,
  canMergeFigments,
  dissolveFigmentsFromStackInPlace,
  findBattlefieldFigmentStack,
  isFigmentInstance,
  mergeFigmentsIntoStackInPlace,
  selectEffectiveSparkForInstance,
  selectFigmentChallengeLossCount,
  selectFigmentCount,
  selectFigmentSparks,
} from "./figments";
import { createDefaultBattleCardStatus } from "./create-initial-state";
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

function questDeckProvenance(): BattleCardProvenance {
  return {
    kind: "quest-deck",
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
    isRevealedToPlayer: true,
    status: createDefaultBattleCardStatus(),
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: questDeckProvenance(),
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
    nextBattleCardOrdinal: 1,
    nextStackEntryOrdinal: 1,
    stack: [],
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
    backRank: { B0: null, B1: null, B2: null, B3: null, B4: null },
    frontRank: { F0: null, F1: null, F2: null, F3: null },
    fatigueCount: 0,
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
});

describe("selectFigmentSparks", () => {
  it("returns the members sorted descending", () => {
    expect(selectFigmentSparks(makeFigment("f0", [1, 3, 2]))).toEqual([3, 2, 1]);
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

describe("selectFigmentChallengeLossCount (rules §Figments golden examples)", () => {
  it("[2,2,2,2,2] vs 5 → loses two, survivors [2,2,2]", () => {
    const instance = makeFigment("f0", [2, 2, 2, 2, 2]);
    expect(selectFigmentChallengeLossCount(instance, 5)).toBe(2);
    expect(selectEffectiveSparkForInstance(instance)).toBe(10);
  });

  it("[2,2,2] vs 5 → loses two, keeps [2]", () => {
    expect(selectFigmentChallengeLossCount(makeFigment("f0", [2, 2, 2]), 5)).toBe(2);
  });

  it("[1,1,1,1,1] vs 5 → entirely dissolved (tie), loss 5", () => {
    expect(selectFigmentChallengeLossCount(makeFigment("f0", [1, 1, 1, 1, 1]), 5)).toBe(5);
  });

  it("heterogeneous [3,1] vs 3 → top 3 absorbs all, loss 1, survivor [1]", () => {
    expect(selectFigmentChallengeLossCount(makeFigment("f0", [3, 1]), 3)).toBe(1);
  });

  it("returns 0 when opposing spark is zero", () => {
    expect(selectFigmentChallengeLossCount(makeFigment("f0", [2, 2]), 0)).toBe(0);
  });

  it("returns 0 for non-figments", () => {
    expect(selectFigmentChallengeLossCount(makeNonFigment("c0", 5), 3)).toBe(0);
  });
});

describe("addFigmentsToStackInPlace", () => {
  it("pushes new members at the given base spark and re-sorts descending", () => {
    const instance = makeFigment("f0", [3, 1]);
    const state = makeStateWith(instance);
    addFigmentsToStackInPlace(state, "f0", 2, 2);
    expect(state.cardInstances.f0.figments).toEqual([3, 2, 2, 1]);
  });

  it("ignores non-figment targets", () => {
    const instance = makeNonFigment("c0", 4);
    const state = makeStateWith(instance);
    addFigmentsToStackInPlace(state, "c0", 1, 2);
    expect(state.cardInstances.c0.figments).toBeUndefined();
  });
});

describe("mergeFigmentsIntoStackInPlace", () => {
  it("merges incoming members and keeps the array sorted descending", () => {
    const instance = makeFigment("f0", [2, 2]);
    const state = makeStateWith(instance);
    mergeFigmentsIntoStackInPlace(state, "f0", [3, 1]);
    expect(state.cardInstances.f0.figments).toEqual([3, 2, 2, 1]);
  });
});

describe("dissolveFigmentsFromStackInPlace", () => {
  it("drops the top k members (highest spark first) and keeps the rest", () => {
    const instance = makeFigment("f0", [3, 2, 2, 1]);
    const state = makeStateWith(instance);
    const emptied = dissolveFigmentsFromStackInPlace(state, "f0", 2);
    expect(emptied).toBe(false);
    expect(state.cardInstances.f0.figments).toEqual([2, 1]);
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
