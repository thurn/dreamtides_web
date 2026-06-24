import { describe, expect, it } from "vitest";
import { asCardId } from "../../types/card-identity";
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
  makeMerchantTestResolvedPackage,
  makeMerchantTestSite,
} from "../testing/fixtures";

describe("buildMerchantContext", () => {
  it("indexes all catalog cards with UUIDs", () => {
    const ordinaryCard = makeMerchantTestCard({
      id: asCardId(TEST_CARD_UUIDS.ordinary),
      cardNumber: 101,
    });
    const deckCard = makeMerchantTestCard({
      id: asCardId(TEST_CARD_UUIDS.deckCopy),
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
      id: asCardId(TEST_CARD_UUIDS.deckCopy),
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
      id: asCardId(TEST_CARD_UUIDS.ordinary),
      cardNumber: 301,
    });
    const starterFlagCard = makeMerchantTestCard({
      id: asCardId(TEST_CARD_UUIDS.starterFlag),
      cardNumber: 302,
      isStarter: true,
    });
    const starterRarityCard = makeMerchantTestCard({
      id: asCardId(TEST_CARD_UUIDS.starterRarity),
      cardNumber: 303,
      rarity: "Starter",
    });
    const specialRarityCard = makeMerchantTestCard({
      id: asCardId(TEST_CARD_UUIDS.specialRarity),
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

  it("uses loaded catalog cards for grant candidates without run pool data", () => {
    const ordinaryCard = makeMerchantTestCard({
      id: asCardId(TEST_CARD_UUIDS.ordinary),
      cardNumber: 305,
    });

    const context = buildMerchantContext({
      questState: makeMerchantTestQuestState(),
      questContent: makeMerchantTestContent({ cards: [ordinaryCard] }),
      site: makeMerchantTestSite(),
    });

    expect(context.candidateGrantCards.map((card) => card.cardUuid)).toEqual([
      TEST_CARD_UUIDS.ordinary,
    ]);
  });

  it("includes ordinary catalog cards outside the run pool", () => {
    const inPoolCard = makeMerchantTestCard({
      id: asCardId(TEST_CARD_UUIDS.ordinary),
      cardNumber: 401,
    });
    const outsidePoolCard = makeMerchantTestCard({
      id: asCardId(TEST_CARD_UUIDS.outsidePool),
      cardNumber: 402,
    });
    const inPoolStarterCard = makeMerchantTestCard({
      id: asCardId(TEST_CARD_UUIDS.starterRarity),
      cardNumber: 403,
      rarity: "Starter",
    });
    const inPoolSpecialCard = makeMerchantTestCard({
      id: asCardId(TEST_CARD_UUIDS.specialRarity),
      cardNumber: 404,
      rarity: "Special",
    });

    const context = buildMerchantContext({
      questState: makeMerchantTestQuestState({
        resolvedPackage: makeMerchantTestResolvedPackage({
          draftPoolCopiesByCard: {
            [String(inPoolCard.cardNumber)]: 1,
            [String(inPoolStarterCard.cardNumber)]: 1,
            [String(inPoolSpecialCard.cardNumber)]: 1,
          },
        }),
      }),
      questContent: makeMerchantTestContent({
        cards: [
          inPoolCard,
          outsidePoolCard,
          inPoolStarterCard,
          inPoolSpecialCard,
        ],
      }),
      site: makeMerchantTestSite(),
    });

    expect(context.candidateGrantCards.map((card) => card.cardUuid)).toEqual([
      TEST_CARD_UUIDS.ordinary,
      TEST_CARD_UUIDS.outsidePool,
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
    expect(context.heldDreamsignFallbackNames).toEqual(new Set());
    expect(context.candidateDreamsigns).toEqual([openTemplate]);
  });

  it("keeps name fallback separate for held Dreamsigns missing ids", () => {
    const heldNameTemplate = makeMerchantTestDreamsignTemplate({
      id: "sign-held-name",
      name: "Shared Name",
    });
    const openTemplate = makeMerchantTestDreamsignTemplate({ id: "sign-open" });

    const context = buildMerchantContext({
      questState: makeMerchantTestQuestState({
        dreamsigns: [
          makeMerchantTestDreamsign({
            id: undefined,
            name: "Shared Name",
          }),
        ],
      }),
      questContent: makeMerchantTestContent({
        cards: [],
        dreamsignTemplates: [heldNameTemplate, openTemplate],
      }),
      site: makeMerchantTestSite(),
    });

    expect(context.heldDreamsignIds).toEqual(new Set());
    expect(context.heldDreamsignFallbackNames).toEqual(new Set(["Shared Name"]));
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
