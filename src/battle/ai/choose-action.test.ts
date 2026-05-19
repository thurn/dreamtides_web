import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import {
  chooseAiAction,
  computeLaneChoiceBucket,
  evaluatePredictedJudgmentDifferential,
  shouldPreferMoveChoice,
  shouldPreferPlayChoice,
} from "./choose-action";
import type { BattleAiDecision } from "./choose-action";

describe("chooseAiAction", () => {
  it("prioritizes an affordable character play before later-stage actions", () => {
    const state = createTestBattleState();
    const affordableCharacter = ensureEnemyCardInHand(state, "character", 5);
    const affordableEvent = ensureEnemyCardInHand(state, "event", 5);

    state.sides.enemy.currentEnergy = 5;
    state.sides.enemy.hand = [
      affordableEvent,
      affordableCharacter,
      ...state.sides.enemy.hand.filter(
        (battleCardId) =>
          battleCardId !== affordableCharacter && battleCardId !== affordableEvent,
      ),
    ];

    const decision = chooseAiAction(state, {
      hasPlayedCharacter: false,
      hasPlayedNonCharacter: false,
      hasRepositioned: false,
    });

    expect(decision.type).toBe("PLAY_CARD");
    if (decision.type !== "PLAY_CARD") {
      throw new Error("Expected AI to play a character");
    }

    expect(decision.trace.stage).toBe("character");
    const playedCardKind =
      state.cardInstances[decision.battleCardId]?.definition.battleCardKind;
    expect(playedCardKind).toBe("character");
    expect(decision.battleCardId).not.toBe(affordableEvent);
    expect(decision.target?.zone).toBe("reserve");
  });

  it("ends turn when nothing affordable or improving exists", () => {
    const state = createTestBattleState();

    state.sides.enemy.currentEnergy = 0;

    const decision = chooseAiAction(state, {
      hasPlayedCharacter: false,
      hasPlayedNonCharacter: false,
      hasRepositioned: false,
    });

    expect(decision.type).toBe("END_TURN");
  });

  it("takes one improving reposition before an affordable non-character play", () => {
    const state = createTestBattleState();
    const reserveCharacter = moveEnemyHandCardToSlot(state, "character", "reserve", "R1");
    const affordableEvent = ensureEnemyCardInHand(state, "event", 5);

    state.activeSide = "enemy";
    state.sides.enemy.currentEnergy = 5;

    const decision = chooseAiAction(state, {
      hasPlayedCharacter: true,
      hasPlayedNonCharacter: false,
      hasRepositioned: false,
    });

    expect(evaluatePredictedJudgmentDifferential(state)).toBe(0);
    expect(decision.type).toBe("MOVE_CARD");
    if (decision.type !== "MOVE_CARD") {
      throw new Error("Expected improving reposition");
    }

    expect(decision.trace.stage).toBe("reposition");
    expect(decision.battleCardId).toBe(reserveCharacter);
    expect(decision.target.zone).toBe("deployed");
    expect(decision.trace.heuristicScoreAfter).toBeGreaterThan(
      decision.trace.heuristicScoreBefore ?? Number.NEGATIVE_INFINITY,
    );
    expect(state.sides.enemy.hand).toContain(affordableEvent);
  });

  it("uses effective spark (not printed) for lane-bucket trade evaluation (E-8, bug-005)", () => {
    const state = createTestBattleState();
    const attacker = ensureEnemyCardInHand(state, "character");
    // Place a player blocker whose printed spark is low but whose effective
    // spark (printedSpark + sparkDelta) outmatches the attacker. If the AI
    // still used printedSpark it would (wrongly) pick bucket 1 (favorable)
    // or 2 (equal) based on the printed comparison.
    const blockerCardId = Object.keys(state.cardInstances).find(
      (cardId) =>
        state.cardInstances[cardId]?.definition.battleCardKind === "character" &&
        cardId !== attacker &&
        state.sides.player.hand.includes(cardId),
    );
    if (blockerCardId === undefined) {
      throw new Error("Missing player character to seed blocker");
    }
    state.sides.player.hand = state.sides.player.hand.filter((cardId) => cardId !== blockerCardId);
    state.sides.player.deployed.D0 = blockerCardId;
    // Make blocker printed=1, delta=+99 (effective=100); make attacker printed=3, delta=0.
    const attackerDef = state.cardInstances[attacker].definition;
    state.cardInstances[attacker].sparkDelta = 3 - attackerDef.printedSpark;
    const blockerDef = state.cardInstances[blockerCardId].definition;
    state.cardInstances[blockerCardId].sparkDelta = 100 - blockerDef.printedSpark;

    const candidate: Extract<BattleAiDecision, { type: "PLAY_CARD" }> = {
      type: "PLAY_CARD",
      battleCardId: attacker,
      target: { side: "enemy", zone: "deployed", slotId: "D0" },
      trace: {
        stage: "character",
        choice: "PLAY_CARD",
        battleCardId: attacker,
        cardName: attackerDef.name,
        sourceHandIndex: 0,
        sourceSlotId: null,
        targetSlotId: "D0",
        heuristicScoreBefore: 0,
        heuristicScoreAfter: 0,
      },
    };

    // Attacker effective spark = 3; blocker effective spark = 100. That's an
    // unfavorable trade → bucket 3. If the AI reverted to printed spark the
    // bucket would be 1 (favorable trade) because printed comparison favours
    // the (now buffed) attacker.
    const attackerEffective = 3;
    expect(computeLaneChoiceBucket(state, candidate, attackerEffective)).toBe(3);
  });

  it("requires a strict heuristic improvement before choosing a reposition", () => {
    const state = createTestBattleState();
    const deployedCharacter = moveEnemyHandCardToSlot(state, "character", "deployed", "D1");
    const affordableEvent = ensureEnemyCardInHand(state, "event", 5);

    state.sides.enemy.currentEnergy = 5;

    const decision = chooseAiAction(state, {
      hasPlayedCharacter: true,
      hasPlayedNonCharacter: false,
      hasRepositioned: false,
    });

    expect(deployedCharacter).not.toBe(affordableEvent);
    expect(decision.type).toBe("PLAY_CARD");
    if (decision.type !== "PLAY_CARD") {
      throw new Error("Expected non-character follow-up");
    }

    expect(decision.trace.stage).toBe("nonCharacter");
    expect(decision.battleCardId).toBe(affordableEvent);
  });
});

describe("evaluatePredictedJudgmentDifferential", () => {
  it("returns 0 on an empty battlefield", () => {
    const state = createTestBattleState();
    expect(evaluatePredictedJudgmentDifferential(state)).toBe(0);
  });

  it("is positive when the enemy has spark advantage on the board", () => {
    const state = createTestBattleState();
    const enemyCharacter = moveEnemyHandCardToSlot(state, "character", "deployed", "D1");
    const enemyDef = state.cardInstances[enemyCharacter].definition;
    state.activeSide = "enemy";
    state.cardInstances[enemyCharacter].sparkDelta = 10 - enemyDef.printedSpark;

    expect(evaluatePredictedJudgmentDifferential(state)).toBeGreaterThan(0);
  });
});

describe("shouldPreferPlayChoice (J-5 play-order tiebreakers)", () => {
  it("prefers the higher energy-cost play first", () => {
    const state = createTestBattleState();
    const [cheap, pricey] = seedTwoEnemyCharactersInHand(state);
    // Force distinct costs.
    state.cardInstances[cheap].definition = {
      ...state.cardInstances[cheap].definition,
      energyCost: 1,
    };
    state.cardInstances[pricey].definition = {
      ...state.cardInstances[pricey].definition,
      energyCost: 5,
    };

    const cheapCandidate = makePlayCandidate(cheap, 0, "D0");
    const priceyCandidate = makePlayCandidate(pricey, 1, "D1");

    expect(shouldPreferPlayChoice(priceyCandidate, cheapCandidate, state)).toBe(true);
    expect(shouldPreferPlayChoice(cheapCandidate, priceyCandidate, state)).toBe(false);
  });

  it("prefers character before event at equal cost", () => {
    const state = createTestBattleState();
    const character = ensureEnemyCardInHand(state, "character");
    const event = ensureEnemyCardInHand(state, "event");
    state.cardInstances[character].definition = {
      ...state.cardInstances[character].definition,
      energyCost: 3,
    };
    state.cardInstances[event].definition = {
      ...state.cardInstances[event].definition,
      energyCost: 3,
    };

    const characterCandidate = makePlayCandidate(character, 0, "D0");
    const eventCandidate = makePlayCandidate(event, 1);

    expect(shouldPreferPlayChoice(characterCandidate, eventCandidate, state)).toBe(true);
    expect(shouldPreferPlayChoice(eventCandidate, characterCandidate, state)).toBe(false);
  });

  it("falls back to stable hand order when cost / kind / printed spark tie", () => {
    const state = createTestBattleState();
    const [firstId, secondId] = seedTwoEnemyCharactersInHand(state);
    const commonCost = 2;
    const commonSpark = 3;
    state.cardInstances[firstId].definition = {
      ...state.cardInstances[firstId].definition,
      energyCost: commonCost,
      printedSpark: commonSpark,
    };
    state.cardInstances[secondId].definition = {
      ...state.cardInstances[secondId].definition,
      energyCost: commonCost,
      printedSpark: commonSpark,
    };

    const earlyCandidate = makePlayCandidate(firstId, 0, "D0");
    const lateCandidate = makePlayCandidate(secondId, 1, "D0");

    expect(shouldPreferPlayChoice(earlyCandidate, lateCandidate, state)).toBe(true);
    expect(shouldPreferPlayChoice(lateCandidate, earlyCandidate, state)).toBe(false);
  });
});

describe("computeLaneChoiceBucket (J-6 lane-choice tiebreakers)", () => {
  function makeCandidate(battleCardId: string, slotId: "D0" | "D1"): Extract<
    BattleAiDecision,
    { type: "PLAY_CARD" }
  > {
    return {
      type: "PLAY_CARD",
      battleCardId,
      target: { side: "enemy", zone: "deployed", slotId },
      trace: {
        stage: "character",
        choice: "PLAY_CARD",
        battleCardId,
        cardName: "TestCard",
        sourceHandIndex: 0,
        sourceSlotId: null,
        targetSlotId: slotId,
        heuristicScoreBefore: 0,
        heuristicScoreAfter: 1,
      },
    };
  }

  it("assigns bucket 0 for open lane with positive spark", () => {
    const state = createTestBattleState();
    const attacker = ensureEnemyCardInHand(state, "character");
    const candidate = makeCandidate(attacker, "D0");

    expect(computeLaneChoiceBucket(state, candidate, 3)).toBe(0);
  });

  it("assigns bucket 1 for a favorable trade", () => {
    const state = createTestBattleState();
    const attacker = ensureEnemyCardInHand(state, "character");
    const blocker = seedPlayerBlocker(state, "D0", 2);
    const candidate = makeCandidate(attacker, "D0");

    expect(blocker).toBeTruthy();
    expect(computeLaneChoiceBucket(state, candidate, 5)).toBe(1);
  });

  it("assigns bucket 2 for an equal trade", () => {
    const state = createTestBattleState();
    const attacker = ensureEnemyCardInHand(state, "character");
    seedPlayerBlocker(state, "D0", 4);
    const candidate = makeCandidate(attacker, "D0");

    expect(computeLaneChoiceBucket(state, candidate, 4)).toBe(2);
  });

  it("assigns bucket 3 for an unfavorable trade", () => {
    const state = createTestBattleState();
    const attacker = ensureEnemyCardInHand(state, "character");
    seedPlayerBlocker(state, "D0", 10);
    const candidate = makeCandidate(attacker, "D0");

    expect(computeLaneChoiceBucket(state, candidate, 2)).toBe(3);
  });

  it("assigns bucket 3 when the target is not a deployed slot", () => {
    const state = createTestBattleState();
    const attacker = ensureEnemyCardInHand(state, "character");
    const candidate: Extract<BattleAiDecision, { type: "PLAY_CARD" }> = {
      type: "PLAY_CARD",
      battleCardId: attacker,
      target: { side: "enemy", zone: "reserve", slotId: "R0" },
      trace: {
        stage: "character",
        choice: "PLAY_CARD",
        battleCardId: attacker,
        cardName: "X",
        sourceHandIndex: 0,
        sourceSlotId: null,
        targetSlotId: "R0",
        heuristicScoreBefore: 0,
        heuristicScoreAfter: 1,
      },
    };

    expect(computeLaneChoiceBucket(state, candidate, 5)).toBe(3);
  });
});

describe("shouldPreferMoveChoice (J-9 cycle guard via tiebreaker)", () => {
  it("returns true when the incumbent is not a MOVE_CARD", () => {
    const candidate: Extract<BattleAiDecision, { type: "MOVE_CARD" }> = makeMoveCandidate(
      "battle-card-1",
      "R0",
      "D0",
    );

    expect(shouldPreferMoveChoice(candidate, null)).toBe(true);
  });

  it("prefers the lexicographically earlier source slot", () => {
    const earlier = makeMoveCandidate("battle-card-1", "R0", "D1");
    const later = makeMoveCandidate("battle-card-2", "R2", "D1");

    expect(shouldPreferMoveChoice(earlier, later)).toBe(true);
    expect(shouldPreferMoveChoice(later, earlier)).toBe(false);
  });

  it("breaks ties via target slot, then battle-card id", () => {
    const firstTarget = makeMoveCandidate("battle-card-alpha", "R0", "D0");
    const secondTarget = makeMoveCandidate("battle-card-beta", "R0", "D1");
    expect(shouldPreferMoveChoice(firstTarget, secondTarget)).toBe(true);

    const sharedSource = makeMoveCandidate("battle-card-alpha", "R0", "D0");
    const alternateId = makeMoveCandidate("battle-card-beta", "R0", "D0");
    expect(shouldPreferMoveChoice(sharedSource, alternateId)).toBe(true);
  });
});

describe("chooseAiAction event-play reevaluation (J-10 / J-11)", () => {
  it("accepts a reserve character play when only reserve slots are open", () => {
    const state = createTestBattleState();
    const attacker = ensureEnemyCardInHand(state, "character", 1);
    state.sides.enemy.currentEnergy = 5;
    // Fill every deployed slot for both sides so the only open targets are
    // reserve slots. Reserve plays are setup actions under the revised flow.
    const deployedIds = Object.keys(state.cardInstances)
      .filter((cardId) =>
        state.cardInstances[cardId]?.definition.battleCardKind === "character"
        && cardId !== attacker,
      )
      .slice(0, 8);
    const slots: Array<["player" | "enemy", "D0" | "D1" | "D2" | "D3"]> = [
      ["player", "D0"], ["player", "D1"], ["player", "D2"], ["player", "D3"],
      ["enemy", "D0"], ["enemy", "D1"], ["enemy", "D2"], ["enemy", "D3"],
    ];
    for (let index = 0; index < slots.length; index += 1) {
      const cardId = deployedIds[index];
      if (cardId === undefined) break;
      const [side, slotId] = slots[index];
      state.sides[side].hand = state.sides[side].hand.filter((id) => id !== cardId);
      state.sides[side].deck = state.sides[side].deck.filter((id) => id !== cardId);
      state.sides[side].deployed[slotId] = cardId;
    }

    // Remove all events from hand so the character branch is the only
    // affordable option.
    state.sides.enemy.hand = [attacker];

    const decision = chooseAiAction(state, {
      hasPlayedCharacter: false,
      hasPlayedNonCharacter: false,
      hasRepositioned: false,
    });

    expect(decision.type).toBe("PLAY_CARD");
    if (decision.type !== "PLAY_CARD") throw new Error("Expected reserve character play");
    expect(decision.battleCardId).toBe(attacker);
    expect(decision.target?.zone).toBe("reserve");
  });

  it("plays exactly one event when only an event is affordable (J-10)", () => {
    const state = createTestBattleState();
    const event = ensureEnemyCardInHand(state, "event", 3);
    state.sides.enemy.currentEnergy = 3;
    state.sides.enemy.hand = [event];

    const first = chooseAiAction(state, {
      hasPlayedCharacter: false,
      hasPlayedNonCharacter: false,
      hasRepositioned: false,
    });
    expect(first.type).toBe("PLAY_CARD");
    if (first.type !== "PLAY_CARD") throw new Error("Expected event play");
    expect(first.trace.stage).toBe("nonCharacter");

    // Simulate progress after playing one event; next choose call should
    // end the turn (J-11: no re-entry once a non-character has fired).
    const next = chooseAiAction(state, {
      hasPlayedCharacter: false,
      hasPlayedNonCharacter: true,
      hasRepositioned: false,
    });
    expect(next.type).toBe("END_TURN");
  });
});

function makePlayCandidate(
  battleCardId: string,
  sourceHandIndex: number,
  slotId: "D0" | "D1" | undefined = undefined,
): Extract<BattleAiDecision, { type: "PLAY_CARD" }> {
  return {
    type: "PLAY_CARD",
    battleCardId,
    target: slotId === undefined
      ? undefined
      : { side: "enemy", zone: "deployed", slotId },
    trace: {
      stage: slotId === undefined ? "nonCharacter" : "character",
      choice: "PLAY_CARD",
      battleCardId,
      cardName: "TestCard",
      sourceHandIndex,
      sourceSlotId: null,
      targetSlotId: slotId ?? null,
      heuristicScoreBefore: 0,
      heuristicScoreAfter: 1,
    },
  };
}

function makeMoveCandidate(
  battleCardId: string,
  sourceSlotId: "R0" | "R1" | "R2" | "D0" | "D1",
  targetSlotId: "D0" | "D1" | "D2",
): Extract<BattleAiDecision, { type: "MOVE_CARD" }> {
  const targetZone: "reserve" | "deployed" = targetSlotId.startsWith("R") ? "reserve" : "deployed";
  return {
    type: "MOVE_CARD",
    battleCardId,
    target: {
      side: "enemy",
      zone: targetZone,
      slotId: targetSlotId,
    },
    trace: {
      stage: "reposition",
      choice: "MOVE_CARD",
      battleCardId,
      cardName: "TestCard",
      sourceHandIndex: null,
      sourceSlotId,
      targetSlotId,
      heuristicScoreBefore: 0,
      heuristicScoreAfter: 1,
    },
  };
}

function seedTwoEnemyCharactersInHand(
  state: ReturnType<typeof createTestBattleState>,
): [string, string] {
  const allCharacterIds = Object.keys(state.cardInstances).filter(
    (cardId) => state.cardInstances[cardId]?.definition.battleCardKind === "character",
  );
  const ownedByEnemy = allCharacterIds.filter((cardId) =>
    state.cardInstances[cardId]?.owner === "enemy",
  );
  if (ownedByEnemy.length < 2) {
    throw new Error("Test state needs at least two enemy character cards");
  }
  const [firstId, secondId] = ownedByEnemy;
  // Ensure both cards are in the enemy's hand and nowhere else.
  for (const cardId of [firstId, secondId]) {
    state.sides.enemy.deck = state.sides.enemy.deck.filter((id) => id !== cardId);
    state.sides.enemy.hand = state.sides.enemy.hand.filter((id) => id !== cardId);
    for (const slotId of Object.keys(state.sides.enemy.deployed)) {
      if (state.sides.enemy.deployed[slotId as "D0"] === cardId) {
        state.sides.enemy.deployed[slotId as "D0"] = null;
      }
    }
    for (const slotId of Object.keys(state.sides.enemy.reserve)) {
      if (state.sides.enemy.reserve[slotId as "R0"] === cardId) {
        state.sides.enemy.reserve[slotId as "R0"] = null;
      }
    }
  }
  state.sides.enemy.hand.unshift(secondId);
  state.sides.enemy.hand.unshift(firstId);
  return [firstId, secondId];
}

function seedPlayerBlocker(
  state: ReturnType<typeof createTestBattleState>,
  slotId: "D0" | "D1",
  effectiveSpark: number,
): string | null {
  const blockerCardId = Object.keys(state.cardInstances).find(
    (cardId) =>
      state.cardInstances[cardId]?.definition.battleCardKind === "character"
      && state.sides.player.hand.includes(cardId),
  );
  if (blockerCardId === undefined) {
    return null;
  }
  state.sides.player.hand = state.sides.player.hand.filter(
    (cardId) => cardId !== blockerCardId,
  );
  state.sides.player.deployed[slotId] = blockerCardId;
  const blockerDef = state.cardInstances[blockerCardId].definition;
  state.cardInstances[blockerCardId].sparkDelta = effectiveSpark - blockerDef.printedSpark;
  return blockerCardId;
}

function createTestBattleState() {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });

  return createInitialBattleState(battleInit);
}

function ensureEnemyCardInHand(
  state: ReturnType<typeof createTestBattleState>,
  kind: "character" | "event",
  maxEnergyCost = Number.POSITIVE_INFINITY,
): string {
  const existing = state.sides.enemy.hand.find(
    (cardId) =>
      state.cardInstances[cardId]?.definition.battleCardKind === kind
      && (state.cardInstances[cardId]?.definition.energyCost ?? Number.POSITIVE_INFINITY)
        <= maxEnergyCost,
  );

  if (existing !== undefined) {
    return existing;
  }

  const fromDeck = state.sides.enemy.deck.find(
    (cardId) =>
      state.cardInstances[cardId]?.definition.battleCardKind === kind
      && (state.cardInstances[cardId]?.definition.energyCost ?? Number.POSITIVE_INFINITY)
        <= maxEnergyCost,
  );

  if (fromDeck === undefined) {
    throw new Error(`Missing enemy ${kind} in deck`);
  }

  state.sides.enemy.deck = state.sides.enemy.deck.filter((cardId) => cardId !== fromDeck);
  state.sides.enemy.hand.push(fromDeck);
  return fromDeck;
}

function moveEnemyHandCardToSlot(
  state: ReturnType<typeof createTestBattleState>,
  kind: "character" | "event",
  zone: "reserve",
  slotId: "R1",
): string;
function moveEnemyHandCardToSlot(
  state: ReturnType<typeof createTestBattleState>,
  kind: "character" | "event",
  zone: "deployed",
  slotId: "D1",
): string;
function moveEnemyHandCardToSlot(
  state: ReturnType<typeof createTestBattleState>,
  kind: "character" | "event",
  zone: "reserve" | "deployed",
  slotId: "R1" | "D1",
): string {
  const battleCardId = ensureEnemyCardInHand(state, kind);

  state.sides.enemy.hand = state.sides.enemy.hand.filter((cardId) => cardId !== battleCardId);
  if (zone === "reserve") {
    state.sides.enemy.reserve[slotId as "R1"] = battleCardId;
  } else {
    state.sides.enemy.deployed[slotId as "D1"] = battleCardId;
  }

  return battleCardId;
}
