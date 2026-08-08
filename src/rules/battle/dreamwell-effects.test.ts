import { describe, expect, it } from "vitest";
import type { BackRankSlotId, BattleMutableState, BattleSide, FrontRankSlotId } from "../../battle/types";
import { emptyBackRankSlots, emptyFrontRankSlots } from "../../battle/test-support";
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
} from "./effect-step";
import {
  DREAMWELL_EFFECTS,
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
    backRank: overrides.backRank ?? emptyBackRankSlots(),
    frontRank: overrides.frontRank ?? emptyFrontRankSlots(),
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
    staticSparkBonus: 0,
    isRevealedToPlayer: true,
    status: {
      isExhausted: false,
      counters: 0,
      reclaimed: false,
      offering: false,
      ephemeral: false,
      veil: false,
      grantedVengeful: false,
      grantedAwakened: false,
    },
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: {
      kind: "journey-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: 1,
      createdAtSide: side,
      createdAtMs: 0,
    },
    definition: {
      sourceDeckEntryId: null,
      cardId: "",
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
      enemyBackRank: { ...emptyBackRankSlots(), B0: "c1" },
      enemyFrontRank: { ...emptyFrontRankSlots(), F0: "c2" },
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
      playerBackRank: { ...emptyBackRankSlots(), B0: "mine" },
      enemyBackRank: { ...emptyBackRankSlots(), B0: "theirs" },
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
      playerFrontRank: { ...emptyFrontRankSlots(), F0: "c1" },
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
      playerBackRank: { ...emptyBackRankSlots(), B0: "c1" },
      playerFrontRank: { ...emptyFrontRankSlots(), F0: "c2" },
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
      playerBackRank: { ...emptyBackRankSlots(), B0: "mine" },
      enemyBackRank: { ...emptyBackRankSlots(), B0: "theirs" },
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

describe("DREAMWELL_EFFECTS catalog coverage", () => {
  it("all DREAMWELL_EFFECTS keys are 36-char UUIDs that equal their entry id", () => {
    for (const [key, script] of Object.entries(DREAMWELL_EFFECTS)) {
      expect(key).toHaveLength(36);
      expect(key).toBe(script.id);
    }
  });

  it("registers every current Dreamwell UUID", () => {
    const catalogIds = [
      "32d64cb6-9856-43a2-9451-fcb14007a9a6", "5e17dc4b-b654-4962-ba5a-7b042852a980", "5ec17498-9028-4a01-80a0-67c91b03d505", "f9b479cf-02cb-40e1-bb64-70b29977bf15", "02e8ea92-1218-413c-9f0b-4c865a3921d3", "de98477c-e216-4618-bff1-0e24bd982fdb", "ee1ef770-29ea-4a63-a1f9-7e97b5b8870d", "cf0f0a05-2a94-407c-8c22-e41b925f9c03", "fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5", "558a1f1b-7dc1-4d83-9f00-c6af2187a954", "14dec460-3ec6-40c1-978f-67e70cb0b227", "03e4e701-4720-4278-8198-9b7e0514d4cf", "662b7393-751c-4aa9-8150-5f20b4d176a4", "7171ff89-ebe4-42d0-8863-9b4b0531cad2", "fa8704fe-759f-408d-992d-d8f9d5ffd760", "2b23a60c-209c-4c75-b63c-b7f73b2e1a56", "9954cede-8a16-4053-b6e9-da745f4540f5", "3a4293da-55a1-4094-898a-df402ffa1c92", "d585b78a-dfe3-4e12-95ac-432c3c880540", "a3033051-8eb7-4fbf-93d6-f947ed68974d", "556057bb-b134-497e-86c2-c6f30049e9e3", "20be0fdd-d691-40a9-b4f8-15689ea7ebaa", "a57f1276-3fb6-4527-b538-953fbace35cf", "f61431f3-33bd-42ff-a229-b4013582e86e", "51caf26d-83bf-45a9-bc80-010d353277db", "eae99eb2-0fa8-4d12-b7b2-3f5387cb6d3a", "a9c254c4-8448-40ea-bb1a-08c0ef8c7bdf", "2ad68489-044a-40d1-9be6-e62497a4e1fd", "af2ef62f-d31b-4544-a2b0-f5aab03c2d7c", "91deefd2-0400-4c78-ab9f-f6db864ff7e2", "8f5f2e26-44b5-447b-90d0-eaf22ab29fed", "a0fbcbd9-96ee-4392-add7-e1d436f99553", "06e62e45-53f9-4264-9aa6-2575b445332a", "120ec4c2-aa7b-48f4-be9f-f39820e565ca", "446095b1-ec4d-40d7-8eed-a8221d339ea2",
    ];
    expect(Object.keys(DREAMWELL_EFFECTS).sort()).toEqual([...catalogIds].sort());
    for (const id of catalogIds) expect(dreamwellAutomationStatus(id)).toBe("auto");
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

describe("Dreamwell Discover UUIDs", () => {
  const CARD_DISCOVER = "f61431f3-33bd-42ff-a229-b4013582e86e";
  const CHARACTER_DISCOVER = "8f5f2e26-44b5-447b-90d0-eaf22ab29fed";

  it("samples matching deck instances once, caps at three, and resolves from persisted candidates", () => {
    const state = makeState({
      playerDeck: ["low-a", "high", "low-b", "low-c", "low-d"],
      cardInstances: {
        "low-a": makeCharacter("low-a", "player", 1),
        high: makeCharacter("high", "player", 3),
        "low-b": makeEvent("low-b", "player", 2),
        "low-c": makeCharacter("low-c", "player", 2),
        "low-d": makeCharacter("low-d", "player", 1),
      },
    });
    const prompt = getFirstPromptStep(CARD_DISCOVER);
    if (prompt.kind !== "pick-cards") throw new Error("expected picker");
    let draws = 0;
    const candidates = prompt.candidates({ ...makeCtx(state), random: () => { draws += 1; return 0.25; } });
    expect(draws).toBe(1);
    expect(candidates).toHaveLength(3);
    expect(candidates.every((id) => state.sides.player.deck.includes(id))).toBe(true);
    expect(candidates.every((id) => state.cardInstances[id]?.definition.energyCost !== undefined && state.cardInstances[id].definition.energyCost <= 2)).toBe(true);

    const chosen = candidates[0];
    if (chosen === undefined) throw new Error("expected discover candidate");
    const context = { ...makeCtx(state), promptCandidateIds: candidates };
    const direct = prompt.resolve([chosen], context);
    const reloaded = prompt.resolve([chosen], { ...context, promptCandidateIds: [...candidates] });
    expect(reloaded).toEqual(direct);
    expect(direct[0]).toEqual({ kind: "MOVE_CARD_TO_ZONE", battleCardId: chosen, destination: { side: "player", zone: "hand" } });
    const reorder = direct[1];
    expect(reorder).toMatchObject({ kind: "REORDER_DECK", side: "player" });
    if (reorder?.kind !== "REORDER_DECK") throw new Error("expected reorder");
    expect([...reorder.order].sort()).toEqual(state.sides.player.deck.filter((id) => id !== chosen).sort());
  });

  it("offers zero/fewer/exact character candidates without inventing cards", () => {
    const prompt = getFirstPromptStep(CHARACTER_DISCOVER);
    if (prompt.kind !== "pick-cards") throw new Error("expected picker");
    const none = makeState({ playerDeck: ["event"], cardInstances: { event: makeEvent("event", "player", 1) } });
    expect(prompt.candidates(makeCtx(none))).toEqual([]);
    const fewer = makeState({ playerDeck: ["character"], cardInstances: { character: makeCharacter("character", "player", 5) } });
    expect(prompt.candidates(makeCtx(fewer))).toEqual(["character"]);
    const exact = makeState({ playerDeck: ["a", "b", "c"], cardInstances: { a: makeCharacter("a", "player", 1), b: makeCharacter("b", "player", 2), c: makeCharacter("c", "player", 3) } });
    expect(prompt.candidates(makeCtx(exact))).toHaveLength(3);
  });
});

describe("new prompt-driven Dreamwell UUIDs", () => {
  it("rematerializes only an in-play ally", () => {
    const prompt = getFirstPromptStep("2ad68489-044a-40d1-9be6-e62497a4e1fd");
    if (prompt.kind !== "pick-cards") throw new Error("expected picker");
    const state = makeState({ playerBackRank: { ...emptyBackRankSlots(), B0: "ally" }, cardInstances: { ally: makeCharacter("ally", "player", 2) } });
    expect(prompt.candidates(makeCtx(state))).toEqual(["ally"]);
    expect(prompt.resolve(["ally"], makeCtx(state))).toEqual([{ kind: "REMATERIALIZE", battleCardId: "ally" }]);
  });

  it("records the temporary Reclaim eligibility separately from reclaimed", () => {
    const prompt = getFirstPromptStep("14dec460-3ec6-40c1-978f-67e70cb0b227");
    if (prompt.kind !== "pick-cards") throw new Error("expected picker");
    expect(prompt.subtitle?.id).toBe("battle-prompt-choose-void-card-reclaim-subtitle");
    const state = makeState({ playerVoid: ["void-card"], cardInstances: { "void-card": makeCharacter("void-card", "player", 2) } });
    const [edit] = prompt.resolve(["void-card"], makeCtx(state));
    expect(edit).toMatchObject({ kind: "SET_CARD_STATUS", battleCardId: "void-card", status: { temporaryReclaimUntilEnding: { activeSide: "player", turnNumber: 1 } } });
  });
});

// ---------------------------------------------------------------------------
// Tests: representative deterministic builders
// ---------------------------------------------------------------------------

function makeCtx(
  state: BattleMutableState,
  side: BattleSide = "player",
): import("./effect-step").StepContext {
  return { side, state, random: () => 0, nowMs: 1000 };
}

/** Extract and assert the first edits step's build function; fails test if missing. */
function getFirstEditsBuild(
  scriptId: string,
): ((ctx: import("./effect-step").StepContext) => import("../../battle/debug/commands").BattleDebugEdit[]) {
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

describe("Nomad's Verge builder", () => {
  it("places the figment at the leftmost open back-rank slot outside the tutorial", () => {
    const state = makeState();
    const build = getFirstEditsBuild("51caf26d-83bf-45a9-bc80-010d353277db");
    const edits = build(makeCtx(state, "enemy"));
    expect(edits).toEqual([expect.objectContaining({
      kind: "CREATE_FIGMENT",
      destination: { side: "enemy", zone: "backRank", slotId: "B0" },
    })]);
  });

  it("places the figment at the center of the rendered back rank during the tutorial", () => {
    const state = makeState();
    const build = getFirstEditsBuild("51caf26d-83bf-45a9-bc80-010d353277db");
    const edits = build({ ...makeCtx(state, "enemy"), isTutorial: true });
    expect(edits).toEqual([expect.objectContaining({
      kind: "CREATE_FIGMENT",
      destination: { side: "enemy", zone: "backRank", slotId: "B4" },
    })]);
  });

  it("during the tutorial, falls back to the nearest open slot when the center is occupied", () => {
    const state = makeState({
      enemyBackRank: { ...emptyBackRankSlots(), B4: "existing-enemy" },
    });
    const build = getFirstEditsBuild("51caf26d-83bf-45a9-bc80-010d353277db");
    const edits = build({ ...makeCtx(state, "enemy"), isTutorial: true });
    expect(edits).toEqual([expect.objectContaining({
      kind: "CREATE_FIGMENT",
      destination: { side: "enemy", zone: "backRank", slotId: "B5" },
    })]);
  });

  it("during the tutorial, ignores slots beyond BACK_RANK_SLOTS when picking the center", () => {
    // ensureContiguousRankSlots (apply-debug-edit.ts) can widen the backing
    // record past the rendered width, e.g. after an off-battlefield-width
    // debug placement; the center choice must stay pinned to what the
    // battlefield actually renders (B0..B9), never spilling into B10+.
    const state = makeState({
      enemyBackRank: { ...emptyBackRankSlots(), B10: "stray-character" },
    });
    const build = getFirstEditsBuild("51caf26d-83bf-45a9-bc80-010d353277db");
    const edits = build({ ...makeCtx(state, "enemy"), isTutorial: true });
    expect(edits).toEqual([expect.objectContaining({
      kind: "CREATE_FIGMENT",
      destination: { side: "enemy", zone: "backRank", slotId: "B4" },
    })]);
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
      playerBackRank: { ...emptyBackRankSlots(), B0: "ally1", B1: "ally2" },
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
    playerBackRank: { ...emptyBackRankSlots(), B0: ALLY_ID },
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

  const ctx: import("./effect-step").StepContext = {
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

// ---------------------------------------------------------------------------
// Tests: interactive-prompt entries — representative per shape
// ---------------------------------------------------------------------------

// Helper: extract the first prompt step from a script
function getFirstPromptStep(
  scriptId: string,
): import("./effect-step").EffectPrompt {
  const script = DREAMWELL_EFFECTS[scriptId];
  if (script === undefined) throw new Error(`no script for ${scriptId}`);
  const step = script.steps.find((s) => s.kind === "prompt");
  if (step === undefined || step.kind !== "prompt") throw new Error(`no prompt step for ${scriptId}`);
  return step.prompt;
}

// Leaf Light Canopy — return any void card to hand (wrong destination zone)
describe("Leaf Light Canopy (2b23a60c) — return void card to hand", () => {
  const UUID = "2b23a60c-209c-4c75-b63c-b7f73b2e1a56";

  it("candidates = player void ids", () => {
    const state = makeState({ playerVoid: ["v1", "v2"] });
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "pick-cards") throw new Error("expected pick-cards");
    expect(prompt.candidates(makeCtx(state))).toEqual(["v1", "v2"]);
  });

  it("resolve(id) → MOVE_CARD_TO_ZONE to hand on player side", () => {
    const state = makeState({ playerVoid: ["v1"] });
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "pick-cards") throw new Error("expected pick-cards");
    const edits = prompt.resolve(["v1"], makeCtx(state));
    expect(edits).toEqual([
      { kind: "MOVE_CARD_TO_ZONE", battleCardId: "v1", destination: { side: "player", zone: "hand" } },
    ]);
  });

  it("resolve([]) → empty when no selection", () => {
    const state = makeState();
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "pick-cards") throw new Error("expected pick-cards");
    expect(prompt.resolve([], makeCtx(state))).toEqual([]);
  });
});

// Verdant Hollow — only events in void (missing type filter)
describe("Verdant Hollow (a0fbcbd9) — only events in void", () => {
  const UUID = "a0fbcbd9-96ee-4392-add7-e1d436f99553";

  it("candidates excludes characters, includes only events", () => {
    const state = makeState({
      playerVoid: ["c1", "e1"],
      cardInstances: {
        c1: makeCharacter("c1", "player", 2),
        e1: makeEvent("e1", "player", 2),
      },
    });
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "pick-cards") throw new Error("expected pick-cards");
    expect(prompt.candidates(makeCtx(state))).toEqual(["e1"]);
  });

  it("resolve returns MOVE to hand", () => {
    const state = makeState({ playerVoid: ["e1"], cardInstances: { e1: makeEvent("e1", "player", 1) } });
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "pick-cards") throw new Error("expected pick-cards");
    const edits = prompt.resolve(["e1"], makeCtx(state));
    expect(edits).toEqual([
      { kind: "MOVE_CARD_TO_ZONE", battleCardId: "e1", destination: { side: "player", zone: "hand" } },
    ]);
  });
});

// Silent Winter — banish an enemy; self-targeting bug class
describe("Silent Winter (9954cede) — banish enemy character", () => {
  const UUID = "9954cede-8a16-4053-b6e9-da745f4540f5";

  it("candidates = opponent's in-play characters only", () => {
    const state = makeState({
      enemyBackRank: { ...emptyBackRankSlots(), B0: "ec1" },
      playerBackRank: { ...emptyBackRankSlots(), B0: "pc1" },
      cardInstances: {
        ec1: makeCharacter("ec1", "enemy", 2),
        pc1: makeCharacter("pc1", "player", 2),
      },
    });
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "pick-cards") throw new Error("expected pick-cards");
    const cands = prompt.candidates(makeCtx(state, "player"));
    expect(cands).toContain("ec1");
    expect(cands).not.toContain("pc1");
  });

  it("persists the return metadata before banishing to the owner's zone", () => {
    const state = makeState({
      enemyBackRank: { ...emptyBackRankSlots(), B0: "ec1" },
      cardInstances: { ec1: makeCharacter("ec1", "enemy", 2) },
    });
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "pick-cards") throw new Error("expected pick-cards");
    const edits = prompt.resolve(["ec1"], makeCtx(state, "player"));
    expect(edits).toEqual([
      expect.objectContaining({ kind: "SET_CARD_STATUS", battleCardId: "ec1" }),
      { kind: "MOVE_CARD_TO_ZONE", battleCardId: "ec1", destination: { side: "enemy", zone: "banished" } },
    ]);
  });
});

// Astral Interface — two-step: draw then discard
describe("Astral Interface (ee1ef770) — draw then discard", () => {
  const UUID = "ee1ef770-29ea-4a63-a1f9-7e97b5b8870d";

  it("step 0 is edits: draw 1", () => {
    const script = DREAMWELL_EFFECTS[UUID];
    expect(script).toBeDefined();
    if (script === undefined) throw new Error("no script");
    const step0 = script.steps[0];
    expect(step0?.kind).toBe("edits");
    if (step0?.kind !== "edits") throw new Error();
    const edits = step0.build(makeCtx(makeState()));
    expect(edits).toEqual([{ kind: "DRAW_CARD", side: "player" }]);
  });

  it("step 1 is prompt: pick-cards from hand", () => {
    const script = DREAMWELL_EFFECTS[UUID];
    if (script === undefined) throw new Error("no script");
    const step1 = script.steps[1];
    expect(step1?.kind).toBe("prompt");
    if (step1?.kind !== "prompt") throw new Error();
    expect(step1.prompt.kind).toBe("pick-cards");
  });

  it("step 1 candidates = player hand", () => {
    const state = makeState({ playerHand: ["h1", "h2"] });
    const script = DREAMWELL_EFFECTS[UUID];
    if (script === undefined) throw new Error("no script");
    const step1 = script.steps[1];
    if (step1?.kind !== "prompt" || step1.prompt.kind !== "pick-cards") throw new Error();
    expect(step1.prompt.candidates(makeCtx(state))).toEqual(["h1", "h2"]);
  });

  it("step 1 resolve(id) → DISCARD_CARD", () => {
    const state = makeState({ playerHand: ["h1"] });
    const script = DREAMWELL_EFFECTS[UUID];
    if (script === undefined) throw new Error("no script");
    const step1 = script.steps[1];
    if (step1?.kind !== "prompt" || step1.prompt.kind !== "pick-cards") throw new Error();
    const edits = step1.prompt.resolve(["h1"], makeCtx(state));
    expect(edits).toEqual([{ kind: "DISCARD_CARD", battleCardId: "h1" }]);
  });
});

// The Crossroads — choice: draw / gain 2● (swapped option mapping)
describe("The Crossroads (af2ef62f) — choice draw / gain energy", () => {
  const UUID = "af2ef62f-d31b-4544-a2b0-f5aab03c2d7c";

  it("is a choice prompt with 2 options, draw first", () => {
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "choice") throw new Error("expected choice");
    expect(prompt.options).toHaveLength(2);
    const opt0 = prompt.options[0];
    const opt1 = prompt.options[1];
    if (opt0 === undefined || opt1 === undefined) throw new Error("missing options");
    expect(opt0.label.id).toBe("battle-prompt-draw-card");
    expect(opt1.label.id).toBe("battle-prompt-gain-energy");
  });

  it("options[0].build → DRAW_CARD", () => {
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "choice") throw new Error();
    const opt0 = prompt.options[0];
    if (opt0 === undefined) throw new Error("missing option 0");
    const edits = opt0.build(makeCtx(makeState()));
    expect(edits).toEqual([{ kind: "DRAW_CARD", side: "player" }]);
  });

  it("options[1].build → ADJUST_CURRENT_ENERGY +2", () => {
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "choice") throw new Error();
    const opt1 = prompt.options[1];
    if (opt1 === undefined) throw new Error("missing option 1");
    const edits = opt1.build(makeCtx(makeState()));
    expect(edits).toEqual([{ kind: "ADJUST_CURRENT_ENERGY", side: "player", amount: 2 }]);
  });
});

// The Bastion — confirm → pick → abandon (confirm dropping payload)
describe("The Bastion (20be0fdd) — confirm → abandon ally → draw 2", () => {
  const UUID = "20be0fdd-d691-40a9-b4f8-15689ea7ebaa";

  it("outer prompt is confirm with non-empty onYes", () => {
    const prompt = getFirstPromptStep(UUID);
    expect(prompt.kind).toBe("confirm");
    if (prompt.kind !== "confirm") throw new Error();
    expect(prompt.onYes.length).toBeGreaterThan(0);
  });

  it("onYes[0] is a pick-cards prompt", () => {
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "confirm") throw new Error();
    const inner = prompt.onYes[0];
    expect(inner?.kind).toBe("prompt");
    if (inner?.kind !== "prompt") throw new Error();
    expect(inner.prompt.kind).toBe("pick-cards");
  });

  it("onYes pick resolve → ABANDON edit", () => {
    const state = makeState({
      playerBackRank: { ...emptyBackRankSlots(), B0: "ally1" },
      cardInstances: { ally1: makeCharacter("ally1", "player", 2) },
    });
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "confirm") throw new Error();
    const inner = prompt.onYes[0];
    if (inner?.kind !== "prompt" || inner.prompt.kind !== "pick-cards") throw new Error();
    const edits = inner.prompt.resolve(["ally1"], makeCtx(state));
    expect(edits).toEqual([{ kind: "ABANDON", battleCardId: "ally1" }]);
  });

  it("onYes also contains a draw-2 edits step", () => {
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "confirm") throw new Error();
    const drawStep = prompt.onYes.find((s) => s.kind === "edits");
    expect(drawStep).toBeDefined();
    if (drawStep?.kind !== "edits") throw new Error();
    const edits = drawStep.build(makeCtx(makeState()));
    expect(edits).toEqual([
      { kind: "DRAW_CARD", side: "player" },
      { kind: "DRAW_CARD", side: "player" },
    ]);
  });
});

// Shining Beacon — pick 1 of top 2; other goes to bottom (forgetting "other" half)
describe("Shining Beacon (3a4293da) — top 2, pick 1 to hand other to bottom", () => {
  const UUID = "3a4293da-55a1-4094-898a-df402ffa1c92";

  it("candidates = top 2 of player deck", () => {
    const state = makeState({ playerDeck: ["top1", "top2", "top3"] });
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "pick-cards") throw new Error();
    expect(prompt.candidates(makeCtx(state))).toEqual(["top1", "top2"]);
  });

  it("resolve(chosen) → MOVE chosen to hand AND MOVE other to deck bottom", () => {
    const state = makeState({ playerDeck: ["top1", "top2", "top3"] });
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "pick-cards") throw new Error();
    const edits = prompt.resolve(["top1"], makeCtx(state));
    expect(edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "top1",
      destination: { side: "player", zone: "hand" },
    });
    expect(edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "top2",
      destination: { side: "player", zone: "deck", position: "bottom" },
    });
    expect(edits).toHaveLength(2);
  });

  it("when the other card is chosen, the first goes to bottom", () => {
    const state = makeState({ playerDeck: ["top1", "top2", "top3"] });
    const prompt = getFirstPromptStep(UUID);
    if (prompt.kind !== "pick-cards") throw new Error();
    const edits = prompt.resolve(["top2"], makeCtx(state));
    expect(edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "top2",
      destination: { side: "player", zone: "hand" },
    });
    expect(edits).toContainEqual({
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: "top1",
      destination: { side: "player", zone: "deck", position: "bottom" },
    });
  });
});

// Fortune's Wheel — discard hand then draw that many (atomicity and ordering)
describe("Fortune's Wheel (446095b1) — discard hand then draw same count", () => {
  const UUID = "446095b1-ec4d-40d7-8eed-a8221d339ea2";
  const N = 3;
  const handIds = ["fw-hand-1", "fw-hand-2", "fw-hand-3"];

  it("confirm onYes edits step: exactly N DISCARD_CARD edits followed by exactly N DRAW_CARD edits", () => {
    const state = makeState({
      playerHand: handIds,
      cardInstances: Object.fromEntries(handIds.map((id) => [id, makeCharacter(id, "player", 2)])),
    });
    const script = DREAMWELL_EFFECTS[UUID];
    if (script === undefined) throw new Error(`no script for ${UUID}`);
    const step0 = script.steps[0];
    if (step0?.kind !== "prompt") throw new Error("expected prompt step");
    const prompt = step0.prompt;
    if (prompt.kind !== "confirm") throw new Error("expected confirm prompt");
    const onYesEdits = prompt.onYes.find((s) => s.kind === "edits");
    if (onYesEdits?.kind !== "edits") throw new Error("expected edits in onYes");

    const edits = onYesEdits.build(makeCtx(state, "player"));

    // First N edits are DISCARD_CARD, one per hand id in order
    expect(edits.slice(0, N)).toEqual(
      handIds.map((id) => ({ kind: "DISCARD_CARD", battleCardId: id })),
    );
    // Next N edits are DRAW_CARD for the active side
    expect(edits.slice(N)).toEqual(
      Array.from({ length: N }, () => ({ kind: "DRAW_CARD", side: "player" })),
    );
    // Total length = 2 * N
    expect(edits).toHaveLength(2 * N);
  });
});

// ---------------------------------------------------------------------------
// Tests: property test — all prompt scripts (recurse into confirm.onYes)
// ---------------------------------------------------------------------------

describe("property test: all prompt scripts run without error on rich fixture", () => {
  const HAND_CARD_ID = "prop-hand-1";
  const ALLY_ID = "prop-ally-1";
  const P_VOID_CHAR_ID = "prop-pvoid-char-1";
  const P_VOID_EVENT_ID = "prop-pvoid-event-1";
  const E_VOID_CHAR_ID = "prop-evoid-char-1";
  const ENEMY_CHAR_ID = "prop-enemy-play-1";

  const richState: BattleMutableState = makeState({
    playerHand: [HAND_CARD_ID],
    playerVoid: [P_VOID_CHAR_ID, P_VOID_EVENT_ID],
    playerDeck: ["deck-top-1", "deck-top-2", "deck-top-3"],
    playerBackRank: { ...emptyBackRankSlots(), B0: ALLY_ID },
    enemyHand: [],
    enemyVoid: [E_VOID_CHAR_ID],
    enemyBackRank: { ...emptyBackRankSlots(), B0: ENEMY_CHAR_ID },
    cardInstances: {
      [HAND_CARD_ID]: makeCharacter(HAND_CARD_ID, "player", 2),
      [ALLY_ID]: makeCharacter(ALLY_ID, "player", 2),
      [P_VOID_CHAR_ID]: makeCharacter(P_VOID_CHAR_ID, "player", 2),
      [P_VOID_EVENT_ID]: makeEvent(P_VOID_EVENT_ID, "player", 1),
      [E_VOID_CHAR_ID]: makeCharacter(E_VOID_CHAR_ID, "enemy", 3),
      [ENEMY_CHAR_ID]: makeCharacter(ENEMY_CHAR_ID, "enemy", 2),
    },
  });

  const ctx: import("./effect-step").StepContext = {
    side: "player",
    state: richState,
    random: () => 0,
    nowMs: 42000,
  };

  function walkSteps(steps: import("./effect-step").EffectStep[], label: string): void {
    for (const step of steps) {
      if (step.kind === "edits") {
        expect(() => step.build(ctx)).not.toThrow();
      } else {
        // prompt step
        const prompt = step.prompt;
        if (prompt.kind === "pick-cards") {
          let cands: string[];
          expect(() => { cands = prompt.candidates(ctx); }).not.toThrow();
          // resolve with as many candidates as count (or fewer if not enough)
          const chosen = (cands! ?? []).slice(0, prompt.count);
          expect(() => prompt.resolve(chosen, ctx)).not.toThrow();
          // resolve with empty is also safe (optional or no candidates)
          expect(() => prompt.resolve([], ctx)).not.toThrow();
        } else if (prompt.kind === "choice") {
          for (const opt of prompt.options) {
            expect(() => opt.build(ctx)).not.toThrow();
          }
        } else if (prompt.kind === "confirm") {
          walkSteps(prompt.onYes, `${label} → onYes`);
        }
        // foresee: no build function to test
      }
    }
  }

  for (const [id, script] of Object.entries(DREAMWELL_EFFECTS)) {
    it(`prompt script ${id} resolves without error`, () => {
      walkSteps(script.steps, id);
    });
  }
});
