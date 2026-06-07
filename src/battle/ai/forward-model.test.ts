import { describe, expect, it } from "vitest";
import { cloneForwardModel, effectiveSpark, forwardModelFromState } from "./forward-model";
import type { ForwardModel } from "./forward-model";
import { allocateBattleCardInstance } from "../state/create-initial-state";
import { FRONT_RANK_SLOT_IDS, BACK_RANK_SLOT_IDS } from "../types";
import type {
  BattleCardProvenance,
  BattleDeckCardDefinition,
  BattleMutableState,
  BattleSide,
  FrontRankSlotId,
  BackRankSlotId,
} from "../types";

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
  };
}

function makeBareState(): BattleMutableState {
  return {
    battleId: "battle-forward-model-test",
    activeSide: "player",
    turnNumber: 1,
    phase: "main",
    result: null,
    forcedResult: null,
    nextBattleCardOrdinal: 1,
    nextStackEntryOrdinal: 1,
    stack: [],
    sides: {
      player: makeEmptySide(),
      enemy: makeEmptySide(),
    },
    cardInstances: {},
  };
}

function makeCharacterDefinition(
  name: string,
  cardNumber: number,
  printedSpark: number,
  energyCost: number,
): BattleDeckCardDefinition {
  return {
    sourceDeckEntryId: null,
    cardNumber,
    name,
    battleCardKind: "character",
    subtype: "Warrior",
    energyCost,
    printedEnergyCost: energyCost,
    printedSpark,
    isFast: false,
    reclaimCost: null,
    renderedText: "",
    imageNumber: 0,
    transfiguration: null,
    isBane: false,
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

function figmentProvenance(): BattleCardProvenance {
  return {
    kind: "generated-figment",
    sourceBattleCardId: null,
    chosenSpark: 1,
    chosenSubtype: "Shadow",
    createdAtTurnNumber: 1,
    createdAtSide: "enemy",
    createdAtMs: 1,
  };
}

function addInstance(
  state: BattleMutableState,
  side: BattleSide,
  definition: BattleDeckCardDefinition,
  options: { figment?: boolean; sparkDelta?: number; figmentCount?: number } = {},
): string {
  const id = allocateBattleCardInstance(state, {
    definition,
    owner: side,
    controller: side,
    isRevealedToPlayer: true,
    provenance: options.figment ? figmentProvenance() : questDeckProvenance(),
  });
  if (options.sparkDelta !== undefined) {
    state.cardInstances[id].sparkDelta = options.sparkDelta;
  }
  if (options.figment && options.figmentCount !== undefined) {
    state.cardInstances[id].figmentCount = options.figmentCount;
  }
  return id;
}

describe("forwardModelFromState", () => {
  it("projects AI hand/deck/void contents, energy, and both scores", () => {
    const state = makeBareState();
    const ai: BattleSide = "enemy";
    const opponent: BattleSide = "player";

    state.sides[ai].currentEnergy = 3;
    state.sides[ai].maxEnergy = 5;
    state.sides[ai].score = 7;
    state.sides[opponent].score = 11;

    const handA = addInstance(state, ai, makeCharacterDefinition("HandA", 101, 2, 1));
    const handB = addInstance(state, ai, makeCharacterDefinition("HandB", 102, 4, 3));
    state.sides[ai].hand = [handA, handB];

    const deckCard = addInstance(state, ai, makeCharacterDefinition("DeckCard", 103, 1, 2));
    state.sides[ai].deck = [deckCard];

    const voidCard = addInstance(state, ai, makeCharacterDefinition("VoidCard", 104, 5, 4));
    state.sides[ai].void = [voidCard];

    const model = forwardModelFromState(state, ai);

    expect(model.aiEnergy).toBe(3);
    expect(model.aiMaxEnergy).toBe(5);
    expect(model.aiScore).toBe(7);
    expect(model.playerScore).toBe(11);

    expect(model.aiHand.map((card) => card.cardNumber)).toEqual([101, 102]);
    expect(model.aiDeck.map((card) => card.cardNumber)).toEqual([103]);
    expect(model.aiVoid.map((card) => card.cardNumber)).toEqual([104]);

    const handBProjected = model.aiHand.find((card) => card.cardNumber === 102);
    expect(handBProjected).toMatchObject({
      name: "HandB",
      energyCost: 3,
      basePrintedSpark: 4,
      sparkDelta: 0,
      figmentCount: 1,
    });
  });

  it("projects AI board slot occupancy and canChallengeThisTurn default true", () => {
    const state = makeBareState();
    const ai: BattleSide = "enemy";

    const deployed = addInstance(state, ai, makeCharacterDefinition("Deployed", 201, 3, 1));
    state.sides[ai].frontRank.F1 = deployed;
    const reserved = addInstance(state, ai, makeCharacterDefinition("Reserved", 202, 2, 1));
    state.sides[ai].backRank.B3 = reserved;

    const model = forwardModelFromState(state, ai);

    for (const slot of FRONT_RANK_SLOT_IDS) {
      if (slot === "F1") {
        expect(model.aiDeployed[slot]?.cardNumber).toBe(201);
      } else {
        expect(model.aiDeployed[slot]).toBeNull();
      }
    }
    for (const slot of BACK_RANK_SLOT_IDS) {
      if (slot === "B3") {
        expect(model.aiReserve[slot]?.cardNumber).toBe(202);
      } else {
        expect(model.aiReserve[slot]).toBeNull();
      }
    }

    expect(model.aiDeployed.F1?.canChallengeThisTurn).toBe(true);
    expect(model.aiReserve.B3?.canChallengeThisTurn).toBe(true);
  });

  it("marks a body that entered play on the AI's current turn as unable to challenge", () => {
    const state = makeBareState();
    const ai: BattleSide = "enemy";
    state.activeSide = ai;
    state.turnNumber = 4;

    const fresh = addInstance(state, ai, makeCharacterDefinition("Fresh", 201, 3, 1));
    state.cardInstances[fresh].enteredPlayTurnNumber = 4;
    state.sides[ai].backRank.B0 = fresh;

    const aged = addInstance(state, ai, makeCharacterDefinition("Aged", 202, 2, 1));
    state.cardInstances[aged].enteredPlayTurnNumber = 2;
    state.sides[ai].backRank.B1 = aged;

    const model = forwardModelFromState(state, ai);

    expect(model.aiReserve.B0?.canChallengeThisTurn).toBe(false);
    expect(model.aiReserve.B1?.canChallengeThisTurn).toBe(true);
  });

  it("keeps a body exhausted through the opponent's turn until the AI's next Dawn", () => {
    const state = makeBareState();
    const ai: BattleSide = "enemy";
    const opponent: BattleSide = "player";
    // The opponent is active at turnNumber 5; the AI's most recent turn was 4.
    state.activeSide = opponent;
    state.turnNumber = 5;

    const playedLastAiTurn = addInstance(state, ai, makeCharacterDefinition("Recent", 201, 3, 1));
    state.cardInstances[playedLastAiTurn].enteredPlayTurnNumber = 4;
    state.sides[ai].backRank.B0 = playedLastAiTurn;

    const playedEarlier = addInstance(state, ai, makeCharacterDefinition("Older", 202, 2, 1));
    state.cardInstances[playedEarlier].enteredPlayTurnNumber = 3;
    state.sides[ai].backRank.B1 = playedEarlier;

    const model = forwardModelFromState(state, ai);

    // Still exhausted during the opponent's turn → cannot be moved up to block.
    expect(model.aiReserve.B0?.canChallengeThisTurn).toBe(false);
    // Cleared at the AI's last Dawn → available to block.
    expect(model.aiReserve.B1?.canChallengeThisTurn).toBe(true);
  });

  it("projects opponent bodies as abstract spark/rank/slot without identity", () => {
    const state = makeBareState();
    const ai: BattleSide = "enemy";
    const opponent: BattleSide = "player";

    const front = addInstance(state, opponent, makeCharacterDefinition("Front", 301, 5, 1), {
      sparkDelta: 2,
    });
    state.sides[opponent].frontRank.F0 = front;

    const back = addInstance(state, opponent, makeCharacterDefinition("Back", 302, 3, 1));
    state.sides[opponent].backRank.B0 = back;

    const figment = addInstance(
      state,
      opponent,
      makeCharacterDefinition("Fig", 303, 1, 1),
      { figment: true, figmentCount: 4 },
    );
    state.sides[opponent].frontRank.F2 = figment;

    state.sides[opponent].hand = ["x", "y"];
    state.sides[opponent].void = ["z"];

    const model = forwardModelFromState(state, ai);

    expect(model.opponentBodies).toHaveLength(3);

    const frontBody = model.opponentBodies.find((body) => body.slot === "F0");
    expect(frontBody).toEqual({
      battleCardId: front,
      effectiveSpark: 7,
      energyCost: 1,
      rank: "front",
      slot: "F0",
      isFigment: false,
    });

    const backBody = model.opponentBodies.find((body) => body.slot === "B0");
    expect(backBody).toEqual({
      battleCardId: back,
      effectiveSpark: 3,
      energyCost: 1,
      rank: "back",
      slot: "B0",
      isFigment: false,
    });

    const figmentBody = model.opponentBodies.find((body) => body.slot === "F2");
    expect(figmentBody).toEqual({
      battleCardId: figment,
      effectiveSpark: 4,
      energyCost: 1,
      rank: "front",
      slot: "F2",
      isFigment: true,
    });

    expect(model.opponentHandCount).toBe(2);
    expect(model.opponentVoidCount).toBe(1);

    // Asymmetric-knowledge: `battleCardId` is a bare targeting handle; no
    // opponent card IDENTITY (cardNumber/name) leaks onto bodies.
    for (const body of model.opponentBodies) {
      expect(body).not.toHaveProperty("cardNumber");
      expect(body).not.toHaveProperty("name");
    }
  });

  it("defaults a null energy cost to 0", () => {
    const state = makeBareState();
    const ai: BattleSide = "enemy";

    const eventDef = makeCharacterDefinition("NullCost", 401, 0, 0);
    // Simulate a card definition whose energyCost is null at runtime.
    (eventDef as { energyCost: number | null }).energyCost = null;
    const id = addInstance(state, ai, eventDef);
    state.sides[ai].hand = [id];

    const model = forwardModelFromState(state, ai);

    expect(model.aiHand[0].energyCost).toBe(0);
  });
});

describe("cloneForwardModel", () => {
  function buildModel(): ReturnType<typeof forwardModelFromState> {
    const state = makeBareState();
    const ai: BattleSide = "enemy";
    const opponent: BattleSide = "player";

    state.sides[ai].currentEnergy = 2;
    const hand = addInstance(state, ai, makeCharacterDefinition("Hand", 501, 2, 1), {
      sparkDelta: 1,
    });
    state.sides[ai].hand = [hand];

    const deployed = addInstance(state, ai, makeCharacterDefinition("Deployed", 502, 3, 1));
    state.sides[ai].frontRank.F0 = deployed;

    const opp = addInstance(state, opponent, makeCharacterDefinition("Opp", 503, 4, 1));
    state.sides[opponent].frontRank.F0 = opp;

    return forwardModelFromState(state, ai);
  }

  it("does not alias scalar energy", () => {
    const original = buildModel();
    const clone = cloneForwardModel(original);
    clone.aiEnergy += 1;
    expect(original.aiEnergy).toBe(2);
  });

  it("does not alias hand array", () => {
    const original = buildModel();
    const clone = cloneForwardModel(original);
    const before = original.aiHand.length;
    clone.aiHand.push({
      battleCardId: "new",
      cardNumber: 999,
      name: "New",
      energyCost: 0,
      basePrintedSpark: 0,
      sparkDelta: 0,
      figmentCount: 1,
      canChallengeThisTurn: false,
    });
    expect(original.aiHand.length).toBe(before);
  });

  it("does not alias AiCard objects", () => {
    const original = buildModel();
    const clone = cloneForwardModel(original);
    clone.aiHand[0].sparkDelta = 99;
    expect(original.aiHand[0].sparkDelta).toBe(1);
  });

  it("does not alias deployed slot assignments", () => {
    const original = buildModel();
    const clone = cloneForwardModel(original);
    const slot: FrontRankSlotId = "F0";
    clone.aiDeployed[slot] = null;
    expect(original.aiDeployed[slot]?.cardNumber).toBe(502);
  });

  it("does not alias a deployed AiCard object", () => {
    const original = buildModel();
    const clone = cloneForwardModel(original);
    const slot: FrontRankSlotId = "F0";
    clone.aiDeployed[slot]!.canChallengeThisTurn = false;
    expect(original.aiDeployed[slot]?.canChallengeThisTurn).toBe(true);
  });

  it("does not alias reserve slot record", () => {
    const original = buildModel();
    const clone = cloneForwardModel(original);
    const slot: BackRankSlotId = "B0";
    clone.aiReserve[slot] = {
      battleCardId: "r",
      cardNumber: 0,
      name: "r",
      energyCost: 0,
      basePrintedSpark: 0,
      sparkDelta: 0,
      figmentCount: 1,
      canChallengeThisTurn: false,
    };
    expect(original.aiReserve[slot]).toBeNull();
  });

  it("does not alias opponent body objects", () => {
    const original = buildModel();
    const clone = cloneForwardModel(original);
    clone.opponentBodies[0].effectiveSpark = 1000;
    expect(original.opponentBodies[0].effectiveSpark).toBe(4);
  });
});

describe("effectiveSpark", () => {
  function makeAiCard(
    battleCardId: string,
    basePrintedSpark: number,
    sparkDelta: number,
    figmentCount: number,
  ): import("./forward-model").AiCard {
    return {
      battleCardId,
      cardNumber: 1,
      name: battleCardId,
      energyCost: 1,
      basePrintedSpark,
      sparkDelta,
      figmentCount,
      canChallengeThisTurn: true,
    };
  }

  function makeEmptyModel(): ForwardModel {
    return {
      aiEnergy: 0,
      aiMaxEnergy: 0,
      aiScore: 0,
      playerScore: 0,
      aiHand: [],
      aiDeck: [],
      aiVoid: [],
      aiDeployed: { F0: null, F1: null, F2: null, F3: null },
      aiReserve: { B0: null, B1: null, B2: null, B3: null, B4: null },
      opponentBodies: [],
      opponentHandCount: 0,
      opponentVoidCount: 0,
    };
  }

  it("returns 0 for an empty deployed slot", () => {
    const model = makeEmptyModel();
    expect(effectiveSpark(model, "F0", new Map())).toBe(0);
  });

  it("computes base spark as basePrintedSpark * figmentCount + sparkDelta", () => {
    const model = makeEmptyModel();
    // basePrintedSpark=3, figmentCount=4, sparkDelta=2 → 3*4+2 = 14
    model.aiDeployed.F0 = makeAiCard("card-a", 3, 2, 4);
    expect(effectiveSpark(model, "F0", new Map())).toBe(14);
  });

  it("B1 supports F0 and F1 but not F2", () => {
    const model = makeEmptyModel();
    // base spark = 5*1+0 = 5
    model.aiDeployed.F0 = makeAiCard("body-d0", 5, 0, 1);
    model.aiDeployed.F1 = makeAiCard("body-d1", 5, 0, 1);
    model.aiDeployed.F2 = makeAiCard("body-d2", 5, 0, 1);
    model.aiReserve.B1 = makeAiCard("r1-support", 2, 0, 1);
    const sources = new Map([["r1-support", 2]]);

    expect(effectiveSpark(model, "F0", sources)).toBe(7); // 5 + 2
    expect(effectiveSpark(model, "F1", sources)).toBe(7); // 5 + 2
    expect(effectiveSpark(model, "F2", sources)).toBe(5); // unchanged
  });

  it("B0 supports only F0, not F1", () => {
    const model = makeEmptyModel();
    model.aiDeployed.F0 = makeAiCard("body-d0", 3, 0, 1);
    model.aiDeployed.F1 = makeAiCard("body-d1", 3, 0, 1);
    model.aiReserve.B0 = makeAiCard("r0-support", 1, 0, 1);
    const sources = new Map([["r0-support", 2]]);

    expect(effectiveSpark(model, "F0", sources)).toBe(5); // 3 + 2
    expect(effectiveSpark(model, "F1", sources)).toBe(3); // unchanged
  });

  it("two sources both supporting the same slot stack additively", () => {
    const model = makeEmptyModel();
    // B1 supports F0,F1; B2 supports F1,F2 → F1 gets both
    model.aiDeployed.F1 = makeAiCard("body-d1", 4, 0, 1);
    model.aiReserve.B1 = makeAiCard("r1-card", 1, 0, 1);
    model.aiReserve.B2 = makeAiCard("r2-card", 1, 0, 1);
    const sources = new Map([
      ["r1-card", 2],
      ["r2-card", 1],
    ]);

    // base=4, +2 from B1, +1 from B2 = 7
    expect(effectiveSpark(model, "F1", sources)).toBe(7);
  });

  it("a reserve card absent from supportSources contributes nothing", () => {
    const model = makeEmptyModel();
    model.aiDeployed.F0 = makeAiCard("body-d0", 5, 0, 1);
    model.aiReserve.B1 = makeAiCard("r1-no-support", 2, 0, 1);
    // r1-no-support is NOT in sources
    const sources = new Map<string, number>();

    expect(effectiveSpark(model, "F0", sources)).toBe(5);
  });

  it("support is not divided — each supported slot gets the full value", () => {
    const model = makeEmptyModel();
    model.aiDeployed.F0 = makeAiCard("body-d0", 3, 0, 1);
    model.aiDeployed.F1 = makeAiCard("body-d1", 3, 0, 1);
    model.aiReserve.B1 = makeAiCard("r1-wide", 1, 0, 1);
    const sources = new Map([["r1-wide", 3]]);

    // Both slots get +3, not +1.5
    expect(effectiveSpark(model, "F0", sources)).toBe(6);
    expect(effectiveSpark(model, "F1", sources)).toBe(6);
  });
});
