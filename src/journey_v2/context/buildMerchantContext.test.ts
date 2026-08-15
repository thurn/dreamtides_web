import { describe, expect, it } from "vitest";
import { buildMerchantContext } from "./buildMerchantContext";
import {
  TEST_CARD_UUIDS,
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsign,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestJourneyState,
  makeMerchantTestResolvedPackage,
  makeMerchantTestSite,
} from "../testing/fixtures";
import { parseDeckEntryId } from "../../types/identifiers";
import { testDreamsignId, testCardId } from "../../types/test-identities";

describe("buildMerchantContext", () => {
  it("indexes all catalog cards with UUIDs", () => {
    const ordinaryCard = makeMerchantTestCard({
      id: testCardId(TEST_CARD_UUIDS.ordinary),
      cardNumber: 101,
    });
    const deckCard = makeMerchantTestCard({
      id: testCardId(TEST_CARD_UUIDS.deckCopy),
      cardNumber: 102,
    });

    const context = buildMerchantContext({
      journeyState: makeMerchantTestJourneyState(),
      journeyContent: makeMerchantTestContent({
        cards: [ordinaryCard, deckCard],
      }),
      site: makeMerchantTestSite(),
    });

    expect(context.cardByUuid.get(testCardId(TEST_CARD_UUIDS.ordinary))).toBe(
      ordinaryCard,
    );
    expect(context.cardByUuid.get(testCardId(TEST_CARD_UUIDS.deckCopy))).toBe(
      deckCard,
    );
  });

  it("projects deck entries to concrete entry ids and card UUIDs", () => {
    const deckCard = makeMerchantTestCard({
      id: testCardId(TEST_CARD_UUIDS.deckCopy),
      cardNumber: 201,
    });
    const deckEntry = makeMerchantTestDeckEntry({
      entryId: parseDeckEntryId("entry-201-a"),
      cardNumber: deckCard.cardNumber,
    });

    const context = buildMerchantContext({
      journeyState: makeMerchantTestJourneyState({ deck: [deckEntry] }),
      journeyContent: makeMerchantTestContent({ cards: [deckCard] }),
      site: makeMerchantTestSite(),
    });

    expect(context.deckCards).toEqual([
      expect.objectContaining({
        entryId: parseDeckEntryId("entry-201-a"),
        cardNumber: deckCard.cardNumber,
        cardUuid: TEST_CARD_UUIDS.deckCopy,
      }),
    ]);
    expect(context.deckEntryById.get(parseDeckEntryId("entry-201-a"))).toEqual(
      expect.objectContaining({
        entryId: parseDeckEntryId("entry-201-a"),
        cardUuid: TEST_CARD_UUIDS.deckCopy,
      }),
    );
  });

  it("skips deck entries whose card records are missing", () => {
    const context = buildMerchantContext({
      journeyState: makeMerchantTestJourneyState({
        deck: [
          makeMerchantTestDeckEntry({
            entryId: parseDeckEntryId("entry-missing-card"),
            cardNumber: 999,
          }),
        ],
      }),
      journeyContent: makeMerchantTestContent({ cards: [] }),
      site: makeMerchantTestSite(),
    });

    expect(context.deckCards).toEqual([]);
    expect(context.deckEntryById.has(parseDeckEntryId("entry-missing-card"))).toBe(
      false,
    );
  });

  it("excludes starter and special cards from grant candidates", () => {
    const ordinaryCard = makeMerchantTestCard({
      id: testCardId(TEST_CARD_UUIDS.ordinary),
      cardNumber: 301,
    });
    const starterFlagCard = makeMerchantTestCard({
      id: testCardId(TEST_CARD_UUIDS.starterFlag),
      cardNumber: 302,
      isStarter: true,
    });
    const starterRarityCard = makeMerchantTestCard({
      id: testCardId(TEST_CARD_UUIDS.starterRarity),
      cardNumber: 303,
      rarity: "Starter",
    });
    const specialRarityCard = makeMerchantTestCard({
      id: testCardId(TEST_CARD_UUIDS.specialRarity),
      cardNumber: 304,
      rarity: "Special",
    });

    const context = buildMerchantContext({
      journeyState: makeMerchantTestJourneyState(),
      journeyContent: makeMerchantTestContent({
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
      id: testCardId(TEST_CARD_UUIDS.ordinary),
      cardNumber: 305,
    });

    const context = buildMerchantContext({
      journeyState: makeMerchantTestJourneyState(),
      journeyContent: makeMerchantTestContent({ cards: [ordinaryCard] }),
      site: makeMerchantTestSite(),
    });

    expect(context.candidateGrantCards.map((card) => card.cardUuid)).toEqual([
      TEST_CARD_UUIDS.ordinary,
    ]);
  });

  it("includes ordinary catalog cards outside the run pool", () => {
    const inPoolCard = makeMerchantTestCard({
      id: testCardId(TEST_CARD_UUIDS.ordinary),
      cardNumber: 401,
    });
    const outsidePoolCard = makeMerchantTestCard({
      id: testCardId(TEST_CARD_UUIDS.outsidePool),
      cardNumber: 402,
    });
    const inPoolStarterCard = makeMerchantTestCard({
      id: testCardId(TEST_CARD_UUIDS.starterRarity),
      cardNumber: 403,
      rarity: "Starter",
    });
    const inPoolSpecialCard = makeMerchantTestCard({
      id: testCardId(TEST_CARD_UUIDS.specialRarity),
      cardNumber: 404,
      rarity: "Special",
    });

    const context = buildMerchantContext({
      journeyState: makeMerchantTestJourneyState({
        resolvedPackage: makeMerchantTestResolvedPackage({
          draftPoolCopiesByCard: {
            [String(inPoolCard.cardNumber)]: 1,
            [String(inPoolStarterCard.cardNumber)]: 1,
            [String(inPoolSpecialCard.cardNumber)]: 1,
          },
        }),
      }),
      journeyContent: makeMerchantTestContent({
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
    const heldDreamsignId = testDreamsignId("sign-held");
    const openDreamsignId = testDreamsignId("sign-open");
    const heldTemplate = makeMerchantTestDreamsignTemplate({
      id: heldDreamsignId,
    });
    const openTemplate = makeMerchantTestDreamsignTemplate({
      id: openDreamsignId,
    });

    const context = buildMerchantContext({
      journeyState: makeMerchantTestJourneyState({
        dreamsigns: [
          makeMerchantTestDreamsign({ id: heldDreamsignId }),
        ],
      }),
      journeyContent: makeMerchantTestContent({
        cards: [],
        dreamsignTemplates: [heldTemplate, openTemplate],
      }),
      site: makeMerchantTestSite(),
    });

    expect(context.heldDreamsignIds).toEqual(new Set([heldDreamsignId]));
    expect(context.heldDreamsignFallbackNames).toEqual(new Set());
    expect(context.candidateDreamsigns).toEqual([openTemplate]);
  });

  it("keeps name fallback separate for held Dreamsigns missing ids", () => {
    const heldNameTemplate = makeMerchantTestDreamsignTemplate({
      id: testDreamsignId("sign-held-name"),
      name: "Shared Name",
    });
    const openTemplate = makeMerchantTestDreamsignTemplate({
      id: testDreamsignId("sign-open"),
    });

    const context = buildMerchantContext({
      journeyState: makeMerchantTestJourneyState({
        dreamsigns: [
          makeMerchantTestDreamsign({
            id: undefined,
            name: "Shared Name",
          }),
        ],
      }),
      journeyContent: makeMerchantTestContent({
        cards: [],
        dreamsignTemplates: [heldNameTemplate, openTemplate],
      }),
      site: makeMerchantTestSite(),
    });

    expect(context.heldDreamsignIds).toEqual(new Set());
    expect(context.heldDreamsignFallbackNames).toEqual(
      new Set(["Shared Name"]),
    );
    expect(context.candidateDreamsigns).toEqual([openTemplate]);
  });
});
