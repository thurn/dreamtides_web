// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  testCardId,
  testAvatarId,
} from "../../types/test-identities";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import type { DraftState } from "../../types/draft";
import {
  buildPoolViewerView,
  DEFAULT_POOL_VIEWER_FILTERS,
} from "./pool-viewer-view-model";

describe("pool-viewer-view-model", () => {
  function card(
    idSeed: string,
    number: number,
    name: string,
    cardType: CardData["cardType"] = "Character",
  ): CardData {
    return {
      id: testCardId(idSeed),
      cardNumber: number,
      name: parseCardName(name),
      cardType,
      subtype: cardType === "Character" ? "Warrior" : "",
      isStarter: false,
      energyCost: number,
      spark: cardType === "Character" ? 1 : null,
      isFast: false,
      renderedText: `Rules for ${name}`,
      imageNumber: number,
      artOwned: true,
    };
  }

  const alpha = card("card-alpha", 1, "Shared Name");

  const beta = card("card-beta", 2, "Shared Name", "Event");

  const database = new Map([
    [1, alpha],
    [2, beta],
  ]);

  const poolState: DraftState = {
    mode: "tides4",
    draftPoolCopiesByCard: { "1": 2, "2": 1 },
    remainingCopiesByCard: { "1": 2, "2": 1 },
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
  };

  function build(
    overrides: Partial<Parameters<typeof buildPoolViewerView>[0]> = {},
  ) {
    return buildPoolViewerView({
      cardDatabase: database,
      draftState: poolState,
      resolvedPackage: null,
      poolVariant: null,
      tides4Provenance: null,
      source: "run",
      filters: DEFAULT_POOL_VIEWER_FILTERS,
      ...overrides,
    });
  }

  describe("buildPoolViewerView", () => {
    it("keeps duplicate display names distinct through UUID-backed stable entries", () => {
      const view = build();
      expect(view.cards.map((entry) => entry.model.cardId)).toEqual([
        alpha.id,
        beta.id,
      ]);
      expect(view.cards.map((entry) => entry.entryId)).toEqual([
        `run:${alpha.id}`,
        `run:${beta.id}`,
      ]);
    });

    it("filters deterministically without changing entry identity", () => {
      const view = build({
        filters: {
          ...DEFAULT_POOL_VIEWER_FILTERS,
          type: "event",
          query: "shared",
        },
      });
      expect(view.cards).toHaveLength(1);
      expect(view.cards[0]?.entryId).toBe(`run:${beta.id}`);
    });

    it("maps catalog and signature sources without display-name identity", () => {
      const resolvedPackage = {
        avatar: {
          id: testAvatarId("dc"),
          name: "Fixture",
          title: "",
          renderedText: "",
          imageNumber: "1",
          startingEssence: 0,
          signatureCardIds: [beta.id],
        },
        draftPoolCopiesByCard: {},
        dreamsignPoolIds: [],
        mandatoryOnlyPoolSize: 0,
        draftPoolSize: 0,
        doubledCardCount: 0,
        legalSubsetCount: 0,
        preferredSubsetCount: 0,
      };
      expect(
        build({ source: "catalog" }).cards.map((item) => item.model.cardId),
      ).toEqual([alpha.id, beta.id]);
      expect(
        build({ source: "signature", resolvedPackage }).cards[0]?.model.cardId,
      ).toBe(beta.id);
    });

  });
});
