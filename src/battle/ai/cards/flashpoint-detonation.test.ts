import { describe, expect, it } from "vitest";
import { flashpointDetonation } from "./flashpoint-detonation";
import type { AiCard, AiOpponentBody, ForwardModel } from "../forward-model";

function makeCard(overrides: Partial<AiCard> & Pick<AiCard, "battleCardId" | "cardNumber">): AiCard {
  return {
    name: "card",
    energyCost: 0,
    basePrintedSpark: 0,
    sparkDelta: 0,
    figmentCount: 1,
    canChallengeThisTurn: true,
    ...overrides,
  };
}

function makeBody(overrides: Partial<AiOpponentBody> & Pick<AiOpponentBody, "battleCardId">): AiOpponentBody {
  return {
    effectiveSpark: 1,
    rank: "back",
    slot: "R0",
    isFigment: false,
    ...overrides,
  };
}

function makeModel(overrides: Partial<ForwardModel> = {}): ForwardModel {
  return {
    aiEnergy: 5,
    aiMaxEnergy: 5,
    aiScore: 0,
    playerScore: 0,
    aiHand: [],
    aiDeck: [],
    aiVoid: [],
    aiDeployed: { D0: null, D1: null, D2: null, D3: null },
    aiReserve: { R0: null, R1: null, R2: null, R3: null, R4: null },
    opponentBodies: [],
    opponentHandCount: 0,
    opponentVoidCount: 0,
    ...overrides,
  };
}

describe("Flashpoint Detonation (#516)", () => {
  it("canPlay is false with no opponent bodies", () => {
    const self = makeCard({ battleCardId: "blast", cardNumber: 516, energyCost: 2 });
    expect(flashpointDetonation.canPlay(makeModel({ opponentBodies: [] }), self)).toBe(false);
  });

  it("canPlay is false without enough energy", () => {
    const self = makeCard({ battleCardId: "blast", cardNumber: 516, energyCost: 2 });
    const model = makeModel({
      aiEnergy: 1,
      opponentBodies: [makeBody({ battleCardId: "x", effectiveSpark: 3 })],
    });
    expect(flashpointDetonation.canPlay(model, self)).toBe(false);
  });

  it("chooseTargets prefers a front-rank body when one exists", () => {
    const self = makeCard({ battleCardId: "blast", cardNumber: 516, energyCost: 2 });
    const model = makeModel({
      opponentBodies: [
        makeBody({ battleCardId: "bigBack", rank: "back", slot: "R1", effectiveSpark: 9 }),
        makeBody({ battleCardId: "front", rank: "front", slot: "D0", effectiveSpark: 2 }),
      ],
    });
    expect(flashpointDetonation.chooseTargets(model, self)?.targetBattleCardId).toBe("front");
  });

  it("chooseTargets picks the highest-spark body when none are front rank", () => {
    const self = makeCard({ battleCardId: "blast", cardNumber: 516, energyCost: 2 });
    const model = makeModel({
      opponentBodies: [
        makeBody({ battleCardId: "small", rank: "back", slot: "R0", effectiveSpark: 2 }),
        makeBody({ battleCardId: "big", rank: "back", slot: "R1", effectiveSpark: 7 }),
      ],
    });
    expect(flashpointDetonation.chooseTargets(model, self)?.targetBattleCardId).toBe("big");
  });

  it("play removes exactly the targeted body and bumps opponentVoidCount", () => {
    const self = makeCard({ battleCardId: "blast", cardNumber: 516, energyCost: 2 });
    const target = makeBody({ battleCardId: "front", rank: "front", slot: "D0", effectiveSpark: 2 });
    const other = makeBody({ battleCardId: "keep", rank: "back", slot: "R0", effectiveSpark: 5 });
    const model = makeModel({
      aiEnergy: 5,
      aiHand: [self],
      opponentBodies: [target, other],
      opponentVoidCount: 0,
    });

    flashpointDetonation.play(model, self, { targetBattleCardId: "front" });

    expect(model.aiEnergy).toBe(3);
    expect(model.opponentBodies.map((b) => b.battleCardId)).toEqual(["keep"]);
    expect(model.opponentVoidCount).toBe(1);
    expect(model.aiHand).toHaveLength(0);
    expect(model.aiVoid.map((c) => c.battleCardId)).toEqual(["blast"]);
  });
});
