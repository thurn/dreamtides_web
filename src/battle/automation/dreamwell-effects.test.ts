import { describe, expect, it } from "vitest";
import { BACK_RANK_SLOT_IDS, FRONT_RANK_SLOT_IDS } from "../types";
import type { BackRankSlotId, BattleMutableState, BattleSide, FrontRankSlotId } from "../types";
import {
  alliesInPlay,
  charactersInVoid,
  drawEdits,
  drawUntilEdits,
  enemyCharactersInPlay,
  eventsInVoid,
  gainEnergyEdits,
  gainScoreEdits,
  opponentOf,
  topOfDeck,
} from "./dreamwell-effects";
import {
  DREAMWELL_EFFECTS,
  DREAMWELL_MANUAL_IDS,
  dreamwellAutomationStatus,
  selectDreamwellEffectScript,
} from "./dreamwell-effects-table";

// ---------------------------------------------------------------------------
// Minimal state fixture
// ---------------------------------------------------------------------------

function makeSide(
  overrides: Partial<{
    hand: string[];
    void: string[];
    deck: string[];
    backRank: Record<BackRankSlotId, string | null>;
    frontRank: Record<FrontRankSlotId, string | null>;
  }> = {},
): BattleMutableState["sides"][BattleSide] {
  return {
    currentEnergy: 0,
    maxEnergy: 0,
    score: 0,
    visibility: {},
    deck: overrides.deck ?? [],
    hand: overrides.hand ?? [],
    void: overrides.void ?? [],
    banished: [],
    backRank:
      overrides.backRank ??
      (Object.fromEntries(BACK_RANK_SLOT_IDS.map((s) => [s, null])) as Record<BackRankSlotId, string | null>),
    frontRank:
      overrides.frontRank ??
      (Object.fromEntries(FRONT_RANK_SLOT_IDS.map((s) => [s, null])) as Record<FrontRankSlotId, string | null>),
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
    playerBackRank: Record<BackRankSlotId, string | null>;
    playerFrontRank: Record<FrontRankSlotId, string | null>;
    enemyHand: string[];
    enemyVoid: string[];
    enemyDeck: string[];
    enemyBackRank: Record<BackRankSlotId, string | null>;
    enemyFrontRank: Record<FrontRankSlotId, string | null>;
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
  const base = makeCharacter(battleCardId, side, energyCost);
  return {
    ...base,
    definition: {
      ...base.definition,
      battleCardKind: "event" as const,
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

// ---------------------------------------------------------------------------
// Tests: topOfDeck
// ---------------------------------------------------------------------------

describe("topOfDeck", () => {
  it("returns an empty array when n is 0", () => {
    const state = makeState({ playerDeck: ["c1", "c2", "c3"] });
    expect(topOfDeck(state, "player", 0)).toEqual([]);
  });

  it("returns the top n card ids when the deck has enough cards", () => {
    const state = makeState({ playerDeck: ["c1", "c2", "c3", "c4"] });
    expect(topOfDeck(state, "player", 2)).toEqual(["c1", "c2"]);
  });

  it("returns only available cards when the deck is shorter than n", () => {
    const state = makeState({ playerDeck: ["c1", "c2"] });
    expect(topOfDeck(state, "player", 5)).toEqual(["c1", "c2"]);
  });

  it("returns an empty array when the deck is empty", () => {
    const state = makeState({ playerDeck: [] });
    expect(topOfDeck(state, "player", 3)).toEqual([]);
  });

  it("reads from the correct side's deck", () => {
    const state = makeState({ enemyDeck: ["e1", "e2"] });
    expect(topOfDeck(state, "enemy", 1)).toEqual(["e1"]);
  });
});

// ---------------------------------------------------------------------------
// Tests: drawEdits
// ---------------------------------------------------------------------------

describe("drawEdits", () => {
  it("returns an empty array when count is 0", () => {
    expect(drawEdits("player", 0)).toEqual([]);
  });

  it("returns three DRAW_CARD edits with the correct side when count is 3", () => {
    const edits = drawEdits("player", 3);
    expect(edits).toHaveLength(3);
    for (const edit of edits) {
      expect(edit).toEqual({ kind: "DRAW_CARD", side: "player" });
    }
  });

  it("uses the correct side for enemy", () => {
    const edits = drawEdits("enemy", 2);
    expect(edits).toHaveLength(2);
    for (const edit of edits) {
      expect(edit).toEqual({ kind: "DRAW_CARD", side: "enemy" });
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: gainEnergyEdits
// ---------------------------------------------------------------------------

describe("gainEnergyEdits", () => {
  it("returns a single ADJUST_CURRENT_ENERGY edit with the correct side and amount", () => {
    expect(gainEnergyEdits("player", 3)).toEqual([
      { kind: "ADJUST_CURRENT_ENERGY", side: "player", amount: 3 },
    ]);
  });

  it("uses the correct side for enemy", () => {
    expect(gainEnergyEdits("enemy", 1)).toEqual([
      { kind: "ADJUST_CURRENT_ENERGY", side: "enemy", amount: 1 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Tests: gainScoreEdits
// ---------------------------------------------------------------------------

describe("gainScoreEdits", () => {
  it("returns a single ADJUST_SCORE edit with the correct side and amount", () => {
    expect(gainScoreEdits("player", 5)).toEqual([
      { kind: "ADJUST_SCORE", side: "player", amount: 5 },
    ]);
  });

  it("uses the correct side for enemy", () => {
    expect(gainScoreEdits("enemy", 2)).toEqual([
      { kind: "ADJUST_SCORE", side: "enemy", amount: 2 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Tests: dreamwell-effects-table — partition invariant
// ---------------------------------------------------------------------------

describe("DREAMWELL_EFFECTS / DREAMWELL_MANUAL_IDS partition invariant", () => {
  it("all DREAMWELL_EFFECTS keys are 36-char UUIDs that equal their entry id", () => {
    for (const [key, script] of Object.entries(DREAMWELL_EFFECTS)) {
      expect(key).toHaveLength(36);
      expect(key).toBe(script.id);
    }
  });

  it("DREAMWELL_EFFECTS keys and DREAMWELL_MANUAL_IDS are disjoint", () => {
    for (const key of Object.keys(DREAMWELL_EFFECTS)) {
      expect(DREAMWELL_MANUAL_IDS.has(key)).toBe(false);
    }
    for (const id of DREAMWELL_MANUAL_IDS) {
      expect(id in DREAMWELL_EFFECTS).toBe(false);
    }
  });

  it("DREAMWELL_EFFECTS has exactly 14 entries", () => {
    expect(Object.keys(DREAMWELL_EFFECTS)).toHaveLength(14);
  });

  it("DREAMWELL_MANUAL_IDS has exactly 4 entries", () => {
    expect(DREAMWELL_MANUAL_IDS.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Tests: dreamwellAutomationStatus contract
// ---------------------------------------------------------------------------

describe("dreamwellAutomationStatus", () => {
  it('returns "auto" for a known table id', () => {
    // Autumn Glade
    expect(dreamwellAutomationStatus("02e8ea92-1218-413c-9f0b-4c865a3921d3")).toBe("auto");
  });

  it('returns "manual" for each of the 4 excluded ids', () => {
    expect(dreamwellAutomationStatus("f61431f3-33bd-42ff-a229-b4013582e86e")).toBe("manual"); // Forest Trailhead
    expect(dreamwellAutomationStatus("8f5f2e26-44b5-447b-90d0-eaf22ab29fed")).toBe("manual"); // Sunlit Archive
    expect(dreamwellAutomationStatus("2ad68489-044a-40d1-9be6-e62497a4e1fd")).toBe("manual"); // Echo Cascade
    expect(dreamwellAutomationStatus("14dec460-3ec6-40c1-978f-67e70cb0b227")).toBe("manual"); // Firmament Mirror
  });

  it('returns "none" for an unknown id', () => {
    expect(dreamwellAutomationStatus("00000000-0000-0000-0000-000000000000")).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// Tests: selectDreamwellEffectScript
// ---------------------------------------------------------------------------

describe("selectDreamwellEffectScript", () => {
  it("returns the script for a known id", () => {
    const script = selectDreamwellEffectScript("02e8ea92-1218-413c-9f0b-4c865a3921d3");
    expect(script).not.toBeNull();
    expect(script?.id).toBe("02e8ea92-1218-413c-9f0b-4c865a3921d3");
  });

  it("returns null for an unknown id", () => {
    expect(selectDreamwellEffectScript("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: representative deterministic builders
// ---------------------------------------------------------------------------

function makeCtx(
  state: BattleMutableState,
  side: BattleSide = "player",
): import("./dreamwell-effects").StepContext {
  return { side, state, random: () => 0, nowMs: 1000 };
}

/** Extract and assert the first edits step's build function; fails test if missing. */
function getFirstEditsBuild(
  scriptId: string,
): ((ctx: import("./dreamwell-effects").StepContext) => import("../debug/commands").BattleDebugEdit[]) {
  const script = DREAMWELL_EFFECTS[scriptId];
  if (script === undefined) throw new Error(`no script for ${scriptId}`);
  const step = script.steps[0];
  if (step === undefined || step.kind !== "edits") throw new Error(`step 0 is not edits for ${scriptId}`);
  return step.build;
}

describe("Autumn Glade builder", () => {
  it("produces a single ADJUST_SCORE +2 for the active side", () => {
    const state = makeState();
    const build = getFirstEditsBuild("02e8ea92-1218-413c-9f0b-4c865a3921d3");
    const edits = build(makeCtx(state, "player"));
    expect(edits).toEqual([{ kind: "ADJUST_SCORE", side: "player", amount: 2 }]);
  });
});

describe("Twilight Radiance builder", () => {
  it("produces ADJUST_CURRENT_ENERGY +1 for the active side", () => {
    const state = makeState();
    const build = getFirstEditsBuild("de98477c-e216-4618-bff1-0e24bd982fdb");
    const edits = build(makeCtx(state, "player"));
    expect(edits).toEqual([{ kind: "ADJUST_CURRENT_ENERGY", side: "player", amount: 1 }]);
  });
});

describe("The Voltsurge builder", () => {
  it("produces two DRAW_CARD edits for each side (4 total)", () => {
    const state = makeState();
    const build = getFirstEditsBuild("7171ff89-ebe4-42d0-8863-9b4b0531cad2");
    const edits = build(makeCtx(state, "player"));
    const playerDraws = edits.filter((e) => e.kind === "DRAW_CARD" && e.side === "player");
    const enemyDraws = edits.filter((e) => e.kind === "DRAW_CARD" && e.side === "enemy");
    expect(playerDraws).toHaveLength(2);
    expect(enemyDraws).toHaveLength(2);
  });
});

describe("Wellspring Commons builder", () => {
  it("produces zero draws for a side already holding 3 cards", () => {
    const state = makeState({
      playerHand: ["h1", "h2", "h3"],
      enemyHand: [],
    });
    const build = getFirstEditsBuild("06e62e45-53f9-4264-9aa6-2575b445332a");
    const edits = build(makeCtx(state, "player"));
    const playerDraws = edits.filter((e) => e.kind === "DRAW_CARD" && e.side === "player");
    const enemyDraws = edits.filter((e) => e.kind === "DRAW_CARD" && e.side === "enemy");
    expect(playerDraws).toHaveLength(0);
    expect(enemyDraws).toHaveLength(3);
  });
});

describe("The Brimming Well builder", () => {
  it("produces ADJUST_MAX_ENERGY +1 targeting the OPPONENT", () => {
    const state = makeState();
    const build = getFirstEditsBuild("a9c254c4-8448-40ea-bb1a-08c0ef8c7bdf");
    // Active side is player — opponent is enemy
    const edits = build(makeCtx(state, "player"));
    expect(edits).toEqual([{ kind: "ADJUST_MAX_ENERGY", side: "enemy", amount: 1 }]);
    // Active side is enemy — opponent is player
    const edits2 = build(makeCtx(state, "enemy"));
    expect(edits2).toEqual([{ kind: "ADJUST_MAX_ENERGY", side: "player", amount: 1 }]);
  });
});

describe("Eternal Horizon builder", () => {
  it("produces one SET_CARD_SPARK_DELTA per ally with value === existingSparkDelta + 1", () => {
    const ally1 = makeCharacter("ally1", "player", 2);
    const ally2 = { ...makeCharacter("ally2", "player", 3), sparkDelta: 3 };
    const state = makeState({
      playerBackRank: { B0: "ally1", B1: "ally2", B2: null, B3: null, B4: null },
      cardInstances: { ally1, ally2 },
    });
    const build = getFirstEditsBuild("a57f1276-3fb6-4527-b538-953fbace35cf");
    const edits = build(makeCtx(state, "player"));
    expect(edits).toHaveLength(2);
    const e1 = edits.find((e) => e.kind === "SET_CARD_SPARK_DELTA" && e.battleCardId === "ally1");
    const e2 = edits.find((e) => e.kind === "SET_CARD_SPARK_DELTA" && e.battleCardId === "ally2");
    expect(e1).toBeDefined();
    expect(e2).toBeDefined();
    // ally1 has sparkDelta 0 → value should be 1
    expect(e1).toMatchObject({ kind: "SET_CARD_SPARK_DELTA", battleCardId: "ally1", value: 1 });
    // ally2 has sparkDelta 3 → value should be 4
    expect(e2).toMatchObject({ kind: "SET_CARD_SPARK_DELTA", battleCardId: "ally2", value: 4 });
  });
});

// ---------------------------------------------------------------------------
// Tests: property test — every auto script runs without error on a rich fixture
// ---------------------------------------------------------------------------

describe("property test: all DREAMWELL_EFFECTS scripts run without error", () => {
  // Build a rich fixture: player has a character in void, a card in hand (also
  // in cardInstances so Twin Moons step 2 can look it up), allies in play, and
  // the back rank has one open slot for Foxfire Thicket / Celestial Gateway.
  const HAND_CARD_ID = "hand-char-1";
  const ALLY_ID = "ally-1";
  const P_VOID_CHAR_ID = "pvoid-char-1";
  const E_VOID_CHAR_ID = "evoid-char-1";

  const richState: BattleMutableState = makeState({
    playerHand: [HAND_CARD_ID],
    playerVoid: [P_VOID_CHAR_ID],
    playerBackRank: { B0: ALLY_ID, B1: null, B2: null, B3: null, B4: null },
    enemyHand: [],
    enemyVoid: [E_VOID_CHAR_ID],
    // leave enemy back rank open so Celestial Gateway can place there
    cardInstances: {
      [HAND_CARD_ID]: makeCharacter(HAND_CARD_ID, "player", 2),
      [ALLY_ID]: makeCharacter(ALLY_ID, "player", 2),
      [P_VOID_CHAR_ID]: makeCharacter(P_VOID_CHAR_ID, "player", 3),
      [E_VOID_CHAR_ID]: makeCharacter(E_VOID_CHAR_ID, "enemy", 3),
    },
  });

  const ctx: import("./dreamwell-effects").StepContext = {
    side: "player",
    state: richState,
    random: () => 0,
    nowMs: 42000,
  };

  for (const [id, script] of Object.entries(DREAMWELL_EFFECTS)) {
    it(`script ${id} (${script.id}) runs all edits steps without error`, () => {
      for (const step of script.steps) {
        if (step.kind !== "edits") continue;
        let edits: ReturnType<typeof step.build>;
        expect(() => {
          edits = step.build(ctx);
        }).not.toThrow();
        // Every edit that references a battleCardId must point to a real instance
        for (const edit of edits!) {
          if ("battleCardId" in edit) {
            expect(richState.cardInstances).toHaveProperty(edit.battleCardId);
          }
        }
      }
    });
  }
});
