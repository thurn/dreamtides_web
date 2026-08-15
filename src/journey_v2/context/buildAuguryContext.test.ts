import { describe, expect, it } from "vitest";
import { buildAuguryContext } from "./buildAuguryContext";
import {
  TEST_CARD_UUIDS,
  makeAuguryTestCard,
  makeAuguryTestContent,
  makeAuguryTestDeckEntry,
  makeAuguryTestDreamsign,
  makeAuguryTestDreamsignTemplate,
  makeAuguryTestJourneyState,
  makeAuguryTestResolvedPackage,
  makeAuguryTestSite,
} from "../testing/fixtures";
import { parseDeckEntryId } from "../../types/identifiers";
import { testDreamsignId, testCardId } from "../../types/test-identities";

describe("buildAuguryContext", () => {
  it("indexes all catalog cards with UUIDs", () => {
    const ordinaryCard = makeAuguryTestCard({
      id: testCardId(TEST_CARD_UUIDS.ordinary),
      cardNumber: 101,
    });
    const deckCard = makeAuguryTestCard({
      id: testCardId(TEST_CARD_UUIDS.deckCopy),
      cardNumber: 102,
    });

    const context = buildAuguryContext({
      journeyState: makeAuguryTestJourneyState(),
      journeyContent: makeAuguryTestContent({
        cards: [ordinaryCard, deckCard],
      }),
      site: makeAuguryTestSite(),
    });

    expect(context.cardByUuid.get(testCardId(TEST_CARD_UUIDS.ordinary))).toBe(
      ordinaryCard,
    );
    expect(context.cardByUuid.get(testCardId(TEST_CARD_UUIDS.deckCopy))).toBe(
      deckCard,
    );
  });

  it("projects deck entries to concrete entry ids and card UUIDs", () => {
    const deckCard = makeAuguryTestCard({
      id: testCardId(TEST_CARD_UUIDS.deckCopy),
      cardNumber: 201,
    });
    const deckEntry = makeAuguryTestDeckEntry({
      entryId: parseDeckEntryId("entry-201-a"),
      cardNumber: deckCard.cardNumber,
    });

    const context = buildAuguryContext({
      journeyState: makeAuguryTestJourneyState({ deck: [deckEntry] }),
      journeyContent: makeAuguryTestContent({ cards: [deckCard] }),
      site: makeAuguryTestSite(),
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
    const context = buildAuguryContext({
      journeyState: makeAuguryTestJourneyState({
        deck: [
          makeAuguryTestDeckEntry({
            entryId: parseDeckEntryId("entry-missing-card"),
            cardNumber: 999,
          }),
        ],
      }),
      journeyContent: makeAuguryTestContent({ cards: [] }),
      site: makeAuguryTestSite(),
    });

    expect(context.deckCards).toEqual([]);
    expect(context.deckEntryById.has(parseDeckEntryId("entry-missing-card"))).toBe(
      false,
    );
  });

  it("excludes starter and special cards from grant candidates", () => {
    const ordinaryCard = makeAuguryTestCard({
      id: testCardId(TEST_CARD_UUIDS.ordinary),
      cardNumber: 301,
    });
    const starterFlagCard = makeAuguryTestCard({
      id: testCardId(TEST_CARD_UUIDS.starterFlag),
      cardNumber: 302,
      isStarter: true,
    });
    const starterRarityCard = makeAuguryTestCard({
      id: testCardId(TEST_CARD_UUIDS.starterRarity),
      cardNumber: 303,
      rarity: "Starter",
    });
    const specialRarityCard = makeAuguryTestCard({
      id: testCardId(TEST_CARD_UUIDS.specialRarity),
      cardNumber: 304,
      rarity: "Special",
    });

    const context = buildAuguryContext({
      journeyState: makeAuguryTestJourneyState(),
      journeyContent: makeAuguryTestContent({
        cards: [
          ordinaryCard,
          starterFlagCard,
          starterRarityCard,
          specialRarityCard,
        ],
      }),
      site: makeAuguryTestSite(),
    });

    expect(context.candidateGrantCards.map((card) => card.cardUuid)).toEqual([
      TEST_CARD_UUIDS.ordinary,
    ]);
  });

  it("uses loaded catalog cards for grant candidates without run pool data", () => {
    const ordinaryCard = makeAuguryTestCard({
      id: testCardId(TEST_CARD_UUIDS.ordinary),
      cardNumber: 305,
    });

    const context = buildAuguryContext({
      journeyState: makeAuguryTestJourneyState(),
      journeyContent: makeAuguryTestContent({ cards: [ordinaryCard] }),
      site: makeAuguryTestSite(),
    });

    expect(context.candidateGrantCards.map((card) => card.cardUuid)).toEqual([
      TEST_CARD_UUIDS.ordinary,
    ]);
  });

  it("includes ordinary catalog cards outside the run pool", () => {
    const inPoolCard = makeAuguryTestCard({
      id: testCardId(TEST_CARD_UUIDS.ordinary),
      cardNumber: 401,
    });
    const outsidePoolCard = makeAuguryTestCard({
      id: testCardId(TEST_CARD_UUIDS.outsidePool),
      cardNumber: 402,
    });
    const inPoolStarterCard = makeAuguryTestCard({
      id: testCardId(TEST_CARD_UUIDS.starterRarity),
      cardNumber: 403,
      rarity: "Starter",
    });
    const inPoolSpecialCard = makeAuguryTestCard({
      id: testCardId(TEST_CARD_UUIDS.specialRarity),
      cardNumber: 404,
      rarity: "Special",
    });

    const context = buildAuguryContext({
      journeyState: makeAuguryTestJourneyState({
        resolvedPackage: makeAuguryTestResolvedPackage({
          draftPoolCopiesByCard: {
            [String(inPoolCard.cardNumber)]: 1,
            [String(inPoolStarterCard.cardNumber)]: 1,
            [String(inPoolSpecialCard.cardNumber)]: 1,
          },
        }),
      }),
      journeyContent: makeAuguryTestContent({
        cards: [
          inPoolCard,
          outsidePoolCard,
          inPoolStarterCard,
          inPoolSpecialCard,
        ],
      }),
      site: makeAuguryTestSite(),
    });

    expect(context.candidateGrantCards.map((card) => card.cardUuid)).toEqual([
      TEST_CARD_UUIDS.ordinary,
      TEST_CARD_UUIDS.outsidePool,
    ]);
  });

  it("excludes held Dreamsign ids from Dreamsign candidates", () => {
    const heldDreamsignId = testDreamsignId("sign-held");
    const openDreamsignId = testDreamsignId("sign-open");
    const heldTemplate = makeAuguryTestDreamsignTemplate({
      id: heldDreamsignId,
    });
    const openTemplate = makeAuguryTestDreamsignTemplate({
      id: openDreamsignId,
    });

    const context = buildAuguryContext({
      journeyState: makeAuguryTestJourneyState({
        dreamsigns: [
          makeAuguryTestDreamsign({ id: heldDreamsignId }),
        ],
      }),
      journeyContent: makeAuguryTestContent({
        cards: [],
        dreamsignTemplates: [heldTemplate, openTemplate],
      }),
      site: makeAuguryTestSite(),
    });

    expect(context.heldDreamsignIds).toEqual(new Set([heldDreamsignId]));
    expect(context.heldDreamsignFallbackNames).toEqual(new Set());
    expect(context.candidateDreamsigns).toEqual([openTemplate]);
  });

  it("keeps name fallback separate for held Dreamsigns missing ids", () => {
    const heldNameTemplate = makeAuguryTestDreamsignTemplate({
      id: testDreamsignId("sign-held-name"),
      name: "Shared Name",
    });
    const openTemplate = makeAuguryTestDreamsignTemplate({
      id: testDreamsignId("sign-open"),
    });

    const context = buildAuguryContext({
      journeyState: makeAuguryTestJourneyState({
        dreamsigns: [
          makeAuguryTestDreamsign({
            id: undefined,
            name: "Shared Name",
          }),
        ],
      }),
      journeyContent: makeAuguryTestContent({
        cards: [],
        dreamsignTemplates: [heldNameTemplate, openTemplate],
      }),
      site: makeAuguryTestSite(),
    });

    expect(context.heldDreamsignIds).toEqual(new Set());
    expect(context.heldDreamsignFallbackNames).toEqual(
      new Set(["Shared Name"]),
    );
    expect(context.candidateDreamsigns).toEqual([openTemplate]);
  });
});
