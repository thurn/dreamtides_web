import { describe, it, expect } from "vitest";
import {
  extractDraftDebugInfo,
  extractPackageDebugInfo,
} from "./debug-helpers";
import type { PoolDraftState } from "../types/draft";
import type { CardData } from "../types/cards";
import { parseCardName } from "../types/card-identity";
import type {
  DreamsignTemplate,
  ResolvedAvatarPackage,
  Tides4ProvenanceSummary,
} from "../types/content";
import {
  testAvatarId,
  testDreamsignId,
  testCardId,
  testTideId,
} from "../types/test-identities";
import type { CardSourceDebugState } from "../types/journey";
import { buildCardSourceView } from "./cumulus_adapters/card-source-view-model";

describe("debug-helpers", () => {
  function makeCard(num: number, name: string): CardData {
    return {
      name: parseCardName(name),
      id: testCardId(`card-${String(num)}`),
      cardNumber: num,
      cardType: "Character",
      subtype: "",
      isStarter: false,
      energyCost: 1,
      spark: 1,
      isFast: false,
      renderedText: "",
      imageNumber: num,
      artOwned: true,
    };
  }

  function makeDraftState(
    overrides: Partial<PoolDraftState> = {},
  ): PoolDraftState {
    return {
      mode: "tides4",
      draftPoolCopiesByCard: {},
      remainingCopiesByCard: {},
      currentOffer: [],
      activeSiteId: null,
      pickNumber: 1,
      sitePicksCompleted: 0,
      ...overrides,
    };
  }

  function makeResolvedPackage(): ResolvedAvatarPackage {
    return {
      avatar: {
        id: testAvatarId("avatar-1"),
        name: "Caller of Depths",
        title: "Witness of Logs",
        renderedText: "Test",
        imageNumber: "0007",
        startingEssence: 245,
      },
      draftPoolCopiesByCard: { "1": 2, "2": 1 },
      dreamsignPoolIds: [
        testDreamsignId("sign-1"),
        testDreamsignId("sign-2"),
        testDreamsignId("sign-3"),
      ],
      mandatoryOnlyPoolSize: 120,
      draftPoolSize: 198,
      doubledCardCount: 41,
      legalSubsetCount: 4,
      preferredSubsetCount: 2,
    };
  }

  const DREAMSIGN_TEMPLATES: readonly DreamsignTemplate[] = [
    {
      id: testDreamsignId("sign-1"),
      name: "First Sign",
      effectDescription: "Test",
    },
    {
      id: testDreamsignId("sign-2"),
      name: "Second Sign",
      effectDescription: "Test",
    },
    {
      id: testDreamsignId("sign-3"),
      name: "Third Sign",
      effectDescription: "Test",
    },
  ] as const;

  describe("extractDraftDebugInfo", () => {
    it("returns basic pool info", () => {
      const result = extractDraftDebugInfo(
        makeDraftState({
          remainingCopiesByCard: { "1": 2, "2": 1 },
        }),
        new Map(),
      );

      expect(result).not.toBeNull();
      expect(result?.pickNumber).toBe(1);
      expect(result?.sitePicksCompleted).toBe(0);
      expect(result?.remainingCards).toBe(3);
      expect(result?.remainingUniqueCards).toBe(2);
      expect(result?.topRemainingCards).toEqual([
        {
          cardNumber: 1,
          name: "Unknown Card #1",
          copiesRemaining: 2,
        },
        {
          cardNumber: 2,
          name: "Unknown Card #2",
          copiesRemaining: 1,
        },
      ]);
    });

    it("resolves current offer card data", () => {
      const cardDatabase = new Map<number, CardData>([
        [1, makeCard(1, "Rose Golem")],
        [2, makeCard(2, "Lightning Sprite")],
      ]);

      const result = extractDraftDebugInfo(
        makeDraftState({
          currentOffer: [2, 1],
        }),
        cardDatabase,
      );

      expect(result?.currentOfferSize).toBe(2);
      expect(result?.currentOffer.map((card) => card.name)).toEqual([
        "Lightning Sprite",
        "Rose Golem",
      ]);
    });
  });

  describe("extractPackageDebugInfo", () => {
    it("summarizes remaining and spent Dreamsign pool entries", () => {
      const firstId = testDreamsignId("sign-1");
      const secondId = testDreamsignId("sign-2");
      const thirdId = testDreamsignId("sign-3");
      const result = extractPackageDebugInfo(
        makeResolvedPackage(),
        [secondId],
        DREAMSIGN_TEMPLATES,
      );

      expect(result?.avatarName).toBe("Caller of Depths");
      expect(result?.startingEssence).toBe(245);
      expect(result?.initialDreamsignPoolSize).toBe(3);
      expect(result?.remainingDreamsigns).toEqual([
        { id: secondId, name: "Second Sign" },
      ]);
      expect(result?.spentDreamsigns).toEqual([
        { id: firstId, name: "First Sign" },
        { id: thirdId, name: "Third Sign" },
      ]);
    });
  });
});

describe("CardSourceOverlay", () => {
  const DEBUG: CardSourceDebugState = {
    screenLabel: "Draft",
    surface: "Draft",
    entries: [{ cardNumber: 1, cardName: "Alpha", draftPoolCopies: 2 }],
  };

  const PROVENANCE: Tides4ProvenanceSummary = {
    avatarId: testAvatarId("avatar-a"),
    signatureless: false,
    borrowedArchetypeName: null,
    dealSize: 150,
    cap: 2,
    maxFacets: 3,
    facetDrawnCount: 1,
    facetAvailableCount: 2,
    tides: [
      {
        id: testTideId("tide-a"),
        displayName: "Signature A",
        displayDescription: "Signature description",
        role: "signature",
        selection: "starter",
        joined: true,
        cardNumbers: [1],
        contributedCardCount: 1,
      },
    ],
    cardProvenanceByNumber: {
      "1": {
        copies: 2,
        tideIds: [testTideId("tide-a")],
        primaryTideId: testTideId("tide-a"),
      },
    },
  };

  describe("card source view", () => {
    it("explains cards using tides4 provenance", () => {
      const view = buildCardSourceView(DEBUG, PROVENANCE, new Map());
      if (view === null) throw new Error("Expected card source view.");
      expect(view?.construction?.lines.map((line) => line.text)).toContain(
        "Signature A",
      );
      expect(view.cards.lines[0].text).toContain("Signature A");
    });

    it("falls back to pool-copy provenance while tides are loading", () => {
      const view = buildCardSourceView(DEBUG, null, new Map());
      if (view === null) throw new Error("Expected card source view.");
      const line = view.cards.lines[0].text;
      expect(line).toContain(String(DEBUG.entries[0].draftPoolCopies));
      expect(line).not.toContain("Signature A");
    });
  });
});
