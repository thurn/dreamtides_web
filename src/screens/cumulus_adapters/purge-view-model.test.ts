import { describe, expect, it } from "vitest";
import { createDefaultState } from "../../state/journey-context";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import { asCardId, asCardName } from "../../types/card-identity";
import { economyFixture } from "../../testing/economy-fixture";
import type { DeckEntry, SiteState } from "../../types/journey";
import {
  buildPurgeCardViews as buildPurgeCardViewsImpl,
  buildPurgeGuideView,
  buildPurgeSiteView as buildPurgeSiteViewImpl,
  buildPurgeVisitCosts,
} from "./purge-view-model";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";

const transfigurationData = transfigurationFixture();
const buildPurgeCardViews = (
  ...args: Parameters<typeof buildPurgeCardViewsImpl> extends readonly [unknown, ...infer Rest]
    ? Rest
    : never
) => buildPurgeCardViewsImpl(transfigurationData, ...args);
const buildPurgeSiteView = (
  params: Omit<Parameters<typeof buildPurgeSiteViewImpl>[0], "transfigurationData">,
) => buildPurgeSiteViewImpl({ ...params, transfigurationData });

const GUIDE = {
  id: "fixture-purge-guide",
  name: "Fixture Purge Guide",
  homeDreamscapeId: "fixture-home",
  siteType: "Purge",
  portraitSource: "fixture-guide.png",
  dialogue: { site: ["Fixture line."] },
  homeSpecialty: "Fixture specialty.",
} satisfies DreamGuideContent;

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: asCardName("Test Card"),
    id: asCardId("test-card"),
    cardNumber: 1,
    cardType: "Event",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Draw a card.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<DeckEntry> = {}): DeckEntry {
  return {
    entryId: "entry-1",
    cardNumber: 1,
    transfiguration: null,
    isBane: false,
    ...overrides,
  };
}

function database(...cards: CardData[]): Map<number, CardData> {
  return new Map(cards.map((card) => [card.cardNumber, card]));
}

const site: SiteState = {
  id: "site-purge",
  type: "Purge",
  isEnhanced: false,
  isVisited: false,
};

describe("buildPurgeCardViews", () => {
  it("keeps concrete entry ids and marks Nightmare as free", () => {
    const cards = buildPurgeCardViews(
      [
        makeEntry({ entryId: "paid", cardNumber: 1 }),
        makeEntry({ entryId: "nightmare", cardNumber: 10002, isBane: true }),
      ],
      database(makeCard({ cardNumber: 1 }), makeCard({ cardNumber: 10002 })),
    );

    expect(cards.map((card) => [card.entryId, card.purgeCostKind])).toEqual([
      ["paid", "paid"],
      ["nightmare", "free"],
    ]);
  });
});

describe("buildPurgeGuideView", () => {
  it("uses the resolved guide identity and supplied line", () => {
    const view = buildPurgeGuideView(
      {
        id: "takeshi",
        name: "Master Takeshi",
        homeDreamscapeId: "tsukiren",
        siteType: "Purge",
        portraitSource: "fixture-guide.png",
        dialogue: { site: ["First line."] },
        homeSpecialty: "Purge cards.",
      },
      "Chosen line.",
    );

    expect(view).toMatchObject({
      id: "takeshi",
      name: "Master Takeshi",
      line: "Chosen line.",
      art: { kind: "dream-guide", guideId: "takeshi" },
    });
  });
});

describe("buildPurgeSiteView", () => {
  it("caps paid selections by current essence and leaves free Nightmare selectable", () => {
    const base = createDefaultState();
    const state = {
      ...base,
      essence: 0,
      deck: [
        makeEntry({ entryId: "paid-a", cardNumber: 1 }),
        makeEntry({ entryId: "paid-b", cardNumber: 2 }),
        makeEntry({ entryId: "nightmare", cardNumber: 10002, isBane: true }),
      ],
    };

    const view = buildPurgeSiteView({
      state,
      sceneNode: null,
      site,
      cardDatabase: database(
        makeCard({ cardNumber: 1 }),
        makeCard({ cardNumber: 2 }),
        makeCard({ cardNumber: 10002 }),
      ),
      guide: GUIDE,
      guideLine: "Fixture line.",
      economyData: economyFixture(),
    });

    expect(view.maxPaidSelections).toBe(0);
    expect(
      view.cards.map((card) => [card.entryId, card.purgeCostKind]),
    ).toEqual([
      ["paid-a", "paid"],
      ["paid-b", "paid"],
      ["nightmare", "free"],
    ]);
  });

  it("builds a cost ladder from zero through the visit cap", () => {
    const costs = buildPurgeVisitCosts(economyFixture().purge, {
      isEnhanced: false,
      essenceDiscountPercent: 0,
    });

    expect(costs[0]).toBe(0);
    expect(costs.length).toBeGreaterThan(1);
    expect(costs[1]).toBeGreaterThan(0);
  });
});
