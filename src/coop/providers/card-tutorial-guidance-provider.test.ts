import { describe, expect, it } from "vitest";
import type {
  ExplorationActionContent,
  ExplorationContent,
} from "../../data/exploration";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestJourneyState,
  makeMerchantTestSite,
} from "../../journey_v2/testing/fixtures";
import { asCardId } from "../../types/card-identity";
import type { JourneyState, SiteState } from "../../types/journey";
import { buildExplorationRuntime } from "./exploration-provider";
import { createCardTutorialGuidanceContentProvider } from "./card-tutorial-guidance-provider";

function uuid(index: number) {
  return asCardId(
    `a0000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
  );
}

describe("card tutorial guidance content provider", () => {
  it("recognizes a transfiguration reward in a generated Dream Augury encounter", () => {
    const cards = Array.from({ length: 16 }, (_, index) =>
      makeMerchantTestCard({
        id: uuid(index + 1),
        cardNumber: index + 1,
        cardType: "Character",
        energyCost: 2,
        spark: 2,
      }),
    );
    const content = makeMerchantTestContent({ cards });
    const site = makeMerchantTestSite({
      id: "augury-with-transfiguration",
      type: "DreamAugury",
    });
    const journey = makeMerchantTestJourneyState({
      deck: [
        makeMerchantTestDeckEntry({ entryId: "deck-1", cardNumber: 1 }),
      ],
      siteRuntime: {
        [site.id]: {
          kind: "dreamAugury",
          completed: false,
          forcedArchetypeId: "transfigured_draft",
        },
      },
    });

    expect(
      createCardTutorialGuidanceContentProvider(
        content,
      ).hasVisibleTransfigurationReward(journey, site),
    ).toBe(true);
  });

  it("tracks whether an authored Exploration transfiguration action is currently visible", () => {
    const encounterCard = makeMerchantTestCard({
      id: uuid(101),
      cardNumber: 101,
    });
    const deckCard = makeMerchantTestCard({
      id: uuid(102),
      cardNumber: 102,
      cardType: "Character",
      energyCost: 2,
      spark: 2,
    });
    const transfigureAction: ExplorationActionContent = {
      id: "transfigure-card",
      label: "Change a card",
      effectText: "Transfigure a chosen card.",
      responseText: "The card changes.",
      effectKind: "transfigure-selected",
    };
    const ordinaryAction: ExplorationActionContent = {
      id: "gain-essence",
      label: "Gather essence",
      effectText: "Gain essence.",
      responseText: "The essence gathers.",
      effectKind: "gain-essence-per-card",
      essencePerCard: 1,
    };
    const exploration: ExplorationContent = {
      customCards: [],
      customDreamsigns: [],
      encounters: [
        {
          cardId: encounterCard.id,
          prose: "A synthetic encounter.",
          actions: [transfigureAction, ordinaryAction],
        },
      ],
    };
    const content = {
      ...makeMerchantTestContent({ cards: [encounterCard, deckCard] }),
      exploration,
    };
    const site: SiteState = {
      id: "exploration-with-transfiguration",
      type: "Exploration",
      isEnhanced: false,
      isVisited: false,
    };
    const baseJourney = makeMerchantTestJourneyState({
      deck: [
        makeMerchantTestDeckEntry({ entryId: "deck-1", cardNumber: 102 }),
      ],
    });
    const runtime = buildExplorationRuntime(
      baseJourney,
      site,
      content,
      () => 0.25,
      encounterCard.id,
    );
    if (runtime === null) throw new Error("Expected Exploration runtime");
    const journey: JourneyState = {
      ...baseJourney,
      siteRuntime: { [site.id]: runtime },
    };
    const provider = createCardTutorialGuidanceContentProvider(content);

    expect(provider.hasVisibleTransfigurationReward(journey, site)).toBe(true);

    const withoutTransfigurationOffer: JourneyState = {
      ...journey,
      siteRuntime: {
        [site.id]: {
          ...runtime,
          actionOffers: runtime.actionOffers.filter(
            (offer) => offer.actionId !== transfigureAction.id,
          ),
        },
      },
    };
    expect(
      provider.hasVisibleTransfigurationReward(
        withoutTransfigurationOffer,
        site,
      ),
    ).toBe(false);

    const resolved: JourneyState = {
      ...journey,
      siteRuntime: {
        [site.id]: {
          ...runtime,
          resolution: {
            actionId: ordinaryAction.id,
            gainedCardIds: [],
            gainedDreamsignIds: [],
            purgedCardIds: [],
            affectedEntryIds: [],
            essenceGained: 1,
          },
        },
      },
    };
    expect(provider.hasVisibleTransfigurationReward(resolved, site)).toBe(false);
  });
});
