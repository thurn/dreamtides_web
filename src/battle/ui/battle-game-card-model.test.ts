import { afterEach, describe, expect, it } from "vitest";
import {
  hydrateFigmentCatalog,
  resetFigmentCatalogHydration,
} from "../state/figment-catalog";
import { createDefaultBattleCardStatus } from "../state/create-initial-state";
import type { BattleCardInstance } from "../types";
import { battleGameCardModel } from "./battle-game-card-model";

function shadowFigment(): BattleCardInstance {
  return {
    battleCardId: "figment-instance-1",
    definition: {
      sourceDeckEntryId: null,
      cardId: "",
      cardNumber: 0,
      name: "Shadow",
      battleCardKind: "character",
      subtype: "Shadow",
      energyCost: 0,
      printedEnergyCost: 0,
      printedSpark: 2,
      isFast: false,
      reclaimCost: null,
      renderedText: "",
      imageNumber: 277174382,
      transfiguration: null,
      isBane: false,
    },
    owner: "player",
    controller: "player",
    figments: [2],
    sparkDelta: 0,
    staticSparkBonus: 0,
    isRevealedToPlayer: true,
    status: createDefaultBattleCardStatus(),
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: {
      kind: "generated-figment",
      sourceBattleCardId: null,
      chosenSpark: 2,
      chosenSubtype: "Shadow",
      createdAtTurnNumber: 1,
      createdAtSide: "player",
      createdAtMs: 1,
    },
  };
}

afterEach(() => resetFigmentCatalogHydration());

describe("battleGameCardModel", () => {
  it("restores authored figment art directives for persisted battle instances", () => {
    hydrateFigmentCatalog([
      {
        id: "86125402-a7ca-4bf2-ab36-f8a91ddd27bf",
        name: "Shadow",
        subtype: "Shadow",
        spark: 2,
        imageNumber: 277174382,
        artOwned: false,
        art: { x: 0.289, y: -0.296, scale: 2.47 },
      },
    ]);

    expect(battleGameCardModel(shadowFigment()).displaySnapshot).toMatchObject({
      imageNumber: 277174382,
      artOwned: false,
      art: { x: 0.289, y: -0.296, scale: 2.47 },
    });
  });

  it("preserves art frozen directly into the battle definition", () => {
    const instance = shadowFigment();
    instance.definition.art = { x: -0.2, y: 0.4, scale: 1.5 };

    expect(battleGameCardModel(instance).displaySnapshot.art).toEqual({
      x: -0.2,
      y: 0.4,
      scale: 1.5,
    });
  });
});
