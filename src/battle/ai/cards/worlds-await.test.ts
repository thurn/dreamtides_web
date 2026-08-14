import { describe, expect, it } from "vitest";
import { worldsAwait } from "./worlds-await";
import type { AiCard, ForwardModel } from "../forward-model";
import { emptyFrontRankSlots, emptyBackRankSlots } from "../../test-support";
import { asBattleCardId } from "../../../types/identifiers";

function makeCard(
  overrides: Partial<AiCard> & Pick<AiCard, "battleCardId" | "cardNumber">,
): AiCard {
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
    aiFrontRank: emptyFrontRankSlots(),
    aiBackRank: emptyBackRankSlots(),
    opponentBodies: [],
    opponentHandCount: 0,
    opponentVoidCount: 0,
    ...overrides,
  };
}

describe("Worlds Await (#519)", () => {
  it("canPlay is false with no allies on the board", () => {
    const self = makeCard({
      battleCardId: asBattleCardId("dw"),
      cardNumber: 519,
      energyCost: 1,
    });
    expect(worldsAwait.canPlay(makeModel({ aiEnergy: 3 }), self)).toBe(false);
  });

  it("canPlay is false without enough energy even with an ally", () => {
    const self = makeCard({
      battleCardId: asBattleCardId("dw"),
      cardNumber: 519,
      energyCost: 1,
    });
    const ally = makeCard({
      battleCardId: asBattleCardId("ally"),
      cardNumber: 512,
      basePrintedSpark: 4,
    });
    const model = makeModel({
      aiEnergy: 0,
      aiFrontRank: { ...emptyFrontRankSlots(), F0: ally },
    });
    expect(worldsAwait.canPlay(model, self)).toBe(false);
  });

  it("canPlay is true with a reserve ally and energy", () => {
    const self = makeCard({
      battleCardId: asBattleCardId("dw"),
      cardNumber: 519,
      energyCost: 1,
    });
    const ally = makeCard({
      battleCardId: asBattleCardId("ally"),
      cardNumber: 512,
      basePrintedSpark: 4,
    });
    const model = makeModel({
      aiEnergy: 1,
      aiBackRank: { ...emptyBackRankSlots(), B0: ally },
    });
    expect(worldsAwait.canPlay(model, self)).toBe(true);
  });

  it("play adds +3 to the chosen ally's sparkDelta and voids the event", () => {
    const self = makeCard({
      battleCardId: asBattleCardId("dw"),
      cardNumber: 519,
      energyCost: 1,
    });
    const small = makeCard({
      battleCardId: asBattleCardId("small"),
      cardNumber: 514,
      basePrintedSpark: 2,
    });
    const big = makeCard({
      battleCardId: asBattleCardId("big"),
      cardNumber: 512,
      basePrintedSpark: 4,
    });
    const model = makeModel({
      aiEnergy: 2,
      aiHand: [self],
      aiFrontRank: { ...emptyFrontRankSlots(), F0: small, F1: big },
    });

    const targets = worldsAwait.chooseTargets(model, self);
    worldsAwait.play(model, self, targets);

    // Highest-base-spark deployed ally (big) gets the pump.
    expect(model.aiFrontRank.F1?.sparkDelta).toBe(3);
    expect(model.aiFrontRank.F0?.sparkDelta).toBe(0);
    expect(model.aiEnergy).toBe(1);
    expect(model.aiVoid.map((c) => c.battleCardId)).toEqual(["dw"]);
  });

  it("pumps a reserve ally when no deployed ally exists", () => {
    const self = makeCard({
      battleCardId: asBattleCardId("dw"),
      cardNumber: 519,
      energyCost: 1,
    });
    const ally = makeCard({
      battleCardId: asBattleCardId("ally"),
      cardNumber: 512,
      basePrintedSpark: 4,
    });
    const model = makeModel({
      aiEnergy: 2,
      aiHand: [self],
      aiBackRank: { ...emptyBackRankSlots(), B1: ally },
    });

    const targets = worldsAwait.chooseTargets(model, self);
    worldsAwait.play(model, self, targets);

    expect(model.aiBackRank.B1?.sparkDelta).toBe(3);
  });
});
