// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  testCardId,
  testExplorationActionId,
} from "../../types/test-identities";
import type { CardData } from "../../types/cards";
import type { SiteState } from "../../types/journey";
import { parseCardName } from "../../types/card-identity";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { parseSiteId } from "../../types/identifiers";
import {
  buildDraftTransfiguredOfferLog,
  buildDraftView as buildDraftViewImpl,
  resolveOfferCards,
  sortOfferCards,
} from "./draft-view-model";
import { draftOfferKey } from "../../data/draft-site-bootstrap";

describe("draft-view-model", () => {
  const buildDraftView = (
    params: Omit<
      Parameters<typeof buildDraftViewImpl>[0],
      "transfigurationData"
    >,
  ) =>
    buildDraftViewImpl({
      ...params,
      transfigurationData: transfigurationFixture(),
    });

  function card(
    overrides: Partial<CardData> & { cardNumber: number },
  ): CardData {
    return {
      name: parseCardName(`Card ${String(overrides.cardNumber)}`),
      id: testCardId(`card-${String(overrides.cardNumber)}`),
      cardType: "Character",
      subtype: "",
      isStarter: false,
      energyCost: 1,
      spark: 1,
      isFast: false,
      renderedText: "Text.",
      imageNumber: overrides.cardNumber,
      artOwned: false,
      ...overrides,
    };
  }

  function cardDatabase(cards: CardData[]): Map<number, CardData> {
    return new Map(cards.map((c) => [c.cardNumber, c]));
  }

  describe("sortOfferCards", () => {
    it("orders by energy cost ascending, then by name", () => {
      const cards = [
        card({ cardNumber: 3, energyCost: 2, name: parseCardName("Zephyr") }),
        card({ cardNumber: 1, energyCost: 1, name: parseCardName("Beacon") }),
        card({ cardNumber: 2, energyCost: 2, name: parseCardName("Anchor") }),
      ];
      expect(sortOfferCards(cards).map((c) => c.cardNumber)).toEqual([1, 2, 3]);
    });
  });

  describe("resolveOfferCards", () => {
    it("resolves numbers to cards and sorts them", () => {
      const db = cardDatabase([
        card({ cardNumber: 10, energyCost: 3 }),
        card({ cardNumber: 11, energyCost: 1 }),
      ]);
      expect(resolveOfferCards([10, 11], db).map((c) => c.cardNumber)).toEqual([
        11, 10,
      ]);
    });
  });

  describe("buildDraftView", () => {
    const DRAFT_SITE: SiteState = {
      id: parseSiteId("draft-site"),
      type: "Draft",
      isEnhanced: false,
      isVisited: false,
    };

    it("assembles the offer and a card-number key; null scene without a node", () => {
      const db = cardDatabase([
        card({ cardNumber: 5, energyCost: 2 }),
        card({ cardNumber: 6, energyCost: 1 }),
      ]);
      const view = buildDraftView({
        offerCardNumbers: [5, 6],
        cardDatabase: db,
        scene: null,
        site: DRAFT_SITE,
        sitePicksCompleted: 0,
        pickCount: 5,
      });
      expect(view.offer.map((c) => c.displaySnapshot.cardNumber)).toEqual([
        6, 5,
      ]);
      // The key is the offered card numbers (identity), not names.
      expect(view.offerKey).toBe(draftOfferKey([5, 6]));
      expect(view.scene).toBeNull();
    });

    it("derives the 1-indexed pick counter from picks completed and the site's total", () => {
      const view = buildDraftView({
        offerCardNumbers: [1],
        cardDatabase: cardDatabase([card({ cardNumber: 1 })]),
        scene: null,
        site: DRAFT_SITE,
        sitePicksCompleted: 2,
        pickCount: 5,
      });
      expect(view.pickNumber).toBe(3);
      expect(view.pickTotal).toBe(5);
    });

    it("renders and logs exact persisted transfigurations by offered card identity", () => {
      const view = buildDraftView({
        offerCardNumbers: [5, 6],
        offerTransfigurations: { "5": "Empowered", "6": "Kindled" },
        cardDatabase: cardDatabase([
          card({ cardNumber: 5, energyCost: 4 }),
          card({ cardNumber: 6, spark: 2 }),
        ]),
        scene: null,
        site: DRAFT_SITE,
        sitePicksCompleted: 0,
        pickCount: 5,
      });
      expect(view.offer.map((model) => model.transfiguration?.type)).toEqual([
        "Kindled",
        "Empowered",
      ]);
      expect(
        buildDraftTransfiguredOfferLog(view, {
          siteId: parseSiteId("exploration-site"),
          actionId: testExplorationActionId("exploration-action"),
        }),
      ).toEqual({
        sourceSiteId: parseSiteId("exploration-site"),
        sourceActionId: testExplorationActionId("exploration-action"),
        pickNumber: 1,
        cards: [
          { cardId: testCardId("card-6"), transfiguration: "Kindled" },
          { cardId: testCardId("card-5"), transfiguration: "Empowered" },
        ],
      });
    });
  });
});
