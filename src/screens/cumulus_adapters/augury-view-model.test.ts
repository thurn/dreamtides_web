import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";
import { resolveSource } from "../../runtime/localization/runtime";

expect.addEqualityTesters([localizedStringSourceEquality]);
import { asCardId, asCardName } from "../../types/card-identity";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../../__test-helpers__/atlas-fixtures";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import { transfigurationFormFixture } from "../../testing/transfiguration-fixture";
import type {
  MerchantChoiceCandidate,
  MerchantContext,
  MerchantDeckCard,
  MerchantEncounter,
  MerchantGameObject,
  MerchantOffer,
} from "../../journey_v2/types";
import {
  makeMerchantTestCard,
  makeMerchantTestDeckEntry,
} from "../../journey_v2/testing/fixtures";
import {
  buildAuguryAcceptRequest,
  buildAuguryOfferTileModel,
  buildAuguryOfferViews,
  projectOfferTileCategory,
} from "./augury-view-model";
import {
  auguryOfferHeadline,
  offerTileDescription,
} from "../../cumulus/components/controls/offer-tile-descriptions";
import { auguryArchetype } from "../../data/augury-data";

const card = makeMerchantTestCard({
  id: asCardId("81000000-0000-4000-8000-000000000012"),
  cardNumber: 12,
  name: asCardName("Fixture Gift"),
});

function candidate(choiceId: string): MerchantChoiceCandidate {
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

function chooserOffer(): MerchantOffer {
  return {
    offerId: "A",
    encounterSignature: "encounter-fixture",
    archetypeId: "fit_card_draft",
    family: "grant",
    targetKey: "fixture-target",
    gameObjects: [],
    choiceRequest: {
      choiceType: "catalogCard",
      candidates: [
        candidate("choice-1"),
        candidate("choice-2"),
        candidate("choice-3"),
        candidate("choice-4"),
      ],
    },
  };
}

function directOffer(): MerchantOffer {
  return {
    offerId: "B",
    encounterSignature: "encounter-fixture",
    archetypeId: "strong_card",
    family: "grant",
    targetKey: card.id,
    gameObjects: [candidate("direct").gameObjects[0]],
    applyPayload: {
      kind: "add_catalog_card",
      cardUuid: card.id,
      cardNumber: card.cardNumber,
    },
  };
}

function encounter(): MerchantEncounter {
  return {
    encounterSignature: "encounter-fixture",
    siteId: "site-fixture",
    offers: [chooserOffer(), directOffer()],
  };
}

const mappingCards = [1, 2, 3, 4, 5].map((index) =>
  makeMerchantTestCard({
    id: asCardId(`82000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
    cardNumber: 100 + index,
    name: asCardName(`Mapping Fixture ${String(index)}`),
    subtype: "Warrior",
    reclaimCost: index === 1 ? 3 : null,
  }),
);

function catalogObject(
  index: number,
): Extract<MerchantGameObject, { objectType: "catalogCard" }> {
  const value = mappingCards[index];
  return {
    objectType: "catalogCard",
    cardUuid: value.id,
    cardNumber: value.cardNumber,
    card: value,
    displayName: value.name,
  };
}

function mappedDeckObject(index: number, entryId: string): MerchantDeckCard {
  const mappedCard = mappingCards[index];
  const deckEntry = makeMerchantTestDeckEntry({
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

const deckObject = mappedDeckObject(0, "entry-fixture");

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
  merchantCorpus: undefined,
  rewardSelection: {
    tuning: CONFIG_DATA_FIXTURE.rewardSelectionData.tuning,
    content: { auguryData: CONFIG_DATA_FIXTURE.auguryData },
  },
} as unknown as MerchantContext;

function fourCandidates(payloadCopies = 1): MerchantChoiceCandidate[] {
  return mappingCards.slice(0, 4).map((_unused, index) => {
    const object = catalogObject(index);
    const add = {
      kind: "add_catalog_card" as const,
      cardUuid: object.cardUuid,
      cardNumber: object.cardNumber,
    };
    return {
      choiceId: `mapping-choice-${String(index)}`,
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
  archetypeId: MerchantOffer["archetypeId"],
  overrides: Partial<MerchantOffer>,
): MerchantOffer {
  return {
    offerId: "A",
    encounterSignature: "mapping-encounter",
    archetypeId,
    family: "grant",
    targetKey: "fixture",
    gameObjects: [],
    ...overrides,
  };
}

const choiceRequest = (
  candidates: MerchantChoiceCandidate[],
  choiceType: "catalogCard" | "dreamsign" | "replacementCard" = "catalogCard",
) => ({
  choiceType,
  candidates,
});

function dreamsignObject(
  id: string,
): Extract<MerchantGameObject, { objectType: "dreamsign" }> {
  return {
    objectType: "dreamsign",
    dreamsignId: id,
    displayName: `Dreamsign ${id}`,
    dreamsignTemplate: {
      id,
      name: `Dreamsign ${id}`,
      effectDescription: "Fixture",
      imageName: `${id}.png`,
    },
  };
}

describe("augury view model", () => {
  const context = {
    deckEntryById: new Map(),
    sitesData: MINIMAL_SITES_DATA,
    rewardSelection: {
      tuning: CONFIG_DATA_FIXTURE.rewardSelectionData.tuning,
      content: { auguryData: CONFIG_DATA_FIXTURE.auguryData },
    },
  } as unknown as MerchantContext;

  it("maps both offers to short object-first views without production summaries", () => {
    const offers = buildAuguryOfferViews(encounter(), context);

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      id: "A",
      requiresSelection: true,
      tile: { kind: "card-draft" },
    });
    expect(offers[1]).toMatchObject({
      id: "B",
      requiresSelection: false,
      tile: { kind: "card-gift" },
    });
    expect(JSON.stringify(offers)).not.toContain("Production summary");
  });

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

  it("shows only the resulting starter card", () => {
    const previewCard = {
      ...mappingCards[0],
      renderedText: "Improved starter text.",
    };
    const offer = mappedOffer("starter_transfigure", {
      gameObjects: [{ ...deckObject, previewCard }],
      applyPayload: { kind: "composite", children: [] },
    });
    const offers = buildAuguryOfferViews(
      { ...encounter(), offers: [offer, directOffer()] },
      mappingContext,
    );
    const visual = offers[0]?.visual;
    if (visual?.kind !== "cards") {
      throw new Error("expected resulting starter cards");
    }

    expect(visual.cards).toHaveLength(1);
    expect(visual.cards[0]?.model.displaySnapshot.renderedText).toBe(
      "Improved starter text.",
    );
  });

  it("builds an added site as a canonical non-interactive site-node model", () => {
    const offer = mappedOffer("add_site", {
      family: "site",
      targetKey: "Shop",
      applyPayload: { kind: "add_site", siteType: "Shop" },
    });
    const offers = buildAuguryOfferViews(
      { ...encounter(), offers: [offer, directOffer()] },
      mappingContext,
    );
    const visual = offers[0]?.visual;
    if (visual?.kind !== "site") {
      throw new Error("expected a site preview");
    }

    expect(visual.model).toMatchObject({
      site: { type: "Shop", isVisited: false },
      isInteractive: false,
      label: "Card Shop",
    });
  });

  it("builds the persisted accept request from stable offer and choice ids", () => {
    expect(buildAuguryAcceptRequest(encounter(), "A", "choice-2")).toEqual({
      encounterSignature: "encounter-fixture",
      offerId: "A",
      archetypeId: "fit_card_draft",
      choice: { choiceId: "choice-2" },
    });
  });

  it("maps every merchant archetype to its strict Offer Tile category", () => {
    const drafts = fourCandidates();
    const dreamsigns = [dreamsignObject("sign-1"), dreamsignObject("sign-2")];
    const cases: readonly [MerchantOffer, string, string][] = [
      [
        mappedOffer("fit_card_grant", { gameObjects: [catalogObject(0)] }),
        "card-gift",
        "Gain a Card",
      ],
      [
        mappedOffer("fit_card_draft", { choiceRequest: choiceRequest(drafts) }),
        "card-draft",
        "Choose a Card",
      ],
      [
        mappedOffer("copies_draft", {
          choiceRequest: choiceRequest(fourCandidates(2)),
        }),
        "copies-draft",
        "Choose a Card",
      ],
      [
        mappedOffer("strong_card", { gameObjects: [catalogObject(0)] }),
        "card-gift",
        "Gain a Card",
      ],
      [
        mappedOffer("category_draft_known", {
          targetKey: `type:Character:${mappingCards
            .slice(0, 4)
            .map((value) => value.id)
            .join(",")}`,
          choiceRequest: choiceRequest(drafts),
        }),
        "category-draft",
        "Choose a Card",
      ],
      [
        mappedOffer("card_bundle", {
          gameObjects: [catalogObject(0), catalogObject(1)],
        }),
        "card-bundle",
        "Gain Two Cards",
      ],
      [
        mappedOffer("transfigured_draft", {
          choiceRequest: choiceRequest(drafts),
        }),
        "transfigured-draft",
        "Choose a Transfigured Card",
      ],
      [
        mappedOffer("transfigure", {
          gameObjects: [{ ...deckObject, previewCard: mappingCards[0] }],
          applyPayload: {
            kind: "transfigure_deck_entry",
            entryId: deckObject.entryId,
            cardUuid: deckObject.cardUuid,
            cardNumber: deckObject.cardNumber,
            transfiguration: "Empowered",
            previewCard: mappingCards[0],
            description: "Fixture",
          },
        }),
        "transfigure-card",
        "Transfigure a Card",
      ],
      [
        mappedOffer("starter_transfigure", {
          gameObjects: [{ ...deckObject, previewCard: mappingCards[0] }],
          applyPayload: { kind: "composite", children: [] },
        }),
        "transfigure-starters",
        "Transfigure Your Starters",
      ],
      [
        mappedOffer("purge", { gameObjects: [deckObject] }),
        "purge-card",
        "Purge a Card",
      ],
      [
        mappedOffer("duplicate", {
          choiceRequest: choiceRequest(drafts.slice(0, 3)),
        }),
        "duplicate-card",
        "Choose a Card",
      ],
      [
        mappedOffer("dreamsign", { gameObjects: [dreamsigns[0]] }),
        "dreamsign-gift",
        "Gain a Dreamsign",
      ],
      [
        mappedOffer("add_site", {
          family: "site",
          targetKey: "Shop",
          applyPayload: { kind: "add_site", siteType: "Shop" },
        }),
        "add-site",
        "Add a Site",
      ],
    ];

    for (const [offer, expectedKind] of cases) {
      const model = buildAuguryOfferTileModel(offer, mappingContext);
      expect(model.kind, offer.archetypeId).toBe(expectedKind);
      expect(model.id).toBe(`mapping-encounter:${offer.offerId}`);
      expect(
        auguryOfferHeadline(
          model,
          auguryArchetype(CONFIG_DATA_FIXTURE.auguryData, offer.archetypeId)
            .presentation,
        ),
        offer.archetypeId,
      ).not.toBe("");
    }
  });

  it("keeps display names semantic until localized offer formatting", () => {
    const purge = buildAuguryOfferTileModel(
      mappedOffer("purge", { gameObjects: [deckObject] }),
      mappingContext,
    );
    const formatted = offerTileDescription(
      purge,
      auguryArchetype(CONFIG_DATA_FIXTURE.auguryData, "purge").presentation,
    );

    const source = resolveSource(formatted);
    expect(source).not.toBe("");
    expect(source).toContain(deckObject.displayName);
  });

  it("rejects malformed fixed counts and resolves structured category and copy data", () => {
    const category = buildAuguryOfferTileModel(
      mappedOffer("category_draft_known", {
        targetKey: `type:Character:${mappingCards
          .slice(0, 4)
          .map((value) => value.id)
          .join(",")}`,
        choiceRequest: choiceRequest(fourCandidates()),
      }),
      mappingContext,
    );
    const copies = buildAuguryOfferTileModel(
      mappedOffer("copies_draft", {
        choiceRequest: choiceRequest(fourCandidates(2)),
      }),
      mappingContext,
    );
    expect(category).toMatchObject({
      kind: "category-draft",
      category: { kind: "character" },
    });
    expect(copies).toMatchObject({ kind: "copies-draft", copyCount: 2 });
    for (const count of [2, 3, 4]) {
      const model = buildAuguryOfferTileModel(
        mappedOffer("fit_card_draft", {
          choiceRequest: choiceRequest(fourCandidates().slice(0, count)),
        }),
        mappingContext,
      );
      expect(model.kind).toBe("card-draft");
      if (model.kind === "card-draft") expect(model.cards).toHaveLength(count);
    }
  });

  it("projects every generated category family to a semantic localization variant", () => {
    const cases = [
      ["type:Character", "Character", { kind: "character" }],
      ["type:Event", "Event", { kind: "event" }],
      ["cost:cheap", "cheap card", { kind: "cheap" }],
      ["cost:mid", "mid-cost card", { kind: "mid-cost" }],
      ["cost:big", "expensive card", { kind: "expensive" }],
      ["fast", "fast card", { kind: "fast" }],
      ["subtype:Ancient", "Ancient", { kind: "subtype", name: "Ancient" }],
      [
        "cluster:7",
        "Skull Weaver package",
        { kind: "package", name: "Skull Weaver package" },
      ],
    ] as const;

    for (const [id, label, expected] of cases) {
      expect(
        projectOfferTileCategory({
          id,
          label,
          memberUuids: [],
          deckAffine: false,
        }),
      ).toEqual(expected);
    }
  });
});
