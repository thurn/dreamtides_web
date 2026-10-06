import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import { testJourneyState } from "../../testing/journey-genesis";
import { gambleGameByRulesKind } from "../../data/gamble-data";
import {
  gambleFixture,
  testGambleSelectionTrace,
} from "../../testing/gamble-fixture";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import type { DreamGuideContent } from "../../types/content";
import type {
  FourSuitRepriseSiteRuntime,
  FourSuitRepriseTarget,
  GravokWagerSiteRuntime,
  SiteState,
  StarwayStairsSiteRuntime,
  TidemarkLadderClimbSiteRuntime,
  BlackjackSiteRuntime,
} from "../../types/journey";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import type {
  GambleSiteView,
  GravokWagerSiteView,
} from "../../cumulus/screens/GambleSiteScreen";
import {
  buildGambleGateViews,
  buildGambleSiteView as buildGambleSiteViewImpl,
} from "./gamble-site-view-model";
import { parseSiteId } from "../../types/identifiers";
import { parseShuffleCommitment } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { testDreamscapeId, testDreamsignId, testGuideArtKey, testGuideId, testCardId } from "../../types/test-identities";

expect.addEqualityTesters([annotatedTextEquality]);

const buildGambleSiteView = (
  params: Omit<
    Parameters<typeof buildGambleSiteViewImpl>[0],
    "gambleData" | "transfigurationData"
  >,
) =>
  buildGambleSiteViewImpl({
    ...params,
    gambleData: gambleFixture(),
    transfigurationData: transfigurationFixture(),
  });

const GUIDE_LINE_SOURCE = "Fixture game line.";
const GUIDE_LINE = GUIDE_LINE_SOURCE;
const GUIDE = {
  id: testGuideId("fixture-gamble-guide"),
  name: "Fixture Gamble Guide",
  homeDreamscapeId: testDreamscapeId("fixture-home"),
  siteType: "Gamble",
  portraitSource: "fixture-guide.png",
  artKey: testGuideArtKey("fixture-guide"),
  headTargetX: 0.6,
  dialogue: { site: [GUIDE_LINE_SOURCE] },
  homeSpecialty: "Fixture specialty.",
} satisfies DreamGuideContent;

const GAMBLE_SITE: SiteState & { type: "Gamble" } = {
  id: parseSiteId("fixture-gamble-site"),
  type: "Gamble",
  isEnhanced: false,
  isVisited: false,
};

const FIXTURE_SIGN_ID = testDreamsignId("fixture-sign");

const RUNTIME: GravokWagerSiteRuntime = {
  kind: "gamble",
  gameId: "gravok-three-gate-wager",
  selectionTrace: testGambleSelectionTrace("gravok-three-gate-wager"),
  roundNumber: 1,
  isFarpoint: false,
  wagerCost: 50,
  shuffleCommitment: parseShuffleCommitment("fixture-commitment"),
  committedCard: { rank: "Q", suit: "hearts" },
  dreamsignCandidateIds: [FIXTURE_SIGN_ID],
  rewardDreamsign: {
    id: FIXTURE_SIGN_ID,
    name: "Fixture Sign",
    effectDescription: "A fixture effect.",
  },
  result: null,
};

function expectGravokView(
  view: GambleSiteView | null,
): asserts view is GravokWagerSiteView {
  expect(view?.gameId).toBe("gravok-three-gate-wager");
  if (view?.gameId !== "gravok-three-gate-wager") {
    throw new Error("expected Three-Gate view");
  }
}

describe("gamble-site-view-model", () => {

  it("maps all exact gate targets, odds, rewards, and the locked jackpot", () => {
    const gates = buildGambleGateViews(
      gambleGameByRulesKind(gambleFixture(), "threeGate"),
      RUNTIME,
      12,
    );

    expect(gates).toMatchObject([
      {
        id: "six",
        minimumWinningRank: "6",
        chanceLabel: "69.23%",
        essenceReward: 100,
        rewardDreamsign: null,
        available: true,
      },
      {
        id: "nine",
        minimumWinningRank: "9",
        chanceLabel: "46.15%",
        essenceReward: 150,
        rewardDreamsign: null,
        available: true,
      },
      {
        id: "jack",
        minimumWinningRank: "J",
        essenceReward: 200,
        rewardDreamsign: { id: FIXTURE_SIGN_ID },
        available: true,
      },
    ]);
    expect(gates.every(({ chanceLabel }) => typeof chanceLabel === "string")).toBe(
      true,
    );
  });

  it("keeps the committed card concealed until the shared result exists", () => {
    const state = {
      ...testJourneyState(),
      essence: 75,
      siteRuntime: { [GAMBLE_SITE.id]: RUNTIME },
    };
    const view = buildGambleSiteView({
      state,
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });
    expectGravokView(view);

    expect(view.runtimeReady).toBe(true);
    expect(view.canAfford).toBe(true);
    expect(view.canPlayAgain).toBe(false);
    expect(view.card).toEqual({ rank: "A", suit: "spades" });
    expect(view.guide.line).toBe(GUIDE_LINE_SOURCE);
    expect(view.result).toBeNull();
  });

  it("maps a jackpot result and its at-cap replacement by UUID", () => {
    const resultRuntime: GravokWagerSiteRuntime = {
      ...RUNTIME,
      result: {
        gateId: "jack",
        card: RUNTIME.committedCard,
        won: true,
        essenceGained: 200,
        essenceSettled: false,
        dreamsignAwarded: false,
        pendingDreamsignReplacement: true,
      },
    };
    const state = {
      ...testJourneyState(),
      essence: 350,
      maxDreamsigns: 1,
      dreamsigns: [
        {
          id: testDreamsignId("held-sign"),
          name: "Held Sign",
          effectDescription: "Held effect.",
        },
      ],
      siteRuntime: { [GAMBLE_SITE.id]: resultRuntime },
    };
    const view = buildGambleSiteView({
      state,
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });
    expectGravokView(view);

    expect(view.card).toEqual({ rank: "Q", suit: "hearts" });
    expect(view.result).toMatchObject({
      gateId: "jack",
      revealGateId: "six",
      won: true,
      essenceSettled: false,
      rewardDreamsign: { id: FIXTURE_SIGN_ID },
      pendingDreamsignReplacement: true,
    });
    expect(view.replacement).toMatchObject({
      incoming: { id: FIXTURE_SIGN_ID },
      held: [{ id: testDreamsignId("held-sign") }],
      capacity: 1,
    });
    expect(view.canPlayAgain).toBe(false);
  });
});

const LADDER_RUNTIME: TidemarkLadderClimbSiteRuntime = {
  kind: "gamble",
  gameId: "tidemark-ladder-climb",
  selectionTrace: testGambleSelectionTrace("tidemark-ladder-climb"),
  isFarpoint: false,
  shuffleCommitments: [
    parseShuffleCommitment("attempt-1"),
    parseShuffleCommitment("attempt-2"),
    parseShuffleCommitment("attempt-3"),
    parseShuffleCommitment("attempt-4"),
  ],
  committedCards: [
    { rank: "J", suit: "clubs" },
    { rank: "10", suit: "diamonds" },
    { rank: "8", suit: "hearts" },
    { rank: "6", suit: "spades" },
  ],
  dreamsignCandidateScores: [
    { dreamsignId: FIXTURE_SIGN_ID, score: 1 },
  ],
  strongPoolSize: 1,
  strongPoolCutoffScore: 1,
  rewardDreamsign: RUNTIME.rewardDreamsign!,
  revealedCards: [],
  cumulativeCost: 0,
  result: null,
};

describe("gamble-site-view-model — Ladder Climb", () => {
  it("shows only draw one with the locked Dreamsign prize", () => {
    const state = {
      ...testJourneyState(),
      essence: 75,
      siteRuntime: { [GAMBLE_SITE.id]: LADDER_RUNTIME },
    };
    const view = buildGambleSiteView({
      state,
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });

    expect(view?.gameId).toBe("tidemark-ladder-climb");
    if (view?.gameId !== "tidemark-ladder-climb") {
      throw new Error("expected Ladder Climb view");
    }
    expect(view.nextDraw).toEqual({
      attemptNumber: 1,
      targetRank: "Q",
      cost: 0,
      canAfford: true,
      available: true,
    });
    expect(view.result).toBeNull();
    expect(view.essenceReward).toBe(25);
    expect(view.rewardDreamsign?.id).toBe(FIXTURE_SIGN_ID);
  });
});

const STARWAY_RUNTIME: StarwayStairsSiteRuntime = {
  kind: "gamble",
  gameId: "starway-stairs",
  selectionTrace: testGambleSelectionTrace("starway-stairs"),
  roundNumber: 1,
  isFarpoint: false,
  wagerAmount: 30,
  shuffleCommitments: [
    parseShuffleCommitment("tier-1"),
    parseShuffleCommitment("tier-2"),
    parseShuffleCommitment("tier-3"),
  ],
  committedCards: [
    { rank: "3", suit: "clubs" },
    { rank: "5", suit: "diamonds" },
    { rank: "8", suit: "hearts" },
  ],
  results: [],
  terminalReason: null,
  prizeAwarded: 0,
};

describe("gamble-site-view-model — Starway Stairs", () => {
  it("maps all tier bust ranges and rewards with only tier one current", () => {
    const view = buildGambleSiteView({
      state: {
        ...testJourneyState(),
        essence: 30,
        siteRuntime: { [GAMBLE_SITE.id]: STARWAY_RUNTIME },
      },
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });

    expect(view?.gameId).toBe("starway-stairs");
    if (view?.gameId !== "starway-stairs") {
      throw new Error("expected Starway Stairs view");
    }
    expect(view.guide.line).toBe(GUIDE_LINE_SOURCE);
    expect(view.currentTierNumber).toBe(1);
    expect(view.tiers).toMatchObject([
      {
        tierNumber: 1,
        minimumWinningRank: "3",
        essenceReward: 60,
        state: "current",
      },
      {
        tierNumber: 2,
        minimumWinningRank: "5",
        essenceReward: 140,
        state: "future",
      },
      {
        tierNumber: 3,
        minimumWinningRank: "8",
        essenceReward: 300,
        state: "future",
      },
    ]);
    expect(view.canAffordWager).toBe(true);
    expect(view.canPlayAgain).toBe(false);
    expect(view.cashOutReward).toBeNull();
  });
});

function fourSuitCard(index: number): CardData {
  return {
    name: parseCardName(`Four Suit Fixture ${String(index)}`),
    id: testCardId(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
    cardNumber: index,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "Materialized: Gain 1 Essence.",
    imageNumber: index,
    artOwned: true,
  };
}

function fourSuitTarget(
  index: number,
  entryId = `four-suit-entry-${String(index)}`,
): FourSuitRepriseTarget {
  const card = fourSuitCard(index);
  return {
    entryId: parseDeckEntryId(entryId),
    cardId: card.id,
    cardNumber: card.cardNumber,
    cardSnapshot: card,
    transfigurationOffers: [
      {
        entryId: parseDeckEntryId(entryId),
        type: "Empowered",
        effectDetails: { fixture: true },
        previewCard: { ...card, energyCost: 1 },
        essenceCost: 0,
      },
    ],
  };
}

describe("gamble-site-view-model — Four-Suit Reprise", () => {
  it("maps unpriced forms and removes every used card UUID from later rounds", () => {
    const target = fourSuitTarget(1);
    const sameCardCopy = {
      ...fourSuitTarget(1, "four-suit-entry-1-copy"),
      cardId: target.cardId,
      cardSnapshot: target.cardSnapshot,
    };
    const nextTarget = fourSuitTarget(2);
    const runtime: FourSuitRepriseSiteRuntime = {
      kind: "gamble",
      gameId: "four-suit-reprise",
      selectionTrace: testGambleSelectionTrace("four-suit-reprise"),
      isFarpoint: false,
      drawCost: 25,
      shuffleCommitments: [
        parseShuffleCommitment("round-1"),
        parseShuffleCommitment("round-2"),
        parseShuffleCommitment("round-3"),
      ],
      committedCards: [
        { rank: "4", suit: "diamonds" },
        { rank: "7", suit: "hearts" },
        { rank: "Q", suit: "clubs" },
      ],
      targets: [target, sameCardCopy, nextTarget],
      rounds: [
        {
          roundNumber: 1,
          shuffleCommitment: parseShuffleCommitment("round-1"),
          card: { rank: "4", suit: "diamonds" },
          targetEntryId: target.entryId,
          targetCardId: target.cardId,
          costPaid: 25,
          outcome: "essence",
          resultRevealed: true,
          resultSettled: true,
          essenceGained: 100,
        },
      ],
      phase: "result",
    };
    const view = buildGambleSiteView({
      state: {
        ...testJourneyState(),
        essence: 25,
        deck: runtime.targets.map((candidate) => ({
          entryId: candidate.entryId,
          cardNumber: candidate.cardNumber,
          transfiguration: null,
          isBane: false,
        })),
        siteRuntime: { [GAMBLE_SITE.id]: runtime },
      },
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });

    expect(view?.gameId).toBe("four-suit-reprise");
    if (view?.gameId !== "four-suit-reprise") {
      throw new Error("expected Four-Suit Reprise view");
    }
    expect(view.cards.map((card) => card.cardId)).toEqual([nextTarget.cardId]);
    expect(view.result?.target.entryId).toBe(target.entryId);
    expect(
      view.result?.transfigurationCandidate.forms.map((form) => ({
        type: form.type,
        pricing: form.pricing,
      })),
    ).toEqual([
      {
        type: "Empowered",
        pricing: { kind: "unpriced" },
      },
    ]);
    expect(view.canPlayAgain).toBe(true);

    const replayView = buildGambleSiteView({
      state: {
        ...testJourneyState(),
        essence: 25,
        deck: runtime.targets.map((candidate) => ({
          entryId: candidate.entryId,
          cardNumber: candidate.cardNumber,
          transfiguration: null,
          isBane: false,
        })),
        siteRuntime: {
          [GAMBLE_SITE.id]: { ...runtime, phase: "choose" },
        },
      },
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });
    expect(replayView?.gameId).toBe("four-suit-reprise");
    if (replayView?.gameId !== "four-suit-reprise") {
      throw new Error("expected Four-Suit Reprise replay view");
    }
    expect(replayView.roundNumber).toBe(2);
    expect(replayView.result).toBeNull();
  });
});

describe("gamble-site-view-model — Blackjack", () => {
  const runtime: BlackjackSiteRuntime = {
    kind: "gamble",
    gameId: "blackjack",
    selectionTrace: testGambleSelectionTrace("blackjack"),
    isFarpoint: false,
    wagerCost: 50,
    prizeEssence: 300,
    attemptNumber: 1,
    shuffleCommitment: parseShuffleCommitment("fixture-blackjack-commitment"),
    committedDeck: [
      { rank: "10", suit: "clubs" },
      { rank: "6", suit: "hearts" },
      { rank: "5", suit: "spades" },
      { rank: "K", suit: "diamonds" },
    ],
    deckCursor: 4,
    playerCards: [
      { rank: "10", suit: "clubs" },
      { rank: "6", suit: "hearts" },
    ],
    dealerCards: [
      { rank: "5", suit: "spades" },
      { rank: "K", suit: "diamonds" },
    ],
    dealerRevealed: false,
    wagerPaid: true,
    playerDecision: "deal",
    outcome: null,
    resultSettled: false,
    essenceAwarded: 0,
  };

  it("maps the wager, flat prize, player hand, and concealed dealer hand", () => {
    const view = buildGambleSiteView({
      state: {
        ...testJourneyState(),
        essence: 64,
        siteRuntime: { [GAMBLE_SITE.id]: runtime },
      },
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });
    expect(view?.gameId).toBe("blackjack");
    if (view?.gameId !== "blackjack") {
      throw new Error("expected Blackjack view");
    }
    expect(view).toMatchObject({
      handId: "fixture-blackjack-commitment",
      wagerCost: 50,
      prizeEssence: 300,
      canAffordWager: true,
      playerTotal: 16,
      dealerTotal: 5,
      dealerRevealed: false,
      outcome: null,
      canPlayAgain: false,
    });
  });
});
