import { describe, expect, it } from "vitest";
import { worldsAwait } from "./worlds-await";
import type { AiCard, ForwardModel } from "../forward-model";

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

describe("Worlds Await (#519)", () => {
  it("canPlay is false with no allies on the board", () => {
    const self = makeCard({ battleCardId: "dw", cardNumber: 519, energyCost: 1 });
    expect(worldsAwait.canPlay(makeModel({ aiEnergy: 3 }), self)).toBe(false);
  });

  it("canPlay is false without enough energy even with an ally", () => {
    const self = makeCard({ battleCardId: "dw", cardNumber: 519, energyCost: 1 });
    const ally = makeCard({ battleCardId: "ally", cardNumber: 512, basePrintedSpark: 4 });
    const model = makeModel({
      aiEnergy: 0,
      aiDeployed: { D0: ally, D1: null, D2: null, D3: null },
    });
    expect(worldsAwait.canPlay(model, self)).toBe(false);
  });

  it("canPlay is true with a reserve ally and energy", () => {
    const self = makeCard({ battleCardId: "dw", cardNumber: 519, energyCost: 1 });
    const ally = makeCard({ battleCardId: "ally", cardNumber: 512, basePrintedSpark: 4 });
    const model = makeModel({
      aiEnergy: 1,
      aiReserve: { R0: ally, R1: null, R2: null, R3: null, R4: null },
    });
    expect(worldsAwait.canPlay(model, self)).toBe(true);
  });

  it("play adds +3 to the chosen ally's sparkDelta and voids the event", () => {
    const self = makeCard({ battleCardId: "dw", cardNumber: 519, energyCost: 1 });
    const small = makeCard({ battleCardId: "small", cardNumber: 514, basePrintedSpark: 2 });
    const big = makeCard({ battleCardId: "big", cardNumber: 512, basePrintedSpark: 4 });
    const model = makeModel({
      aiEnergy: 2,
      aiHand: [self],
      aiDeployed: { D0: small, D1: big, D2: null, D3: null },
    });

    const targets = worldsAwait.chooseTargets(model, self);
    worldsAwait.play(model, self, targets);

    // Highest-base-spark deployed ally (big) gets the pump.
    expect(model.aiDeployed.D1?.sparkDelta).toBe(3);
    expect(model.aiDeployed.D0?.sparkDelta).toBe(0);
    expect(model.aiEnergy).toBe(1);
    expect(model.aiVoid.map((c) => c.battleCardId)).toEqual(["dw"]);
  });

  it("pumps a reserve ally when no deployed ally exists", () => {
    const self = makeCard({ battleCardId: "dw", cardNumber: 519, energyCost: 1 });
    const ally = makeCard({ battleCardId: "ally", cardNumber: 512, basePrintedSpark: 4 });
    const model = makeModel({
      aiEnergy: 2,
      aiHand: [self],
      aiReserve: { R0: null, R1: ally, R2: null, R3: null, R4: null },
    });

    const targets = worldsAwait.chooseTargets(model, self);
    worldsAwait.play(model, self, targets);

    expect(model.aiReserve.R1?.sparkDelta).toBe(3);
  });
});
