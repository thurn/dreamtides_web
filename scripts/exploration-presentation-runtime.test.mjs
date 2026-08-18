import { describe, expect, it } from "vitest";
import {
  buildSimulatedPlayerDeck,
  renderActionPresentation,
} from "./exploration-presentation-runtime.mjs";

function card(id, name, overrides = {}) {
  return {
    id,
    name,
    cardType: "Character",
    subtype: "Warrior",
    energyCost: 1,
    isStarter: false,
    isOfferable: true,
    ...overrides,
  };
}

describe("Exploration presentation runtime", () => {
  it("resolves starter-card entities exclusively from starter-role cards", () => {
    const starter = card(
      "00000000-0000-4000-8000-000000000001",
      "Synthetic starter",
      { isStarter: true, isOfferable: false },
    );
    const offerable = card(
      "00000000-0000-4000-8000-000000000002",
      "Synthetic offerable",
    );
    const cards = [starter, offerable];
    const playerDeck = buildSimulatedPlayerDeck(cards, () => 0);
    const presentation = renderActionPresentation(
      {
        effectText: "Purge {starter_card}",
        effectKind: "purge-starter-card",
      },
      cards,
      playerDeck,
      () => 0,
    );

    expect(presentation.runtimeCardSelections).toEqual([
      expect.objectContaining({
        placeholder: "{starter_card}",
        cardId: starter.id,
        source: "starter_deck",
      }),
    ]);
    expect(
      cards.find(
        (candidate) =>
          candidate.id === presentation.runtimeCardSelections[0].cardId,
      )?.isStarter,
    ).toBe(true);
  });

  it.each([
    "transfigure-random-cards",
    "transfigure-fixed-random-cards",
    "copy-random-cards",
  ])("does not disclose automatic multi-card targets for %s", (effectKind) => {
    const cards = [
      card("00000000-0000-4000-8000-000000000001", "Synthetic event", {
        cardType: "Event",
      }),
    ];
    const presentation = renderActionPresentation(
      {
        effectText: "Transfigure two random Events",
        effectKind,
        predicate: "event",
        count: 2,
      },
      cards,
      cards,
      () => 0,
    );

    expect(presentation.runtimeCardSelections).toEqual([]);
    expect(presentation.renderedEffectParts).toEqual([
      { kind: "text", text: "Transfigure two random Events" },
    ]);
  });

  it("matches legendary offers only by exact rarity", () => {
    const namedLegendary = card(
      "00000000-0000-4000-8000-000000000001",
      "Legendary Hero",
    );
    const roleLegendary = card(
      "00000000-0000-4000-8000-000000000002",
      "Synthetic role card",
      { roles: ["legendary"] },
    );
    const legendary = card(
      "00000000-0000-4000-8000-000000000003",
      "Synthetic rarity card",
      { rarity: "Legendary" },
    );

    const presentation = renderActionPresentation(
      {
        effectText: "Gain {offered_card}",
        effectKind: "gain-random-cards",
        predicate: "legendary",
      },
      [namedLegendary, roleLegendary, legendary],
      [],
      () => 0,
    );

    expect(presentation.runtimeCardSelections).toEqual([
      expect.objectContaining({
        placeholder: "{offered_card}",
        predicate: "legendary",
        cardId: legendary.id,
        source: "offer_pool",
      }),
    ]);
  });
});
