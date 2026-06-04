import { describe, expect, it } from "vitest";
import { cloneForwardModel, forwardModelFromState } from "./forward-model";
import { allocateBattleCardInstance } from "../state/create-initial-state";
import { DEPLOY_SLOT_IDS, RESERVE_SLOT_IDS } from "../types";
import type {
  BattleCardProvenance,
  BattleDeckCardDefinition,
  BattleMutableState,
  BattleSide,
  DeploySlotId,
  ReserveSlotId,
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
    reserve: { R0: null, R1: null, R2: null, R3: null, R4: null },
    deployed: { D0: null, D1: null, D2: null, D3: null },
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
    state.sides[ai].deployed.D1 = deployed;
    const reserved = addInstance(state, ai, makeCharacterDefinition("Reserved", 202, 2, 1));
    state.sides[ai].reserve.R3 = reserved;

    const model = forwardModelFromState(state, ai);

    for (const slot of DEPLOY_SLOT_IDS) {
      if (slot === "D1") {
        expect(model.aiDeployed[slot]?.cardNumber).toBe(201);
      } else {
        expect(model.aiDeployed[slot]).toBeNull();
      }
    }
    for (const slot of RESERVE_SLOT_IDS) {
      if (slot === "R3") {
        expect(model.aiReserve[slot]?.cardNumber).toBe(202);
      } else {
        expect(model.aiReserve[slot]).toBeNull();
      }
    }

    expect(model.aiDeployed.D1?.canChallengeThisTurn).toBe(true);
    expect(model.aiReserve.R3?.canChallengeThisTurn).toBe(true);
  });

  it("projects opponent bodies as abstract spark/rank/slot without identity", () => {
    const state = makeBareState();
    const ai: BattleSide = "enemy";
    const opponent: BattleSide = "player";

    const front = addInstance(state, opponent, makeCharacterDefinition("Front", 301, 5, 1), {
      sparkDelta: 2,
    });
    state.sides[opponent].deployed.D0 = front;

    const back = addInstance(state, opponent, makeCharacterDefinition("Back", 302, 3, 1));
    state.sides[opponent].reserve.R0 = back;

    const figment = addInstance(
      state,
      opponent,
      makeCharacterDefinition("Fig", 303, 1, 1),
      { figment: true, figmentCount: 4 },
    );
    state.sides[opponent].deployed.D2 = figment;

    state.sides[opponent].hand = ["x", "y"];
    state.sides[opponent].void = ["z"];

    const model = forwardModelFromState(state, ai);

    expect(model.opponentBodies).toHaveLength(3);

    const frontBody = model.opponentBodies.find((body) => body.slot === "D0");
    expect(frontBody).toEqual({
      effectiveSpark: 7,
      rank: "front",
      slot: "D0",
      isFigment: false,
    });

    const backBody = model.opponentBodies.find((body) => body.slot === "R0");
    expect(backBody).toEqual({
      effectiveSpark: 3,
      rank: "back",
      slot: "R0",
      isFigment: false,
    });

    const figmentBody = model.opponentBodies.find((body) => body.slot === "D2");
    expect(figmentBody).toEqual({
      effectiveSpark: 4,
      rank: "front",
      slot: "D2",
      isFigment: true,
    });

    expect(model.opponentHandCount).toBe(2);
    expect(model.opponentVoidCount).toBe(1);

    // Asymmetric-knowledge: no opponent identity leaks onto bodies.
    for (const body of model.opponentBodies) {
      expect(body).not.toHaveProperty("cardNumber");
      expect(body).not.toHaveProperty("name");
      expect(body).not.toHaveProperty("battleCardId");
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
    state.sides[ai].deployed.D0 = deployed;

    const opp = addInstance(state, opponent, makeCharacterDefinition("Opp", 503, 4, 1));
    state.sides[opponent].deployed.D0 = opp;

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
    const slot: DeploySlotId = "D0";
    clone.aiDeployed[slot] = null;
    expect(original.aiDeployed[slot]?.cardNumber).toBe(502);
  });

  it("does not alias a deployed AiCard object", () => {
    const original = buildModel();
    const clone = cloneForwardModel(original);
    const slot: DeploySlotId = "D0";
    clone.aiDeployed[slot]!.canChallengeThisTurn = false;
    expect(original.aiDeployed[slot]?.canChallengeThisTurn).toBe(true);
  });

  it("does not alias reserve slot record", () => {
    const original = buildModel();
    const clone = cloneForwardModel(original);
    const slot: ReserveSlotId = "R0";
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
