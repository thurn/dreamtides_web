// The engine card models: each copy shown with its own deck-entry
// modifications, printing, and costs.
import { describe, expect, it } from "vitest";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { DSL } from "../../engine/testing/dsl-cards";
import { CONTINUOUS } from "../../engine/testing/continuous-cards";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { NO_DECK_MODS, type DeckMods } from "../../engine/dsl/types";
import type { BattleDeckCardDefinition } from "../../battle/types";
import { parseCardName, parseCardSubtype, type CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { CardKeywordModification } from "../../types/journey";
import { board, engine } from "./engine-battle-view-model.fixtures";

describe("engine card models", () => {
  /** A dealt definition of `cardId`: a deck entry's display, its keyword changes applied. */
  function dealt(cardId: CardId, keywordModification: CardKeywordModification | null, renderedText: string): BattleDeckCardDefinition {
    return {
      sourceDeckEntryId: null,
      cardId,
      cardNumber: 1,
      name: parseCardName("Fixture Card"),
      battleCardKind: "character",
      subtype: parseCardSubtype("Fixture"),
      energyCost: 2,
      printedEnergyCost: 2,
      printedSpark: 1,
      isFast: keywordModification?.fast === true,
      timing: keywordModification?.fast === true ? "fast" : "standard",
      reclaimCost: keywordModification?.reclaim ?? null,
      renderedText,
      imageNumber: 0,
      transfiguration: null,
      ...(keywordModification === null ? {} : { keywordModification }),
      isBane: false,
    };
  }

  it("shows each copy of a card with its own deck-entry modifications", () => {
    const cardId = SYNTHETIC.vanilla1.id;
    const plain = dealt(cardId, null, "plain copy");
    const reclaim = dealt(cardId, { reclaim: 2 }, "reclaim copy");
    const fast = dealt(cardId, { fast: true }, "fast copy");
    const mods = (change: Partial<DeckMods>): DeckMods => ({ ...NO_DECK_MODS, ...change });
    const { state, ids } = board({
      player: {
        hand: [cardId, { cardId, deckMods: mods({ reclaim: 2 }) }, { cardId, deckMods: mods({ fast: true, sparkBonus: 1 }) }],
      },
    });
    const view = engine.view(state, "player");
    const models = createEngineCardModels({ definitions: [plain, reclaim, fast], cards: new Map(), figment: () => undefined });
    const shown = ids.player.hand.map((instance) => {
      const model = models(view.instances[instance]);
      return [model.displaySnapshot.renderedText, model.displaySnapshot.isFast, model.displaySnapshot.reclaimCost];
    });

    expect(shown).toEqual([plain, reclaim, fast].map((definition) => [definition.renderedText, definition.isFast, definition.reclaimCost]));
  });

  it("shows the catalog card for a copy in a variant no deck entry dealt", () => {
    const cardId = SYNTHETIC.vanilla1.id;
    const reclaim = dealt(cardId, { reclaim: 2 }, "reclaim copy");
    const printed: CardData = {
      name: parseCardName("Fixture Card"),
      id: cardId,
      cardNumber: 1,
      cardType: "Character",
      subtype: parseCardSubtype("Fixture"),
      isStarter: false,
      energyCost: 2,
      spark: 1,
      isFast: false,
      reclaimCost: null,
      renderedText: "printed card",
      imageNumber: 0,
      artOwned: false,
    };
    const { state, ids } = board({ player: { hand: [cardId] } });
    const models = createEngineCardModels({ definitions: [reclaim], cards: new Map([[cardId, printed]]), figment: () => undefined });
    const shown = models(engine.view(state, "player").instances[ids.player.hand[0]]).displaySnapshot;

    expect([shown.renderedText, shown.reclaimCost]).toEqual([printed.renderedText, null]);
  });

  it.each([
    { definitionCost: null, catalogCost: 2, matching: true, reduction: 0, expected: null },
    { definitionCost: 2, catalogCost: null, matching: true, reduction: 0, expected: 1 },
    { definitionCost: 2, catalogCost: null, matching: true, reduction: 1, expected: 0 },
    { definitionCost: 2, catalogCost: null, matching: false, reduction: 0, expected: null },
    { definitionCost: null, catalogCost: 2, matching: false, reduction: 1, expected: 0 },
  ])("preserves a single X from the selected printing and effective fixed costs: %j", ({ definitionCost, catalogCost, matching, reduction, expected }) => {
    const cardId = SYNTHETIC.vanilla1.id;
    const definition = { ...dealt(cardId, matching ? null : { reclaim: 2 }, "fixture"), printedEnergyCost: definitionCost };
    const printed: CardData = {
      id: cardId,
      name: definition.name,
      cardNumber: 1,
      cardType: "Character",
      subtype: definition.subtype,
      isStarter: false,
      energyCost: catalogCost,
      spark: 1,
      isFast: false,
      renderedText: "fixture",
      imageNumber: 0,
      artOwned: false,
    };
    const { state, ids } = board({ player: { hand: [{ cardId, deckMods: { ...NO_DECK_MODS, costReduction: reduction } }] } });
    const models = createEngineCardModels({ definitions: [definition], cards: new Map([[cardId, printed]]), figment: () => undefined });
    const snapshot = models(engine.view(state, "player").instances[ids.player.hand[0]]).displaySnapshot;

    expect(snapshot.energyCost).toBe(expected);
    expect(snapshot.energyCosts).toBeUndefined();
  });

  it("shows a catalog single X at zero effective cost without a dealt definition", () => {
    const cardId = DSL.pointsTimesX.id;
    const printed: CardData = {
      id: cardId,
      name: parseCardName("Fixture Card"),
      cardNumber: 1,
      cardType: "Event",
      subtype: parseCardSubtype("Fixture"),
      isStarter: false,
      energyCost: null,
      spark: null,
      isFast: false,
      renderedText: "fixture",
      imageNumber: 0,
      artOwned: false,
    };
    const { state, ids } = board({ player: { hand: [cardId] } });
    const models = createEngineCardModels({ definitions: [], cards: new Map([[cardId, printed]]), figment: () => undefined });
    const snapshot = models(engine.view(state, "player").instances[ids.player.hand[0]]).displaySnapshot;

    expect(snapshot.energyCost).toBeNull();
    expect(snapshot.energyCosts).toBeUndefined();
  });

  /** A dealt multi-cost event ("1 X") of `cardId`, its deck entry's cost reduction applied to its orbs. */
  function dealtMultiCost(cardId: CardId, energyCostReduction: number): BattleDeckCardDefinition {
    const modification = energyCostReduction === 0 ? null : { energyCostReduction };
    return {
      ...dealt(cardId, modification, "multi-cost copy"),
      battleCardKind: "event",
      energyCost: 1 - energyCostReduction,
      printedEnergyCost: 1,
      energyCosts: [String(1 - energyCostReduction), "X"],
    };
  }

  it("shows each multi-cost copy's orbs at its own deck-entry cost", () => {
    const cardId = DSL.fixedPlusXPoints.id;
    const { state, ids } = board({
      player: { hand: [cardId, { cardId, deckMods: { ...NO_DECK_MODS, costReduction: 1 } }] },
    });
    const view = engine.view(state, "player");
    const models = createEngineCardModels({
      definitions: [dealtMultiCost(cardId, 0), dealtMultiCost(cardId, 1)],
      cards: new Map(),
      figment: () => undefined,
    });
    const orbs = ids.player.hand.map((instance) => models(view.instances[instance]).displaySnapshot.energyCosts);

    expect(orbs).toEqual([
      ["1", "X"],
      ["0", "X"],
    ]);
  });

  it("shows an in-battle cost change on multi-cost orbs and leaves single-cost cards orb-free", () => {
    const multiCost = DSL.fixedPlusXPoints.id;
    const singleCost = DSL.drawTwo.id;
    const { state, ids } = board({ player: { front: [CONTINUOUS.eventTax.id], hand: [multiCost, singleCost] } });
    const view = engine.view(state, "player");
    const models = createEngineCardModels({
      definitions: [dealtMultiCost(multiCost, 0)],
      cards: new Map(),
      figment: () => undefined,
    });
    const [taxedMulti, taxedSingle] = ids.player.hand.map((instance) => models(view.instances[instance]).displaySnapshot);

    expect(taxedMulti.energyCosts).toEqual(["2", "X"]);
    expect(taxedSingle.energyCosts).toBeUndefined();
    expect(taxedSingle.energyCost).toBe(view.instances[ids.player.hand[1]].characteristics.cost);
  });
});
