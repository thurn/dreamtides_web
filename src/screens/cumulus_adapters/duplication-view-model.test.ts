import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";

expect.addEqualityTesters([localizedStringSourceEquality]);
import { createDefaultState } from "../../state/journey-context";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import { parseCardName } from "../../types/card-identity";
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
  ...args: Parameters<typeof buildDuplicationCardsImpl> extends readonly [
    unknown,
    ...infer Rest,
  ]
    ? Rest
    : never
) => buildDuplicationCardsImpl(transfigurationData, ...args);
const buildDuplicationSiteView = (
  params: Omit<
    Parameters<typeof buildDuplicationSiteViewImpl>[0],
    "transfigurationData"
  >,
) => buildDuplicationSiteViewImpl({ ...params, transfigurationData });

const GUIDE = {
  id: testGuideId("fixture-duplication-guide"),
  name: "Fixture Duplication Guide",
  homeDreamscapeId: testDreamscapeId("fixture-home"),
  siteType: "Duplication",
  portraitSource: "fixture-guide.png",
  dialogue: { site: ["Fixture line."] },
  homeSpecialty: "Fixture specialty.",
} satisfies DreamGuideContent;

function makeCard(cardNumber: number): CardData {
  return {
    name: parseCardName(`Fixture ${String(cardNumber)}`),
    id: testCardId(
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
    entryId: parseDeckEntryId(`entry-${String(cardNumber)}`),
    cardNumber,
    transfiguration: null,
    isBane: false,
  };
}

function runtime(acceptedEntryIds: DeckEntryId[] = []): CardChoiceSiteRuntime {
  return {
    kind: "cardChoice",
    choiceKind: "duplication",
    entryIds: [
      parseDeckEntryId("entry-2"),
      parseDeckEntryId("missing-entry"),
      parseDeckEntryId("entry-1"),
    ],
    acceptedEntryIds,
  };
}

const site: SiteState = {
  id: parseSiteId("duplication-site"),
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
    ).toMatchObject([{ entryId: parseDeckEntryId("entry-1") }]);
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
      { entryId: parseDeckEntryId("entry-2"), cardId: cardDatabase.get(2)?.id },
      { entryId: parseDeckEntryId("entry-1"), cardId: cardDatabase.get(1)?.id },
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
      runtime: runtime([parseDeckEntryId("entry-1")]),
      cardDatabase: new Map(),
      guide: GUIDE,
      guideLine: assertLocalized("Fixture line."),
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
      guideLine: assertLocalized("Fixture line."),
    });
    expect(view.ready).toBe(false);
    expect(view.cards).toEqual([]);
  });
});
import { assertLocalized } from "@trox/runtime";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import { testDreamscapeId, testGuideId, testCardId } from "../../types/test-identities";
