import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
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
  buildDreamAuguryAcceptRequest,
  buildDreamAuguryOfferTileModel,
  buildDreamAuguryOfferViews,
} from "./dream-augury-view-model";

const card = makeMerchantTestCard({
  id: asCardId("81000000-0000-4000-8000-000000000012"),
  cardNumber: 12,
  name: asCardName("Fixture Gift"),
});

function candidate(choiceId: string): MerchantChoiceCandidate {
  return {
    choiceId,
    title: "Fixture choice",
    summary: "Fixture summary",
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
    title: "Production copy may change",
    summary: "Production copy may also change",
    targetKey: "fixture-target",
    gameObjects: [],
    choiceRequest: {
      choiceType: "catalogCard",
      prompt: "Pick one",
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
    title: "Production title",
    summary: "Production summary",
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
    dialogue: { line: "Fixture dialogue", offerId: "A" },
    acceptReaction: "Fixture reaction",
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

function catalogObject(index: number): Extract<MerchantGameObject, { objectType: "catalogCard" }> {
  const value = mappingCards[index];
  return {
    objectType: "catalogCard",
    cardUuid: value.id,
    cardNumber: value.cardNumber,
    card: value,
    displayName: value.name,
  };
}

const deckEntry = makeMerchantTestDeckEntry({ entryId: "entry-fixture", cardNumber: mappingCards[0].cardNumber });
const deckObject: MerchantDeckCard = {
  objectType: "deckCard",
  entryId: deckEntry.entryId,
  deckEntry,
  cardUuid: mappingCards[0].id,
  cardNumber: mappingCards[0].cardNumber,
  card: mappingCards[0],
  displayName: mappingCards[0].name,
};

const mappingContext = {
  candidateGrantCards: mappingCards.slice(0, 4).map((_unused, index) => catalogObject(index)),
  deckCards: [deckObject],
  deckEntryById: new Map([[deckObject.entryId, deckObject]]),
  cardByUuid: new Map(mappingCards.map((value) => [value.id, value])),
  draftPoolCardUuids: new Set(mappingCards.map((value) => value.id)),
  merchantCorpus: undefined,
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
      title: "Fixture",
      summary: "Fixture",
      gameObjects: [object],
      applyPayload: payloadCopies === 1
        ? add
        : { kind: "composite", children: Array.from({ length: payloadCopies }, () => add) },
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
    title: "Fixture",
    summary: "Fixture",
    targetKey: "fixture",
    gameObjects: [],
    ...overrides,
  };
}

const choiceRequest = (candidates: MerchantChoiceCandidate[], choiceType: "catalogCard" | "dreamsign" | "replacementCard" = "catalogCard") => ({
  choiceType,
  prompt: "Fixture",
  candidates,
});

function dreamsignObject(id: string): Extract<MerchantGameObject, { objectType: "dreamsign" }> {
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

describe("dream augury view model", () => {
  const context = { deckEntryById: new Map() } as unknown as MerchantContext;

  it("maps both offers to short object-first views without production summaries", () => {
    const offers = buildDreamAuguryOfferViews(encounter(), context);

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      id: "A",
      headline: "Choose a Card",
      requiresSelection: true,
    });
    expect(offers[1]).toMatchObject({
      id: "B",
      headline: "A New Card",
      requiresSelection: false,
    });
    expect(JSON.stringify(offers)).not.toContain("Production summary");
  });

  it("preserves card UUID identity and candidate choice ids", () => {
    const offers = buildDreamAuguryOfferViews(encounter(), context);
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

  it("builds the persisted accept request from stable offer and choice ids", () => {
    expect(
      buildDreamAuguryAcceptRequest(encounter(), "A", "choice-2"),
    ).toEqual({
      encounterSignature: "encounter-fixture",
      offerId: "A",
      archetypeId: "fit_card_draft",
      choice: { choiceId: "choice-2" },
    });
  });

  it("maps every merchant archetype to its strict Offer Tile category", () => {
    const drafts = fourCandidates();
    const dreamsigns = [dreamsignObject("sign-1"), dreamsignObject("sign-2")];
    const cases: readonly [MerchantOffer, string][] = [
      [mappedOffer("fit_card_grant", { gameObjects: [catalogObject(0)] }), "card-gift"],
      [mappedOffer("fit_card_draft", { choiceRequest: choiceRequest(drafts) }), "card-draft"],
      [mappedOffer("copies_draft", { choiceRequest: choiceRequest(fourCandidates(2)) }), "copies-draft"],
      [mappedOffer("strong_card", { gameObjects: [catalogObject(0)] }), "card-gift"],
      [mappedOffer("category_draft_known", {
        targetKey: `type:Character:${mappingCards.slice(0, 4).map((value) => value.id).join(",")}`,
        choiceRequest: choiceRequest(drafts),
      }), "category-draft"],
      [mappedOffer("card_bundle", { gameObjects: [catalogObject(0), catalogObject(1)] }), "card-bundle"],
      [mappedOffer("transfigured_draft", { choiceRequest: choiceRequest(drafts) }), "transfigured-draft"],
      [mappedOffer("transfigure", {
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
      }), "transfigure-card"],
      [mappedOffer("starter_transfigure", {
        gameObjects: [{ ...deckObject, previewCard: mappingCards[0] }],
        applyPayload: { kind: "composite", children: [] },
      }), "transfigure-starters"],
      [mappedOffer("keyword_mod", {
        gameObjects: [{ ...deckObject, previewCard: { ...mappingCards[0], reclaimCost: 2 } }],
        applyPayload: {
          kind: "change_deck_entry_keywords",
          entryId: deckObject.entryId,
          cardUuid: deckObject.cardUuid,
          cardNumber: deckObject.cardNumber,
          keywords: { setReclaim: 2 },
        },
      }), "keyword-modification"],
      [mappedOffer("tribal_change", {
        gameObjects: [deckObject],
        applyPayload: {
          kind: "change_deck_entry_type",
          entryId: deckObject.entryId,
          cardUuid: deckObject.cardUuid,
          cardNumber: deckObject.cardNumber,
          typeChange: {
            predicateId: "fixture",
            cardType: "Character",
            subtype: "Survivor",
            label: "Fixture",
          },
        },
      }), "tribal-change"],
      [mappedOffer("purge", { gameObjects: [deckObject] }), "purge-card"],
      [mappedOffer("purge_replace", {
        gameObjects: [deckObject],
        choiceRequest: choiceRequest(drafts, "replacementCard"),
      }), "trade-card"],
      [mappedOffer("duplicate", {
        choiceRequest: choiceRequest(drafts.slice(0, 3)),
      }), "duplicate-card"],
      [mappedOffer("dreamsign", { gameObjects: [dreamsigns[0]] }), "dreamsign-gift"],
      [mappedOffer("dreamsign_draft", {
        choiceRequest: choiceRequest(
          dreamsigns.map((object, index) => ({
            choiceId: `sign-choice-${String(index)}`,
            title: "Fixture",
            summary: "Fixture",
            gameObjects: [object],
            applyPayload: {
              kind: "add_dreamsign",
              dreamsignId: object.dreamsignId,
              dreamsignTemplate: object.dreamsignTemplate,
            },
          })),
          "dreamsign",
        ),
      }), "dreamsign-draft"],
      [mappedOffer("add_site", {
        family: "site",
        targetKey: "Shop",
        applyPayload: { kind: "add_site", siteType: "Shop" },
      }), "add-site"],
    ];

    for (const [offer, expectedKind] of cases) {
      const model = buildDreamAuguryOfferTileModel(offer, mappingContext);
      expect(model.kind, offer.archetypeId).toBe(expectedKind);
      expect(model.id).toBe(`mapping-encounter:${offer.offerId}`);
    }
  });

  it("rejects malformed fixed counts and resolves structured category and copy data", () => {
    const category = buildDreamAuguryOfferTileModel(
      mappedOffer("category_draft_known", {
        targetKey: `type:Character:${mappingCards.slice(0, 4).map((value) => value.id).join(",")}`,
        choiceRequest: choiceRequest(fourCandidates()),
      }),
      mappingContext,
    );
    const copies = buildDreamAuguryOfferTileModel(
      mappedOffer("copies_draft", { choiceRequest: choiceRequest(fourCandidates(2)) }),
      mappingContext,
    );
    expect(category).toMatchObject({ kind: "category-draft", categoryName: "Character" });
    expect(copies).toMatchObject({ kind: "copies-draft", copyCount: 2 });
    expect(() => buildDreamAuguryOfferTileModel(
      mappedOffer("fit_card_draft", { choiceRequest: choiceRequest(fourCandidates().slice(0, 3)) }),
      mappingContext,
    )).toThrow(/requires 4 candidates/);
    expect(() => buildDreamAuguryOfferTileModel(
      mappedOffer("dreamsign_draft", {
        choiceRequest: choiceRequest([{
          choiceId: "one",
          title: "Fixture",
          summary: "Fixture",
          gameObjects: [dreamsignObject("one")],
          applyPayload: {
            kind: "add_dreamsign",
            dreamsignId: "one",
            dreamsignTemplate: dreamsignObject("one").dreamsignTemplate,
          },
        }], "dreamsign"),
      }),
      mappingContext,
    )).toThrow(/requires 2 to 4 candidates/);
  });
});
