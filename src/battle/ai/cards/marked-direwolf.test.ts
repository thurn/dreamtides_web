import { describe, expect, it } from "vitest";
import { markedDirewolf } from "./marked-direwolf";
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

describe("Marked Direwolf (#512)", () => {
  it("is vanilla: no trigger or static hooks defined", () => {
    expect("onMaterialized" in markedDirewolf).toBe(false);
    expect("onDawn" in markedDirewolf).toBe(false);
    expect("onDissolved" in markedDirewolf).toBe(false);
    expect("supportSpark" in markedDirewolf).toBe(false);
    expect("selfStaticSpark" in markedDirewolf).toBe(false);
  });

  it("play pays energy and occupies a reserve slot, exhausted", () => {
    const self = makeCard({ battleCardId: "wolf", cardNumber: 512, energyCost: 4 });
    const model = makeModel({ aiEnergy: 6, aiHand: [self] });
    markedDirewolf.play(model, self, null);
    expect(model.aiEnergy).toBe(2);
    expect(model.aiHand).toHaveLength(0);
    expect(model.aiReserve.R0?.battleCardId).toBe("wolf");
    expect(model.aiReserve.R0?.canChallengeThisTurn).toBe(false);
  });

  it("canPlay is false without enough energy", () => {
    const self = makeCard({ battleCardId: "wolf", cardNumber: 512, energyCost: 4 });
    expect(markedDirewolf.canPlay(makeModel({ aiEnergy: 3 }), self)).toBe(false);
    expect(markedDirewolf.canPlay(makeModel({ aiEnergy: 4 }), self)).toBe(true);
  });
});
