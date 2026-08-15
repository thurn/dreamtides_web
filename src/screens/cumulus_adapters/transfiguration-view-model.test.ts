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
  TransfigurationType,
} from "../../types/journey";
import {
  buildTransfigurationCandidates as buildTransfigurationCandidatesImpl,
  buildTransfigurationSiteView as buildTransfigurationSiteViewImpl,
} from "./transfiguration-view-model";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";

const transfigurationData = transfigurationFixture();
const buildTransfigurationCandidates = (
  ...args: Parameters<
    typeof buildTransfigurationCandidatesImpl
  > extends readonly [unknown, ...infer Rest]
    ? Rest
    : never
) => buildTransfigurationCandidatesImpl(transfigurationData, ...args);
const buildTransfigurationSiteView = (
  params: Omit<
    Parameters<typeof buildTransfigurationSiteViewImpl>[0],
    "transfigurationData"
  >,
) => buildTransfigurationSiteViewImpl({ ...params, transfigurationData });

const GUIDE = {
  id: testGuideId("fixture-transfiguration-guide"),
  name: "Fixture Transfiguration Guide",
  homeDreamscapeId: testDreamscapeId("fixture-home"),
  siteType: "Transfiguration",
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

function offer(entryId: DeckEntryId, type: TransfigurationType, cost: number) {
  return {
    entryId,
    type,
    effectDescription: `${type} fixture effect.`,
    effectDetails: { fixture: type },
    previewCard: makeCard(Number(entryId.replace("entry-", ""))),
    essenceCost: cost,
  };
}

function runtime(): CardChoiceSiteRuntime {
  return {
    kind: "cardChoice",
    choiceKind: "transfiguration",
    entryIds: [
      parseDeckEntryId("entry-1"),
      parseDeckEntryId("entry-2"),
      parseDeckEntryId("entry-3"),
      parseDeckEntryId("entry-4"),
    ],
    acceptedEntryIds: [],
    transfigurationOffers: [
      offer(parseDeckEntryId("entry-1"), "Empowered", 40),
      offer(parseDeckEntryId("entry-1"), "Kindled", 70),
      offer(parseDeckEntryId("entry-2"), "Amplified", 20),
      offer(parseDeckEntryId("entry-3"), "Resonant", 30),
      offer(parseDeckEntryId("entry-4"), "Perfected", 50),
    ],
  };
}

const site: SiteState = {
  id: parseSiteId("transfiguration-site"),
  type: "Transfiguration",
  isEnhanced: false,
  isVisited: false,
};

describe("buildTransfigurationCandidates", () => {
  it("groups form rows by concrete entry id, keeps UUID card identity, and caps the standard offer at three cards", () => {
    const state = {
      ...createDefaultState(),
      essence: 50,
      deck: [makeEntry(1), makeEntry(2), makeEntry(3), makeEntry(4)],
    };
    const cardDatabase = new Map(
      state.deck.map((entry) => [entry.cardNumber, makeCard(entry.cardNumber)]),
    );

    const candidates = buildTransfigurationCandidates(
      state,
      runtime(),
      cardDatabase,
      false,
    );

    expect(candidates.map((candidate) => candidate.entryId)).toEqual([
      "entry-1",
      "entry-2",
      "entry-3",
    ]);
    expect(candidates[0]?.model.cardId).toBe(cardDatabase.get(1)?.id);
    expect(candidates[0]?.forms.map((form) => form.type)).toEqual([
      "Empowered",
      "Kindled",
    ]);
    expect(candidates[0]?.forms.map((form) => form.affordable)).toEqual([
      true,
      false,
    ]);
    expect(candidates[0]?.forms[0]?.previewModel.transfiguration?.type).toBe(
      "Empowered",
    );
  });

  it("skips missing, already-transfigured, and form-less entries", () => {
    const state = {
      ...createDefaultState(),
      essence: 100,
      deck: [{ ...makeEntry(1), transfiguration: "Kindled" as const }],
    };
    expect(
      buildTransfigurationCandidates(
        state,
        runtime(),
        new Map([[1, makeCard(1)]]),
        false,
      ),
    ).toEqual([]);
  });

  it("shows the whole enhanced deck in deck order and keeps reforged cards as disabled context", () => {
    const state = {
      ...createDefaultState(),
      essence: 100,
      deck: [
        makeEntry(4),
        makeEntry(2),
        { ...makeEntry(5), transfiguration: "Kindled" as const },
        makeEntry(1),
        makeEntry(3),
      ],
    };
    const cardDatabase = new Map(
      state.deck.map((entry) => [entry.cardNumber, makeCard(entry.cardNumber)]),
    );

    const candidates = buildTransfigurationCandidates(
      state,
      runtime(),
      cardDatabase,
      true,
    );

    expect(candidates.map((candidate) => candidate.entryId)).toEqual([
      "entry-4",
      "entry-2",
      "entry-5",
      "entry-1",
      "entry-3",
    ]);
    expect(candidates.map((candidate) => candidate.availability)).toEqual([
      "available",
      "available",
      "reforged",
      "available",
      "available",
    ]);
    expect(candidates[2]).toMatchObject({
      reforgedType: "Kindled",
      forms: [],
    });
    expect(candidates[2]?.model.transfiguration?.type).toBe("Kindled");
  });
});

describe("buildTransfigurationSiteView", () => {
  it("projects the required authored guide and loading state", () => {
    const state = createDefaultState();
    const view = buildTransfigurationSiteView({
      state,
      sceneNode: null,
      site,
      runtime: null,
      cardDatabase: new Map(),
      guide: GUIDE,
      guideLine: assertLocalized("Fixture line."),
    });

    expect(view.siteId).toBe(site.id);
    expect(view.isEnhanced).toBe(false);
    expect(view.ready).toBe(false);
    expect(view.guide).toMatchObject({
      id: GUIDE.id,
      name: GUIDE.name,
    });
    expect(view.candidates).toEqual([]);
  });
});
import { assertLocalized } from "@trox/runtime";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import { testDreamscapeId, testGuideId, testCardId } from "../../types/test-identities";
