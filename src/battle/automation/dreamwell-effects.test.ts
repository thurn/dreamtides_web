import { describe, expect, it } from "vitest";
import type { BattleMutableState, BattleSide } from "../types";
import {
  alliesInPlay,
  charactersInVoid,
  drawUntilEdits,
  enemyCharactersInPlay,
  eventsInVoid,
  opponentOf,
} from "./dreamwell-effects";

// ---------------------------------------------------------------------------
// Minimal state fixture
// ---------------------------------------------------------------------------

function makeSide(
  overrides: Partial<{
    hand: string[];
    void: string[];
    deck: string[];
    backRank: Record<string, string | null>;
    frontRank: Record<string, string | null>;
  }> = {},
): BattleMutableState["sides"][BattleSide] {
  return {
    currentEnergy: 3,
    maxEnergy: 5,
    score: 0,
    visibility: {},
    deck: overrides.deck ?? [],
    hand: overrides.hand ?? [],
    void: overrides.void ?? [],
    banished: [],
    backRank: overrides.backRank ?? { B0: null, B1: null, B2: null, B3: null, B4: null },
    frontRank: overrides.frontRank ?? { F0: null, F1: null, F2: null, F3: null },
    fatigueCount: 0,
    dreamwellCardIndex: null,
    dreamwellDrawnTurn: null,
  };
}

function makeState(
  overrides: Partial<{
    playerHand: string[];
    playerVoid: string[];
    playerDeck: string[];
    playerBackRank: Record<string, string | null>;
    playerFrontRank: Record<string, string | null>;
    enemyHand: string[];
    enemyVoid: string[];
    enemyDeck: string[];
    enemyBackRank: Record<string, string | null>;
    enemyFrontRank: Record<string, string | null>;
    cardInstances: BattleMutableState["cardInstances"];
  }> = {},
): BattleMutableState {
  return {
    battleId: "test-battle",
    activeSide: "player",
    turnNumber: 1,
    phase: "day",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 100,
    sides: {
      player: makeSide({
        hand: overrides.playerHand,
        void: overrides.playerVoid,
        deck: overrides.playerDeck,
        backRank: overrides.playerBackRank,
        frontRank: overrides.playerFrontRank,
      }),
      enemy: makeSide({
        hand: overrides.enemyHand,
        void: overrides.enemyVoid,
        deck: overrides.enemyDeck,
        backRank: overrides.enemyBackRank,
        frontRank: overrides.enemyFrontRank,
      }),
    },
    cardInstances: overrides.cardInstances ?? {},
  };
}

function makeCharacter(
  battleCardId: string,
  side: BattleSide,
  energyCost: number,
): BattleMutableState["cardInstances"][string] {
  return {
    battleCardId,
    owner: side,
    controller: side,
    sparkDelta: 0,
    isRevealedToPlayer: true,
    status: {
      isExhausted: false,
      counters: 0,
      reclaimed: false,
      offering: false,
      ephemeral: false,
      veil: 0,
      grantedUnstoppable: false,
      grantedVengeful: false,
      grantedPreeminence: false,
      grantedAwakened: false,
    },
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: {
      kind: "quest-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: 1,
      createdAtSide: side,
      createdAtMs: 0,
    },
    definition: {
      sourceDeckEntryId: null,
      cardNumber: 1,
      name: `char-${battleCardId}`,
      battleCardKind: "character",
      subtype: "warrior",
      energyCost,
      printedEnergyCost: energyCost,
      printedSpark: 2,
      isFast: false,
      reclaimCost: null,
      renderedText: "",
      imageNumber: 1,
      transfiguration: null,
      isBane: false,
    },
  };
}

function makeEvent(
  battleCardId: string,
  side: BattleSide,
  energyCost: number,
): BattleMutableState["cardInstances"][string] {
  return {
    ...makeCharacter(battleCardId, side, energyCost),
    definition: {
      ...makeCharacter(battleCardId, side, energyCost).definition,
      battleCardKind: "event",
      name: `event-${battleCardId}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests: opponentOf
// ---------------------------------------------------------------------------

describe("opponentOf", () => {
  it('returns "enemy" when given "player"', () => {
    expect(opponentOf("player")).toBe("enemy");
  });

  it('returns "player" when given "enemy"', () => {
    expect(opponentOf("enemy")).toBe("player");
  });
});

// ---------------------------------------------------------------------------
// Tests: charactersInVoid
// ---------------------------------------------------------------------------

describe("charactersInVoid", () => {
  it("returns character ids from the given side's void", () => {
    const state = makeState({
      playerVoid: ["c1", "e1"],
      cardInstances: {
        c1: makeCharacter("c1", "player", 2),
        e1: makeEvent("e1", "player", 2),
      },
    });
    expect(charactersInVoid(state, "player")).toEqual(["c1"]);
  });

  it("excludes characters whose energyCost exceeds maxCost", () => {
    const state = makeState({
      playerVoid: ["c1", "c2", "c3"],
      cardInstances: {
        c1: makeCharacter("c1", "player", 1),
        c2: makeCharacter("c2", "player", 3),
        c3: makeCharacter("c3", "player", 5),
      },
    });
    expect(charactersInVoid(state, "player", 3)).toEqual(["c1", "c2"]);
  });

  it("includes all characters when maxCost is omitted", () => {
    const state = makeState({
      playerVoid: ["c1", "c2"],
      cardInstances: {
        c1: makeCharacter("c1", "player", 1),
        c2: makeCharacter("c2", "player", 10),
      },
    });
    expect(charactersInVoid(state, "player")).toEqual(["c1", "c2"]);
  });

  it("excludes events even when energyCost is under maxCost", () => {
    const state = makeState({
      playerVoid: ["e1"],
      cardInstances: {
        e1: makeEvent("e1", "player", 1),
      },
    });
    expect(charactersInVoid(state, "player", 5)).toEqual([]);
  });

  it("does not include cards in the other side's void", () => {
    const state = makeState({
      enemyVoid: ["c1"],
      cardInstances: {
        c1: makeCharacter("c1", "enemy", 2),
      },
    });
    expect(charactersInVoid(state, "player")).toEqual([]);
  });

  it("skips void ids with no instance defensively", () => {
    const state = makeState({
      playerVoid: ["c1", "missing"],
      cardInstances: {
        c1: makeCharacter("c1", "player", 2),
        // "missing" has no entry
      },
    });
    expect(charactersInVoid(state, "player")).toEqual(["c1"]);
  });
});

// ---------------------------------------------------------------------------
// Tests: eventsInVoid
// ---------------------------------------------------------------------------

describe("eventsInVoid", () => {
  it("returns only event ids from the given side's void", () => {
    const state = makeState({
      playerVoid: ["c1", "e1", "e2"],
      cardInstances: {
        c1: makeCharacter("c1", "player", 2),
        e1: makeEvent("e1", "player", 1),
        e2: makeEvent("e2", "player", 3),
      },
    });
    expect(eventsInVoid(state, "player")).toEqual(["e1", "e2"]);
  });

  it("does not include cards from the opponent's void", () => {
    const state = makeState({
      enemyVoid: ["e1"],
      cardInstances: {
        e1: makeEvent("e1", "enemy", 1),
      },
    });
    expect(eventsInVoid(state, "player")).toEqual([]);
  });

  it("skips void ids with no instance defensively", () => {
    const state = makeState({
      playerVoid: ["e1", "ghost"],
      cardInstances: {
        e1: makeEvent("e1", "player", 1),
      },
    });
    expect(eventsInVoid(state, "player")).toEqual(["e1"]);
  });
});

// ---------------------------------------------------------------------------
// Tests: enemyCharactersInPlay
// ---------------------------------------------------------------------------

describe("enemyCharactersInPlay", () => {
  it("returns occupants from the opponent's front and back ranks", () => {
    const state = makeState({
      enemyBackRank: { B0: "c1", B1: null, B2: null, B3: null, B4: null },
      enemyFrontRank: { F0: "c2", F1: null, F2: null, F3: null },
      cardInstances: {
        c1: makeCharacter("c1", "enemy", 2),
        c2: makeCharacter("c2", "enemy", 2),
      },
    });
    const result = enemyCharactersInPlay(state, "player");
    expect(result).toContain("c1");
    expect(result).toContain("c2");
    expect(result).toHaveLength(2);
  });

  it("does not return the calling side's own characters", () => {
    const state = makeState({
      playerBackRank: { B0: "mine", B1: null, B2: null, B3: null, B4: null },
      enemyBackRank: { B0: "theirs", B1: null, B2: null, B3: null, B4: null },
      cardInstances: {
        mine: makeCharacter("mine", "player", 2),
        theirs: makeCharacter("theirs", "enemy", 2),
      },
    });
    const result = enemyCharactersInPlay(state, "player");
    expect(result).toEqual(["theirs"]);
  });

  it("does not return cards from hand or void", () => {
    const state = makeState({
      enemyHand: ["h1"],
      enemyVoid: ["v1"],
      cardInstances: {
        h1: makeCharacter("h1", "enemy", 2),
        v1: makeCharacter("v1", "enemy", 2),
      },
    });
    expect(enemyCharactersInPlay(state, "player")).toEqual([]);
  });

  it("works symmetrically when side is enemy", () => {
    const state = makeState({
      playerFrontRank: { F0: "c1", F1: null, F2: null, F3: null },
      cardInstances: {
        c1: makeCharacter("c1", "player", 2),
      },
    });
    expect(enemyCharactersInPlay(state, "enemy")).toEqual(["c1"]);
  });
});

// ---------------------------------------------------------------------------
// Tests: alliesInPlay
// ---------------------------------------------------------------------------

describe("alliesInPlay", () => {
  it("returns the side's own front and back rank occupants", () => {
    const state = makeState({
      playerBackRank: { B0: "c1", B1: null, B2: null, B3: null, B4: null },
      playerFrontRank: { F0: "c2", F1: null, F2: null, F3: null },
      cardInstances: {
        c1: makeCharacter("c1", "player", 2),
        c2: makeCharacter("c2", "player", 2),
      },
    });
    const result = alliesInPlay(state, "player");
    expect(result).toContain("c1");
    expect(result).toContain("c2");
    expect(result).toHaveLength(2);
  });

  it("does not return the opponent's characters", () => {
    const state = makeState({
      playerBackRank: { B0: "mine", B1: null, B2: null, B3: null, B4: null },
      enemyBackRank: { B0: "theirs", B1: null, B2: null, B3: null, B4: null },
      cardInstances: {
        mine: makeCharacter("mine", "player", 2),
        theirs: makeCharacter("theirs", "enemy", 2),
      },
    });
    expect(alliesInPlay(state, "player")).toEqual(["mine"]);
  });
});

// ---------------------------------------------------------------------------
// Tests: drawUntilEdits
// ---------------------------------------------------------------------------

describe("drawUntilEdits", () => {
  it("returns 0 edits when hand is already at the target", () => {
    const state = makeState({ playerHand: ["c1", "c2", "c3"] });
    expect(drawUntilEdits(state, "player", 3)).toHaveLength(0);
  });

  it("returns 0 edits when hand exceeds the target", () => {
    const state = makeState({ playerHand: ["c1", "c2", "c3", "c4"] });
    expect(drawUntilEdits(state, "player", 3)).toHaveLength(0);
  });

  it("returns the exact deficit number of DRAW_CARD edits", () => {
    const state = makeState({ playerHand: ["c1"] });
    const edits = drawUntilEdits(state, "player", 4);
    expect(edits).toHaveLength(3);
    for (const edit of edits) {
      expect(edit).toEqual({ kind: "DRAW_CARD", side: "player" });
    }
  });

  it("returns target edits when hand is empty", () => {
    const state = makeState({ playerHand: [] });
    expect(drawUntilEdits(state, "player", 2)).toHaveLength(2);
  });

  it("uses correct side for enemy", () => {
    const state = makeState({ enemyHand: [] });
    const edits = drawUntilEdits(state, "enemy", 1);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toEqual({ kind: "DRAW_CARD", side: "enemy" });
  });
});
