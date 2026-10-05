import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type {
  ShopModifiers,
  ShopSiteRuntime,
  FourSuitRepriseSiteRuntime,
  TidemarkLadderClimbSiteRuntime,
  BlackjackSiteRuntime,
} from "../../types/journey";
import {
  buildShopPurchaseLogs,
  buildShopSiteEntryLog,
} from "./shop-purchase-logging-view-model";
import {
  parseSiteId,
  parseDeckEntryId,
  parseShuffleCommitment,
} from "../../types/identifiers";
import {
  testDreamsignId,
  testCardId,
  testExplorationActionId,
  testGuideId,
} from "../../types/test-identities";
import { artRef } from "../../cumulus/primitives/art";
import type {
  FourSuitRepriseSiteView,
  LadderClimbSiteView,
  BlackjackSiteView,
} from "../../cumulus/screens/GambleSiteScreen";
import { getLogEntries, resetLog } from "../../logging";
import { gambleFixture } from "../../testing/gamble-fixture";
import {
  logGamblePrepared,
  logGambleResolved,
  logGambleSettled,
} from "./gamble-site-logging-view-model";
import { localizedDreamsignFixture } from "../../cumulus/test-helpers/dreamsign-fixture";

describe("shop-purchase-logging-view-model", () => {
  const card: CardData = {
    id: testCardId("00000000-0000-4000-8000-000000000001"),
    name: parseCardName("Fixture Card"),
    cardNumber: 7,
    cardType: "Event",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Draw a card.",
    imageNumber: 7,
    artOwned: true,
  };

  const source = {
    sourceSiteId: parseSiteId("00000000-0000-4000-8000-000000000002"),
    sourceActionId: testExplorationActionId(
      "00000000-0000-4000-8000-000000000003",
    ),
  } as const;

  const shopModifiers: ShopModifiers = {
    freeRerolls: 0,
    essenceDiscountPercent: 10,
    freeNextShopModifiers: [],
    freePurchaseModifiers: [
      {
        kind: "free-purchases",
        ...source,
        initialCount: 3,
        remainingCount: 2,
      },
    ],
  };

  function runtime(): ShopSiteRuntime {
    return {
      kind: "shop",
      slots: [
        {
          itemType: "card",
          cardNumber: card.cardNumber,
          basePrice: 100,
          discountPercent: 20,
          purchased: false,
        },
      ],
      rerollCount: 0,
      remainingDreamsignPoolIds: [],
      freePurchaseSource: source,
      purchaseHistory: [
        {
          eventSeq: 18,
          siteId: parseSiteId("shop-site"),
          slotIndex: 0,
          item: {
            kind: "card",
            cardNumber: card.cardNumber,
            gainedEntryId: parseDeckEntryId("deck-entry-uuid"),
          },
          priceBeforeFree: 70,
          pricePaid: 0,
          essenceBefore: 240,
          essenceAfter: 240,
          freeNextShopSource: source,
          freePurchaseModifier: {
            ...source,
            initialCount: 3,
            remainingBefore: 2,
            remainingAfter: 1,
          },
        },
      ],
    };
  }

  describe("shop purchase logging view model", () => {
    it("records reconstructable entry inventory, prices, and overlapping sources", () => {
      expect(
        buildShopSiteEntryLog(
          runtime(),
          shopModifiers,
          new Map([[card.cardNumber, card]]),
        ),
      ).toEqual({
        freeNextShopSource: source,
        freePurchaseModifiers: shopModifiers.freePurchaseModifiers,
        slots: [
          {
            slotIndex: 0,
            item: {
              kind: "card",
              cardId: card.id,
              cardNumber: card.cardNumber,
            },
            purchased: false,
            basePrice: 100,
            slotDiscountPercent: 20,
            essenceDiscountPercent: 10,
            priceBeforeFree: 70,
            finalPrice: 0,
          },
        ],
      });
    });

    it("resolves retained purchase receipts to canonical UUID identities", () => {
      expect(
        buildShopPurchaseLogs(
          runtime().purchaseHistory,
          new Map([[card.cardNumber, card]]),
        ),
      ).toEqual([
        {
          eventSeq: 18,
          siteId: parseSiteId("shop-site"),
          slotIndex: 0,
          item: {
            kind: "card",
            cardId: card.id,
            cardNumber: card.cardNumber,
            gainedEntryId: parseDeckEntryId("deck-entry-uuid"),
          },
          priceBeforeFree: 70,
          chargedPrice: 0,
          essenceBefore: 240,
          essenceAfter: 240,
          freeNextShopSource: source,
          freePurchaseModifier: {
            ...source,
            initialCount: 3,
            remainingBefore: 2,
            remainingAfter: 1,
          },
        },
      ]);
    });

    it("retains Dreamsign purchase and replacement UUIDs without display names", () => {
      const receipt = {
        eventSeq: 19,
        siteId: parseSiteId("bazaar-site"),
        slotIndex: 1,
        item: {
          kind: "dreamsign" as const,
          dreamsignId: testDreamsignId("dreamsign-gained-uuid"),
          replacedDreamsignId: testDreamsignId("dreamsign-replaced-uuid"),
        },
        priceBeforeFree: 180,
        pricePaid: 0,
        essenceBefore: 240,
        essenceAfter: 240,
        freePurchaseModifier: {
          ...source,
          initialCount: 3,
          remainingBefore: 1,
          remainingAfter: 0,
        },
      };

      expect(buildShopPurchaseLogs([receipt], new Map())).toEqual([
        {
          eventSeq: 19,
          siteId: parseSiteId("bazaar-site"),
          slotIndex: 1,
          item: {
            kind: "dreamsign",
            dreamsignId: testDreamsignId("dreamsign-gained-uuid"),
            replacedDreamsignId: testDreamsignId("dreamsign-replaced-uuid"),
          },
          priceBeforeFree: 180,
          chargedPrice: 0,
          essenceBefore: 240,
          essenceAfter: 240,
          freeNextShopSource: null,
          freePurchaseModifier: {
            ...source,
            initialCount: 3,
            remainingBefore: 1,
            remainingAfter: 0,
          },
        },
      ]);
    });
  });
});

describe("gamble-site-logging-view-model", () => {
  const REWARD_DREAMSIGN = {
    id: testDreamsignId("00000000-0000-4000-8000-000000000025"),
    name: "Fixture Sign",
    effectDescription: "Fixture effect.",
  };

  const LOCALIZED_REWARD_DREAMSIGN =
    localizedDreamsignFixture(REWARD_DREAMSIGN);

  const RUNTIME: TidemarkLadderClimbSiteRuntime = {
    kind: "gamble",
    gameId: "tidemark-ladder-climb",
    isFarpoint: false,
    shuffleCommitments: [
      parseShuffleCommitment("attempt-1"),
      parseShuffleCommitment("attempt-2"),
      parseShuffleCommitment("attempt-3"),
      parseShuffleCommitment("attempt-4"),
    ],
    committedCards: [
      { rank: "Q", suit: "clubs" },
      { rank: "10", suit: "diamonds" },
      { rank: "8", suit: "hearts" },
      { rank: "6", suit: "spades" },
    ],
    dreamsignCandidateScores: [{ dreamsignId: REWARD_DREAMSIGN.id, score: 1 }],
    strongPoolSize: 1,
    strongPoolCutoffScore: 1,
    rewardDreamsign: REWARD_DREAMSIGN,
    revealedCards: [{ rank: "Q", suit: "clubs" }],
    cumulativeCost: 0,
    result: {
      attemptNumber: 1,
      card: { rank: "Q", suit: "clubs" },
      won: true,
      costPaid: 0,
      cumulativeCost: 0,
      resultSettled: true,
      dreamsignAwarded: true,
      pendingDreamsignReplacement: false,
    },
  };

  const VIEW: LadderClimbSiteView = {
    gameId: "tidemark-ladder-climb",
    siteId: parseSiteId("fixture-site"),
    scene: null,
    isFarpoint: false,
    runtimeReady: true,
    essenceReward: 25,
    rewardDreamsign: LOCALIZED_REWARD_DREAMSIGN,
    nextDraw: null,
    guide: {
      id: testGuideId("fixture-guide"),
      name: "Fixture Guide",
      line: "Fixture line.",
      art: artRef.dreamGuide(testGuideId("fixture-guide")),
    },
    result: null,
    replacement: null,
  };

  describe("gamble-site-logging-view-model", () => {
    beforeEach(() => {
      resetLog();
      vi.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      resetLog();
    });

    it("records the Ladder Climb Essence payout and net settlement", () => {
      logGambleSettled(
        parseSiteId("fixture-site"),
        RUNTIME,
        VIEW,
        gambleFixture(),
      );

      expect(getLogEntries()).toHaveLength(1);
      expect(getLogEntries()[0]).toMatchObject({
        event: "gamble_wager_settled",
        gameId: "tidemark-ladder-climb",
        gambleFoldHash: gambleFixture().foldHash,
        attemptNumber: 1,
        cumulativeCost: 0,
        essenceGained: 25,
        essenceChangeAtSettlement: 25,
        netEssenceChange: 25,
        dreamsignId: REWARD_DREAMSIGN.id,
        dreamsignAwarded: true,
      });
    });

    it("records enough Four-Suit data to reconstruct the paid deck mutation", () => {
      const card: CardData = {
        name: parseCardName("Fixture Card"),
        id: testCardId("00000000-0000-4000-8000-000000000101"),
        cardNumber: 101,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 2,
        spark: 2,
        isFast: false,
        renderedText: "Materialized: Gain 1 Essence.",
        imageNumber: 101,
        artOwned: true,
      };
      const runtime: FourSuitRepriseSiteRuntime = {
        kind: "gamble",
        gameId: "four-suit-reprise",
        isFarpoint: false,
        drawCost: 25,
        shuffleCommitments: [
          parseShuffleCommitment("round-1"),
          parseShuffleCommitment("round-2"),
          parseShuffleCommitment("round-3"),
        ],
        committedCards: [
          { rank: "7", suit: "hearts" },
          { rank: "4", suit: "diamonds" },
          { rank: "Q", suit: "clubs" },
        ],
        targets: [
          {
            entryId: parseDeckEntryId("entry-101"),
            cardId: card.id,
            cardNumber: card.cardNumber,
            cardSnapshot: card,
            transfigurationOffers: [
              {
                entryId: parseDeckEntryId("entry-101"),
                type: "Empowered",
                effectDescription: "Fixture form.",
                effectDetails: { fixture: true },
                previewCard: { ...card, energyCost: 1 },
                essenceCost: 0,
              },
            ],
          },
        ],
        rounds: [
          {
            roundNumber: 1,
            shuffleCommitment: parseShuffleCommitment("round-1"),
            card: { rank: "7", suit: "hearts" },
            targetEntryId: parseDeckEntryId("entry-101"),
            targetCardId: card.id,
            costPaid: 25,
            outcome: "duplication",
            resultRevealed: true,
            resultSettled: true,
            essenceGained: 0,
            duplicatedEntryId: parseDeckEntryId("duplicate-101"),
          },
        ],
        phase: "result",
      };
      const view = {
        gameId: "four-suit-reprise",
        cards: [],
      } as unknown as FourSuitRepriseSiteView;

      logGamblePrepared(
        parseSiteId("fixture-site"),
        runtime,
        view,
        gambleFixture(),
      );
      logGambleResolved(
        parseSiteId("fixture-site"),
        runtime,
        view,
        gambleFixture(),
      );
      logGambleSettled(
        parseSiteId("fixture-site"),
        runtime,
        view,
        gambleFixture(),
      );

      expect(getLogEntries()).toHaveLength(3);
      expect(getLogEntries()[0]).toMatchObject({
        event: "gamble_game_prepared",
        gameId: "four-suit-reprise",
        drawCost: 25,
        outcomes: [
          { suit: "spades", outcome: "transfiguration" },
          { suit: "diamonds", outcome: "essence" },
          { suit: "hearts", outcome: "duplication" },
          { suit: "clubs", outcome: "purge" },
        ],
      });
      expect(getLogEntries()[1]).toMatchObject({
        event: "gamble_wager_resolved",
        roundNumber: 1,
        payment: 25,
        selectedEntryId: "entry-101",
        selectedCardId: card.id,
        resolvedSuitOutcome: "duplication",
      });
      expect(getLogEntries()[2]).toMatchObject({
        event: "gamble_wager_settled",
        gambleFoldHash: gambleFixture().foldHash,
        finalEffect: "duplication",
        duplicatedEntryId: parseDeckEntryId("duplicate-101"),
      });
    });

    it("records the Blackjack wager, both hands, decision, and final reward", () => {
      const runtime: BlackjackSiteRuntime = {
        kind: "gamble",
        gameId: "blackjack",
        isFarpoint: false,
        wagerCost: 50,
        prizeEssence: 300,
        attemptNumber: 1,
        shuffleCommitment: parseShuffleCommitment("blackjack-hand"),
        committedDeck: [
          { rank: "10", suit: "clubs" },
          { rank: "10", suit: "spades" },
          { rank: "9", suit: "hearts" },
          { rank: "8", suit: "diamonds" },
        ],
        deckCursor: 4,
        playerCards: [
          { rank: "10", suit: "clubs" },
          { rank: "9", suit: "hearts" },
        ],
        dealerCards: [
          { rank: "10", suit: "spades" },
          { rank: "8", suit: "diamonds" },
        ],
        dealerRevealed: true,
        wagerPaid: true,
        playerDecision: "stand",
        outcome: "player-win",
        resultSettled: true,
        essenceAwarded: 300,
      };
      const view = { gameId: "blackjack" } as unknown as BlackjackSiteView;

      logGamblePrepared(
        parseSiteId("fixture-site"),
        runtime,
        view,
        gambleFixture(),
      );
      logGambleResolved(
        parseSiteId("fixture-site"),
        runtime,
        view,
        gambleFixture(),
      );
      logGambleSettled(
        parseSiteId("fixture-site"),
        runtime,
        view,
        gambleFixture(),
      );

      expect(getLogEntries()).toHaveLength(3);
      expect(getLogEntries()[0]).toMatchObject({
        event: "gamble_game_prepared",
        gameId: "blackjack",
        wagerCost: 50,
        prizeEssence: 300,
        dealerRule: "stand-soft-17",
      });
      expect(getLogEntries()[1]).toMatchObject({
        event: "gamble_wager_resolved",
        playerDecision: "stand",
        payment: 0,
        deckCursor: 4,
        playerTotal: 19,
        dealerTotal: 18,
        outcome: "player-win",
      });
      expect(getLogEntries()[2]).toMatchObject({
        event: "gamble_wager_settled",
        gambleFoldHash: gambleFixture().foldHash,
        playerTotal: 19,
        dealerTotal: 18,
        wagerPayment: 50,
        essenceGained: 300,
        netEssenceChange: 250,
        outcome: "player-win",
      });
    });
  });
});
