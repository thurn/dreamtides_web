import { describe, expect, it } from "vitest";
import { createDefaultState } from "../../state/journey-context";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import { asCardId, asCardName } from "../../types/card-identity";
import type {
  CardChoiceSiteRuntime,
  DeckEntry,
  SiteState,
} from "../../types/journey";
import {
  buildDuplicationCards as buildDuplicationCardsImpl,
  buildDuplicationOfferLog,
  buildDuplicationSiteView as buildDuplicationSiteViewImpl,
} from "./duplication-view-model";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";

const transfigurationData = transfigurationFixture();
const buildDuplicationCards = (
  ...args: Parameters<typeof buildDuplicationCardsImpl> extends readonly [unknown, ...infer Rest]
    ? Rest
    : never
) => buildDuplicationCardsImpl(transfigurationData, ...args);
const buildDuplicationSiteView = (
  params: Omit<Parameters<typeof buildDuplicationSiteViewImpl>[0], "transfigurationData">,
) => buildDuplicationSiteViewImpl({ ...params, transfigurationData });

const GUIDE = {
  id: "fixture-duplication-guide",
  name: "Fixture Duplication Guide",
  homeDreamscapeId: "fixture-home",
  siteType: "Duplication",
  portraitSource: "fixture-guide.png",
  dialogue: { site: ["Fixture line."] },
  homeSpecialty: "Fixture specialty.",
} satisfies DreamGuideContent;

function makeCard(cardNumber: number): CardData {
  return {
    name: asCardName(`Fixture ${String(cardNumber)}`),
    id: asCardId(
      `00000000-0000-4000-8000-${String(cardNumber).padStart(12, "0")}`,
    ),
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

describe("buildDuplicationOfferLog", () => {
  it("records persisted entry ids with canonical card UUIDs", () => {
    const state = {
      ...createDefaultState(),
      deck: [makeEntry(1), makeEntry(2)],
    };
    const cardDatabase = new Map([
      [1, makeCard(1)],
      [2, makeCard(2)],
    ]);

    expect(buildDuplicationOfferLog(state, runtime(), cardDatabase)).toEqual([
      { entryId: "entry-2", cardId: cardDatabase.get(2)?.id },
      { entryId: "entry-1", cardId: cardDatabase.get(1)?.id },
    ]);
  });
});

describe("buildDuplicationSiteView", () => {
  it("projects the required authored guide and exposes runtime state", () => {
    const state = createDefaultState();
    const view = buildDuplicationSiteView({
      state,
      sceneNode: null,
      site,
      runtime: runtime(["entry-1"]),
      cardDatabase: new Map(),
      guide: GUIDE,
      guideLine: "Fixture line.",
    });

    expect(view).toMatchObject({
      siteId: site.id,
      ready: true,
      alreadyAccepted: true,
      isEnhanced: true,
      guide: { id: GUIDE.id, name: GUIDE.name },
    });
  });

  it("represents a runtime still being prepared", () => {
    const view = buildDuplicationSiteView({
      state: createDefaultState(),
      sceneNode: null,
      site,
      runtime: null,
      cardDatabase: new Map(),
      guide: GUIDE,
      guideLine: "Fixture line.",
    });
    expect(view.ready).toBe(false);
    expect(view.cards).toEqual([]);
  });
});
