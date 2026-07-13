import { describe, expect, it } from "vitest";
import { createDefaultState } from "../../state/quest-context";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import type {
  CardChoiceSiteRuntime,
  DeckEntry,
  SiteState,
} from "../../types/quest";
import {
  buildDuplicationCards,
  buildDuplicationSiteView,
} from "./duplication-view-model";

function makeCard(cardNumber: number): CardData {
  return {
    name: asCardName(`Fixture ${String(cardNumber)}`),
    id: asCardId(`00000000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "Materialized: Gain 1 essence.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeEntry(cardNumber: number): DeckEntry {
  return {
    entryId: `entry-${String(cardNumber)}`,
    cardNumber,
    transfiguration: null,
    isBane: false,
  };
}

function runtime(acceptedEntryIds: string[] = []): CardChoiceSiteRuntime {
  return {
    kind: "cardChoice",
    choiceKind: "duplication",
    entryIds: ["entry-2", "missing-entry", "entry-1"],
    acceptedEntryIds,
  };
}

const site: SiteState = {
  id: "duplication-site",
  type: "Duplication",
  isEnhanced: true,
  isVisited: false,
};

describe("buildDuplicationCards", () => {
  it("preserves persisted concrete entry order and canonical UUID identity", () => {
    const state = {
      ...createDefaultState(),
      deck: [makeEntry(1), makeEntry(2)],
    };
    const cardDatabase = new Map([
      [1, makeCard(1)],
      [2, makeCard(2)],
    ]);

    const cards = buildDuplicationCards(state, runtime(), cardDatabase);

    expect(cards.map((card) => card.entryId)).toEqual(["entry-2", "entry-1"]);
    expect(cards.map((card) => card.model.cardId)).toEqual([
      cardDatabase.get(2)?.id,
      cardDatabase.get(1)?.id,
    ]);
  });

  it("skips entries whose card data cannot be resolved", () => {
    const state = {
      ...createDefaultState(),
      deck: [makeEntry(1), makeEntry(2)],
    };
    expect(
      buildDuplicationCards(state, runtime(), new Map([[1, makeCard(1)]])),
    ).toMatchObject([{ entryId: "entry-1" }]);
  });
});

describe("buildDuplicationSiteView", () => {
  it("builds Holt's guide fallback and exposes runtime state without production-data assertions", () => {
    const state = createDefaultState();
    const view = buildDuplicationSiteView({
      state,
      sceneNode: null,
      site,
      runtime: runtime(["entry-1"]),
      cardDatabase: new Map(),
      guide: null,
      guideLine: null,
    });

    expect(view).toMatchObject({
      siteId: site.id,
      ready: true,
      alreadyAccepted: true,
      isEnhanced: true,
      guide: { id: "deacon_holt", name: "Deacon Holt" },
    });
  });

  it("represents a runtime still being prepared", () => {
    const view = buildDuplicationSiteView({
      state: createDefaultState(),
      sceneNode: null,
      site,
      runtime: null,
      cardDatabase: new Map(),
      guide: null,
      guideLine: null,
    });
    expect(view.ready).toBe(false);
    expect(view.cards).toEqual([]);
  });
});
