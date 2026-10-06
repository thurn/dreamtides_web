import { describe, expect, it } from "vitest";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { stableDigest } from "../../reward-selection/stable";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";

expect.addEqualityTesters([annotatedTextEquality]);
import { parseCardName } from "../../types/card-identity";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../../testing/atlas-fixtures";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import { transfigurationFormFixture } from "../../testing/transfiguration-fixture";
import type {
  AuguryChoiceCandidate,
  AuguryContext,
  AuguryDeckCard,
  AuguryEncounter,
  AuguryGameObject,
  AuguryOffer,
} from "../../journey_v2/types";
import {
  makeAuguryTestCard,
  makeAuguryTestContent,
  makeAuguryTestDeckEntry,
  makeAuguryTestJourneyState,
  makeAuguryTestSite,
} from "../../journey_v2/testing/fixtures";
import {
  buildAuguryAcceptRequest,
  buildAuguryOfferViews,
  buildAugurySiteModel,
} from "./augury-view-model";
import type { ChoiceId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import { parseOfferId } from "../../types/identifiers";
import { parseChoiceId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseAuguryTargetKey } from "../../types/identifiers";
import type { DreamGuideContent } from "../../types/content";
import { makeTestPoolContext } from "../../testing/pool-context";
import {
  testCardId,
  testDreamscapeId,
  testGuideArtKey,
  testGuideId,
  testTideId,
} from "../../types/test-identities";

const PACKAGE_TIDE_ID = testTideId(
  "f7072be7-f12b-482a-b9e1-4d3925622eb2",
);

const card = makeAuguryTestCard({
  id: testCardId("81000000-0000-4000-8000-000000000012"),
  cardNumber: 12,
  name: parseCardName("Fixture Gift"),
});

function candidate(choiceId: ChoiceId): AuguryChoiceCandidate {
  return {
    choiceId,
    gameObjects: [
      {
        objectType: "catalogCard",
        cardUuid: card.id,
        cardNumber: card.cardNumber,
        card,
        displayName: card.name,
      },
    ],
    applyPayload: {
      kind: "add_catalog_card",
      cardUuid: card.id,
      cardNumber: card.cardNumber,
    },
  };
}

function chooserOffer(): AuguryOffer {
  return {
    offerId: parseOfferId("A"),
    encounterSignature: stableDigest("encounter-fixture"),
    archetypeId: "fit_card_draft",
    family: "grant",
    targetKey: parseAuguryTargetKey("fixture-target"),
    gameObjects: [],
    choiceRequest: {
      choiceType: "catalogCard",
      candidates: [
        candidate(parseChoiceId("choice-1")),
        candidate(parseChoiceId("choice-2")),
        candidate(parseChoiceId("choice-3")),
        candidate(parseChoiceId("choice-4")),
      ],
    },
  };
}

function directOffer(): AuguryOffer {
  return {
    offerId: parseOfferId("B"),
    encounterSignature: stableDigest("encounter-fixture"),
    archetypeId: "strong_card",
    family: "grant",
    targetKey: parseAuguryTargetKey(card.id),
    gameObjects: [candidate(parseChoiceId("direct")).gameObjects[0]],
    applyPayload: {
      kind: "add_catalog_card",
      cardUuid: card.id,
      cardNumber: card.cardNumber,
    },
  };
}

function encounter(): AuguryEncounter {
  return {
    encounterSignature: stableDigest("encounter-fixture"),
    siteId: parseSiteId("site-fixture"),
    offers: [chooserOffer(), directOffer()],
  };
}

const mappingCards = [1, 2, 3, 4, 5].map((index) =>
  makeAuguryTestCard({
    id: testCardId(`82000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
    cardNumber: 100 + index,
    name: parseCardName(`Mapping Fixture ${String(index)}`),
    subtype: "Warrior",
    reclaimCost: index === 1 ? 3 : null,
  }),
);

function catalogObject(
  index: number,
): Extract<AuguryGameObject, { objectType: "catalogCard" }> {
  const value = mappingCards[index];
  return {
    objectType: "catalogCard",
    cardUuid: value.id,
    cardNumber: value.cardNumber,
    card: value,
    displayName: value.name,
  };
}

function mappedDeckObject(
  index: number,
  entryId: DeckEntryId,
): AuguryDeckCard {
  const mappedCard = mappingCards[index];
  const deckEntry = makeAuguryTestDeckEntry({
    entryId,
    cardNumber: mappedCard.cardNumber,
  });
  return {
    objectType: "deckCard",
    entryId: deckEntry.entryId,
    deckEntry,
    cardUuid: mappedCard.id,
    cardNumber: mappedCard.cardNumber,
    card: mappedCard,
    displayName: mappedCard.name,
  };
}

const deckObject = mappedDeckObject(0, parseDeckEntryId("entry-fixture"));

const mappingContext = {
  atlasData: MINIMAL_ATLAS_DATA,
  sitesData: MINIMAL_SITES_DATA,
  candidateGrantCards: mappingCards
    .slice(0, 4)
    .map((_unused, index) => catalogObject(index)),
  deckCards: [deckObject],
  deckEntryById: new Map([[deckObject.entryId, deckObject]]),
  cardByUuid: new Map(mappingCards.map((value) => [value.id, value])),
  draftPoolCardUuids: new Set(mappingCards.map((value) => value.id)),
  rewardSelection: {
    tuning: CONFIG_DATA_FIXTURE.rewardSelectionData.tuning,
    content: { auguryData: CONFIG_DATA_FIXTURE.auguryData },
  },
} as unknown as AuguryContext;

const GUIDE = {
  id: testGuideId("fixture-augury-guide"),
  name: "Fixture Augury Guide",
  homeDreamscapeId: testDreamscapeId("fixture-home"),
  siteType: "Augury",
  portraitSource: "fixture-guide.png",
  artKey: testGuideArtKey("fixture-guide"),
  headTargetX: 0.6,
  dialogue: { site: ["Fixture line."] },
  homeSpecialty: "Fixture specialty.",
} satisfies DreamGuideContent;

function mappingContentWithTide() {
  const poolContext = makeTestPoolContext();
  return {
    ...makeAuguryTestContent({ cards: mappingCards }),
    poolContext: {
      ...poolContext,
      poolData: {
        ...poolContext.poolData,
        tides4Decks: {
          version: 2 as const,
          selection: { bandFraction: 0.25, bandMinimum: 5 },
          tides: [
            {
              id: PACKAGE_TIDE_ID,
              displayName: "Harvest of the Fallen",
              displayDescription: "Fixture package.",
              auguryPackageReference: "Harvest of the Fallen package",
              role: "signature" as const,
              resonance: "shadow" as const,
              cards: mappingCards.slice(0, 4).map((value) => ({
                id: value.id,
                copies: 2,
              })),
            },
          ],
          tidePoolByAvatar: {},
        },
      },
    },
  };
}

function fourCandidates(payloadCopies = 1): AuguryChoiceCandidate[] {
  return mappingCards.slice(0, 4).map((_unused, index) => {
    const object = catalogObject(index);
    const add = {
      kind: "add_catalog_card" as const,
      cardUuid: object.cardUuid,
      cardNumber: object.cardNumber,
    };
    return {
      choiceId: parseChoiceId(`mapping-choice-${String(index)}`),
      gameObjects: [object],
      applyPayload:
        payloadCopies === 1
          ? add
          : {
              kind: "composite",
              children: Array.from({ length: payloadCopies }, () => add),
            },
    };
  });
}

function mappedOffer(
  archetypeId: AuguryOffer["archetypeId"],
  overrides: Partial<AuguryOffer>,
): AuguryOffer {
  return {
    offerId: parseOfferId("A"),
    encounterSignature: stableDigest("mapping-encounter"),
    archetypeId,
    family: "grant",
    targetKey: parseAuguryTargetKey("fixture"),
    gameObjects: [],
    ...overrides,
  };
}

const choiceRequest = (
  candidates: AuguryChoiceCandidate[],
  choiceType: "catalogCard" | "dreamsign" | "replacementCard" = "catalogCard",
) => ({
  choiceType,
  candidates,
});

describe("augury view model", () => {
  const context = {
    deckEntryById: new Map(),
    sitesData: MINIMAL_SITES_DATA,
    rewardSelection: {
      tuning: CONFIG_DATA_FIXTURE.rewardSelectionData.tuning,
      content: { auguryData: CONFIG_DATA_FIXTURE.auguryData },
    },
  } as unknown as AuguryContext;

  it("preserves card UUID identity and candidate choice ids", () => {
    const offers = buildAuguryOfferViews(encounter(), context);
    const chooser = offers[0];
    if (chooser?.visual.kind !== "cardChoices") {
      throw new Error("expected card choices");
    }

    expect(chooser.visual.choices.map((choice) => choice.id)).toEqual([
      "choice-1",
      "choice-2",
      "choice-3",
      "choice-4",
    ]);
    expect(chooser.visual.choices[0]?.card.model.cardId).toBe(card.id);
  });

  it("keeps the original card plain and the transfigured result marked", () => {
    const previewCard = {
      ...mappingCards[0],
      renderedText: "Changed fixture text.",
    };
    const transfiguration = {
      type: "Empowered" as const,
      form: transfigurationFormFixture("Empowered"),
      markedText: "Changed fixture text.",
      energyChanged: true,
      energyChangeName: "Fixture energy form",
      sparkChanged: false,
      sparkChangeName: null,
      fastChanged: false,
    };
    const transfiguredObject = {
      ...deckObject,
      previewCard,
      transfiguration,
    };
    const offer = mappedOffer("transfigure", {
      gameObjects: [transfiguredObject],
      applyPayload: {
        kind: "transfigure_deck_entry",
        entryId: deckObject.entryId,
        cardUuid: deckObject.cardUuid,
        cardNumber: deckObject.cardNumber,
        transfiguration: "Empowered",
        previewCard,
        description: "Fixture",
      },
    });
    const offers = buildAuguryOfferViews(
      { ...encounter(), offers: [offer, directOffer()] },
      mappingContext,
    );
    const visual = offers[0]?.visual;
    if (visual?.kind !== "beforeAfter") {
      throw new Error("expected a before/after transfiguration");
    }

    expect(visual.pairs[0]?.before.model.transfiguration).toBeUndefined();
    expect(visual.pairs[0]?.after.model.transfiguration).toEqual(
      transfiguration,
    );
    expect(visual.pairs[0]?.after.model.displaySnapshot.renderedText).toBe(
      "Changed fixture text.",
    );
  });

  it("builds the persisted accept request from stable offer and choice ids", () => {
    expect(
      buildAuguryAcceptRequest(
        encounter(),
        parseOfferId("A"),
        parseChoiceId("choice-2"),
      ),
    ).toEqual({
      encounterSignature: stableDigest("encounter-fixture"),
      offerId: parseOfferId("A"),
      archetypeId: "fit_card_draft",
      choice: { choiceId: parseChoiceId("choice-2") },
    });
  });

  it("keeps a persisted tide-package category reroll in the offer state", () => {
    const site = makeAuguryTestSite({
      id: parseSiteId("site-augury-tide-reroll"),
      type: "Augury",
    });
    const packageOffer = mappedOffer("category_draft_known", {
      targetKey: parseAuguryTargetKey(
        `tide:${PACKAGE_TIDE_ID}:${mappingCards
          .slice(0, 4)
          .map((value) => value.id)
          .join(",")}`,
      ),
      choiceRequest: choiceRequest(fourCandidates()),
    });
    const persistedEncounter = {
      ...encounter(),
      siteId: site.id,
      offers: [packageOffer, directOffer()],
    };
    const state = makeAuguryTestJourneyState({
      siteRuntime: {
        [site.id]: {
          kind: "augury",
          completed: false,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          rerollNonce: 5,
          encounter: persistedEncounter,
        },
      },
    });

    const result = buildAugurySiteModel({
      state,
      sceneNode: null,
      site,
      journeyContent: mappingContentWithTide(),
      guide: GUIDE,
      guideLine: "Fixture line.",
    });

    expect(result.errorMessage).toBeNull();
    expect(result.encounter).toBe(persistedEncounter);
    expect(result.view.unavailableMessage).toBeNull();
    expect(result.view.offers[0]?.tile).toMatchObject({
      kind: "category-draft",
      category: { kind: "package" },
    });
  });
});
