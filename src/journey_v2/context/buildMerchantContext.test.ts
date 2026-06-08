import { describe, expect, it } from "vitest";
import { buildMerchantContext } from "./buildMerchantContext";
import {
  TEST_CARD_UUIDS,
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsign,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestFitModel,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
} from "../testing/fixtures";

describe("buildMerchantContext", () => {
  it("indexes all catalog cards with UUIDs", () => {
    const ordinaryCard = makeMerchantTestCard({
      id: TEST_CARD_UUIDS.ordinary,
      cardNumber: 101,
    });
    const deckCard = makeMerchantTestCard({
      id: TEST_CARD_UUIDS.deckCopy,
      cardNumber: 102,
    });

    const context = buildMerchantContext({
      questState: makeMerchantTestQuestState(),
      questContent: makeMerchantTestContent({ cards: [ordinaryCard, deckCard] }),
      site: makeMerchantTestSite(),
    });

    expect(context.cardByUuid.get(TEST_CARD_UUIDS.ordinary)).toBe(ordinaryCard);
    expect(context.cardByUuid.get(TEST_CARD_UUIDS.deckCopy)).toBe(deckCard);
  });

  it("projects deck entries to concrete entry ids and card UUIDs", () => {
    const deckCard = makeMerchantTestCard({
      id: TEST_CARD_UUIDS.deckCopy,
      cardNumber: 201,
    });
    const deckEntry = makeMerchantTestDeckEntry({
      entryId: "entry-201-a",
      cardNumber: deckCard.cardNumber,
    });

    const context = buildMerchantContext({
      questState: makeMerchantTestQuestState({ deck: [deckEntry] }),
      questContent: makeMerchantTestContent({ cards: [deckCard] }),
      site: makeMerchantTestSite(),
    });

    expect(context.deckCards).toEqual([
      expect.objectContaining({
        entryId: "entry-201-a",
        cardNumber: deckCard.cardNumber,
        cardUuid: TEST_CARD_UUIDS.deckCopy,
      }),
    ]);
    expect(context.deckEntryById.get("entry-201-a")).toEqual(
      expect.objectContaining({
        entryId: "entry-201-a",
        cardUuid: TEST_CARD_UUIDS.deckCopy,
      }),
    );
  });

  it("skips deck entries whose card records are missing", () => {
    const context = buildMerchantContext({
      questState: makeMerchantTestQuestState({
        deck: [
          makeMerchantTestDeckEntry({
            entryId: "entry-missing-card",
            cardNumber: 999,
          }),
        ],
      }),
      questContent: makeMerchantTestContent({ cards: [] }),
      site: makeMerchantTestSite(),
    });

    expect(context.deckCards).toEqual([]);
    expect(context.deckEntryById.has("entry-missing-card")).toBe(false);
  });

  it("excludes starter and special cards from grant candidates", () => {
    const ordinaryCard = makeMerchantTestCard({
      id: TEST_CARD_UUIDS.ordinary,
      cardNumber: 301,
    });
    const starterFlagCard = makeMerchantTestCard({
      id: TEST_CARD_UUIDS.starterFlag,
      cardNumber: 302,
      isStarter: true,
    });
    const starterRarityCard = makeMerchantTestCard({
      id: TEST_CARD_UUIDS.starterRarity,
      cardNumber: 303,
      rarity: "Starter",
    });
    const specialRarityCard = makeMerchantTestCard({
      id: TEST_CARD_UUIDS.specialRarity,
      cardNumber: 304,
      rarity: "Special",
    });

    const context = buildMerchantContext({
      questState: makeMerchantTestQuestState(),
      questContent: makeMerchantTestContent({
        cards: [
          ordinaryCard,
          starterFlagCard,
          starterRarityCard,
          specialRarityCard,
        ],
      }),
      site: makeMerchantTestSite(),
    });

    expect(context.candidateGrantCards.map((card) => card.cardUuid)).toEqual([
      TEST_CARD_UUIDS.ordinary,
    ]);
  });

  it("excludes held Dreamsign ids from Dreamsign candidates", () => {
    const heldTemplate = makeMerchantTestDreamsignTemplate({ id: "sign-held" });
    const openTemplate = makeMerchantTestDreamsignTemplate({ id: "sign-open" });

    const context = buildMerchantContext({
      questState: makeMerchantTestQuestState({
        dreamsigns: [makeMerchantTestDreamsign({ id: "sign-held" })],
      }),
      questContent: makeMerchantTestContent({
        cards: [],
        dreamsignTemplates: [heldTemplate, openTemplate],
      }),
      site: makeMerchantTestSite(),
    });

    expect(context.heldDreamsignIds).toEqual(new Set(["sign-held"]));
    expect(context.candidateDreamsigns).toEqual([openTemplate]);
  });

  it("passes through FitModel data when present", () => {
    const fitModel = makeMerchantTestFitModel();

    const context = buildMerchantContext({
      questState: makeMerchantTestQuestState(),
      questContent: makeMerchantTestContent({ cards: [], fitModel }),
      site: makeMerchantTestSite(),
    });

    expect(context.fitModel).toBe(fitModel);
  });
});
