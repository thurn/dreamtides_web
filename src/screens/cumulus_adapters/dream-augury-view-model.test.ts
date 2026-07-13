import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type {
  MerchantChoiceCandidate,
  MerchantEncounter,
  MerchantOffer,
} from "../../journey_v2/types";
import { makeMerchantTestCard } from "../../journey_v2/testing/fixtures";
import {
  buildDreamAuguryAcceptRequest,
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
      candidates: [candidate("choice-1"), candidate("choice-2")],
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

describe("dream augury view model", () => {
  it("maps both offers to short object-first views without production summaries", () => {
    const offers = buildDreamAuguryOfferViews(encounter(), {
      deckEntryById: new Map(),
    });

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      id: "A",
      ordinal: "I",
      headline: "Choose a Card",
      requiresSelection: true,
    });
    expect(offers[1]).toMatchObject({
      id: "B",
      ordinal: "II",
      headline: "A New Card",
      requiresSelection: false,
    });
    expect(JSON.stringify(offers)).not.toContain("Production summary");
  });

  it("preserves card UUID identity and candidate choice ids", () => {
    const offers = buildDreamAuguryOfferViews(encounter(), {
      deckEntryById: new Map(),
    });
    const chooser = offers[0];
    if (chooser?.visual.kind !== "cardChoices") {
      throw new Error("expected card choices");
    }

    expect(chooser.visual.choices.map((choice) => choice.id)).toEqual([
      "choice-1",
      "choice-2",
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
});
