import { describe, expect, it } from "vitest";
import { createDefaultState } from "../../state/journey-context";
import { MINIMAL_SITES_DATA } from "../../__test-helpers__/atlas-fixtures";
import { economyFixture } from "../../testing/economy-fixture";
import type { DreamGuideContent } from "../../types/content";
import type {
  FourSuitRepriseSiteRuntime,
  FourSuitRepriseTarget,
  GravokWagerSiteRuntime,
  SiteState,
  StarwayStairsSiteRuntime,
  TidemarkLadderClimbSiteRuntime,
} from "../../types/journey";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import type {
  GambleSiteView,
  GravokWagerSiteView,
} from "../../cumulus/screens/GambleSiteScreen";
import {
  buildGambleGateViews,
  buildGambleSiteView as buildGambleSiteViewImpl,
  gravokRevealGateId,
  resolveGambleGuide,
} from "./gamble-site-view-model";

const buildGambleSiteView = (
  params: Omit<
    Parameters<typeof buildGambleSiteViewImpl>[0],
    "sitesData" | "economyData"
  >,
) =>
  buildGambleSiteViewImpl({
    ...params,
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
  });

const GUIDE_LINE = "Fixture game line.";
const GUIDE = {
  id: "fixture-gamble-guide",
  name: "Fixture Gamble Guide",
  homeDreamscapeId: "fixture-home",
  siteType: "Gamble",
  portraitSource: "fixture-guide.png",
  dialogue: { site: [GUIDE_LINE] },
  homeSpecialty: "Fixture specialty.",
} satisfies DreamGuideContent;

const GAMBLE_SITE: SiteState & { type: "Gamble" } = {
  id: "fixture-gamble-site",
  type: "Gamble",
  isEnhanced: false,
  isVisited: false,
};

const RUNTIME: GravokWagerSiteRuntime = {
  kind: "gamble",
  gameId: "gravok-three-gate-wager",
  rulesVersion: "fixture-rules",
  roundNumber: 1,
  isFarpoint: false,
  wagerCost: 50,
  shuffleCommitment: "fixture-commitment",
  committedCard: { rank: "Q", suit: "hearts" },
  dreamsignCandidateIds: ["fixture-sign"],
  rewardDreamsign: {
    id: "fixture-sign",
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
  it("uses the next non-selected gate as the stable reveal object", () => {
    const rules = MINIMAL_SITES_DATA.gamble.threeGate;
    expect(gravokRevealGateId(rules, "six")).toBe("nine");
    expect(gravokRevealGateId(rules, "nine")).toBe("jack");
    expect(gravokRevealGateId(rules, "jack")).toBe("six");
  });

  it("maps all exact gate targets, odds, rewards, and the locked jackpot", () => {
    const gates = buildGambleGateViews(
      economyFixture().gamble.threeGate,
      MINIMAL_SITES_DATA.gamble.threeGate,
      RUNTIME,
      12,
    );

    expect(gates).toMatchObject([
      {
        id: "six",
        targetLabel: "6-A",
        chanceLabel: "69.23%",
        essenceReward: 100,
        rewardDreamsign: null,
        available: true,
      },
      {
        id: "nine",
        targetLabel: "9-A",
        chanceLabel: "46.15%",
        essenceReward: 150,
        rewardDreamsign: null,
        available: true,
      },
      {
        id: "jack",
        targetLabel: "J-A",
        chanceLabel: "30.77%",
        essenceReward: 200,
        rewardDreamsign: { id: "fixture-sign" },
        available: true,
      },
    ]);
  });

  it("keeps the committed card concealed until the shared result exists", () => {
    const state = {
      ...createDefaultState(),
      essence: 75,
      siteRuntime: { [GAMBLE_SITE.id]: RUNTIME },
    };
    const view = buildGambleSiteView({
      state,
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });
    expectGravokView(view);

    expect(view.runtimeReady).toBe(true);
    expect(view.canAfford).toBe(true);
    expect(view.canPlayAgain).toBe(false);
    expect(view.card).toEqual({ rank: "A", suit: "spades" });
    expect(view.guide.line).toBe(GUIDE_LINE);
    expect(view.result).toBeNull();
  });

  it("offers no further replay after two retries", () => {
    const resultRuntime: GravokWagerSiteRuntime = {
      ...RUNTIME,
      roundNumber: 3,
      result: {
        gateId: "jack",
        card: { rank: "2", suit: "clubs" },
        won: false,
        essenceGained: 0,
        essenceSettled: true,
        dreamsignAwarded: false,
        pendingDreamsignReplacement: false,
      },
    };
    const state = {
      ...createDefaultState(),
      siteRuntime: {
        [GAMBLE_SITE.id]: resultRuntime,
      },
    };

    const view = buildGambleSiteView({
      state,
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });
    expectGravokView(view);

    expect(view.canPlayAgain).toBe(false);
  });

  it("allows replay after a smaller win", () => {
    const view = buildGambleSiteView({
      state: {
        ...createDefaultState(),
        siteRuntime: {
          [GAMBLE_SITE.id]: {
            ...RUNTIME,
            result: {
              gateId: "nine",
              card: { rank: "Q", suit: "diamonds" },
              won: true,
              essenceGained: 150,
              essenceSettled: true,
              dreamsignAwarded: false,
              pendingDreamsignReplacement: false,
            },
          },
        },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });
    expectGravokView(view);

    expect(view.canPlayAgain).toBe(true);
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
      ...createDefaultState(),
      essence: 350,
      maxDreamsigns: 1,
      dreamsigns: [
        {
          id: "held-sign",
          name: "Held Sign",
          effectDescription: "Held effect.",
        },
      ],
      siteRuntime: { [GAMBLE_SITE.id]: resultRuntime },
    };
    const view = buildGambleSiteView({
      state,
      sceneNode: null,
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
      rewardDreamsign: { id: "fixture-sign" },
      pendingDreamsignReplacement: true,
    });
    expect(view.replacement).toMatchObject({
      pendingDreamsign: { id: "fixture-sign" },
      currentDreamsigns: [{ id: "held-sign" }],
      maxDreamsigns: 1,
    });
    expect(view.canPlayAgain).toBe(false);
  });

  it("resolves the resident Gamble guide without production copy assertions", () => {
    const guides: readonly DreamGuideContent[] = [
      {
        id: "fixture-gambler",
        name: "Fixture Gambler",
        homeDreamscapeId: "fixture-dreamscape",
        siteType: "Gamble",
        portraitSource: "fixture-guide.png",
        dialogue: { site: ["A fixture greeting."] },
        homeSpecialty: "Fixture specialty.",
      },
    ];

    expect(resolveGambleGuide(guides)?.id).toBe("fixture-gambler");
  });
});

const LADDER_RUNTIME: TidemarkLadderClimbSiteRuntime = {
  kind: "gamble",
  gameId: "tidemark-ladder-climb",
  rulesVersion: "fixture-ladder-rules",
  isFarpoint: false,
  shuffleCommitments: ["attempt-1", "attempt-2", "attempt-3", "attempt-4"],
  committedCards: [
    { rank: "J", suit: "clubs" },
    { rank: "10", suit: "diamonds" },
    { rank: "8", suit: "hearts" },
    { rank: "6", suit: "spades" },
  ],
  dreamsignCandidateScores: [{ dreamsignId: "fixture-sign", score: 1 }],
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
      ...createDefaultState(),
      essence: 75,
      siteRuntime: { [GAMBLE_SITE.id]: LADDER_RUNTIME },
    };
    const view = buildGambleSiteView({
      state,
      sceneNode: null,
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
    expect(view.rewardDreamsign?.id).toBe("fixture-sign");
  });

  it("reveals only the next cost after a settled miss", () => {
    const runtime: TidemarkLadderClimbSiteRuntime = {
      ...LADDER_RUNTIME,
      revealedCards: [LADDER_RUNTIME.committedCards[0]],
      cumulativeCost: 0,
      result: {
        attemptNumber: 1,
        card: LADDER_RUNTIME.committedCards[0],
        won: false,
        costPaid: 0,
        cumulativeCost: 0,
        resultSettled: true,
        dreamsignAwarded: false,
        pendingDreamsignReplacement: false,
      },
    };
    const view = buildGambleSiteView({
      state: {
        ...createDefaultState(),
        essence: 4,
        siteRuntime: { [GAMBLE_SITE.id]: runtime },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });

    expect(view?.gameId).toBe("tidemark-ladder-climb");
    if (view?.gameId !== "tidemark-ladder-climb") {
      throw new Error("expected Ladder Climb view");
    }
    expect(view.nextDraw).toEqual({
      attemptNumber: 2,
      targetRank: "10",
      cost: 5,
      canAfford: false,
      available: true,
    });
    expect(view.result).toMatchObject({
      attemptNumber: 1,
      targetRank: "Q",
      won: false,
    });
    expect(view.rewardDreamsign?.id).toBe("fixture-sign");
  });

  it("keeps the locked Dreamsign stable while a winning result settles", () => {
    const winningResult = {
      attemptNumber: 1 as const,
      card: { rank: "Q" as const, suit: "hearts" as const },
      won: true,
      costPaid: 0,
      cumulativeCost: 0,
      resultSettled: false,
      dreamsignAwarded: false,
      pendingDreamsignReplacement: false,
    };
    const build = (resultSettled: boolean) =>
      buildGambleSiteView({
        state: {
          ...createDefaultState(),
          siteRuntime: {
            [GAMBLE_SITE.id]: {
              ...LADDER_RUNTIME,
              revealedCards: [winningResult.card],
              cumulativeCost: 0,
              result: { ...winningResult, resultSettled },
            },
          },
        },
        sceneNode: null,
        site: GAMBLE_SITE,
        guide: GUIDE,
        guideLine: GUIDE_LINE,
      });

    const before = build(false);
    const after = build(true);
    expect(before?.gameId).toBe("tidemark-ladder-climb");
    expect(after?.gameId).toBe("tidemark-ladder-climb");
    if (
      before?.gameId !== "tidemark-ladder-climb" ||
      after?.gameId !== "tidemark-ladder-climb"
    ) {
      throw new Error("expected Ladder Climb views");
    }
    expect(before.rewardDreamsign?.id).toBe("fixture-sign");
    expect(after.rewardDreamsign?.id).toBe("fixture-sign");
    expect(after.nextDraw).toBeNull();
  });

  it("maps Farpoint's reduced current cost", () => {
    const view = buildGambleSiteView({
      state: {
        ...createDefaultState(),
        siteRuntime: {
          [GAMBLE_SITE.id]: { ...LADDER_RUNTIME, isFarpoint: true },
        },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });

    expect(view?.gameId).toBe("tidemark-ladder-climb");
    if (view?.gameId !== "tidemark-ladder-climb") {
      throw new Error("expected Ladder Climb view");
    }
    expect(view.nextDraw?.cost).toBe(0);
  });
});

const STARWAY_RUNTIME: StarwayStairsSiteRuntime = {
  kind: "gamble",
  gameId: "starway-stairs",
  rulesVersion: "fixture-starway-rules",
  roundNumber: 1,
  isFarpoint: false,
  wagerAmount: 30,
  shuffleCommitments: ["tier-1", "tier-2", "tier-3"],
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
        ...createDefaultState(),
        essence: 30,
        siteRuntime: { [GAMBLE_SITE.id]: STARWAY_RUNTIME },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });

    expect(view?.gameId).toBe("starway-stairs");
    if (view?.gameId !== "starway-stairs") {
      throw new Error("expected Starway Stairs view");
    }
    expect(view.guide.line).toBe(GUIDE_LINE);
    expect(view.currentTierNumber).toBe(1);
    expect(view.tiers).toMatchObject([
      {
        tierNumber: 1,
        drawTargetLabel: "3-A",
        essenceReward: 60,
        state: "current",
      },
      {
        tierNumber: 2,
        drawTargetLabel: "5-A",
        essenceReward: 140,
        state: "future",
      },
      {
        tierNumber: 3,
        drawTargetLabel: "8-A",
        essenceReward: 300,
        state: "future",
      },
    ]);
    expect(view.canAffordWager).toBe(true);
    expect(view.canPlayAgain).toBe(false);
    expect(view.cashOutReward).toBeNull();
  });

  it("advances the current tier and offers the latest safe prize", () => {
    const view = buildGambleSiteView({
      state: {
        ...createDefaultState(),
        siteRuntime: {
          [GAMBLE_SITE.id]: {
            ...STARWAY_RUNTIME,
            results: [
              {
                tierNumber: 1,
                card: { rank: "3", suit: "clubs" },
                busted: false,
                resultSettled: true,
              },
            ],
          },
        },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });

    expect(view?.gameId).toBe("starway-stairs");
    if (view?.gameId !== "starway-stairs") {
      throw new Error("expected Starway Stairs view");
    }
    expect(view.currentTierNumber).toBe(2);
    expect(view.cashOutReward).toBe(60);
    expect(view.tiers.map((tier) => tier.state)).toEqual([
      "safe",
      "current",
      "future",
    ]);
    expect(view.canPlayAgain).toBe(false);
  });

  it("allows another round after a bust", () => {
    const view = buildGambleSiteView({
      state: {
        ...createDefaultState(),
        siteRuntime: {
          [GAMBLE_SITE.id]: {
            ...STARWAY_RUNTIME,
            results: [
              {
                tierNumber: 1,
                card: { rank: "2", suit: "spades" },
                busted: true,
                resultSettled: true,
              },
            ],
            terminalReason: "bust",
          },
        },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });

    expect(view?.gameId).toBe("starway-stairs");
    if (view?.gameId !== "starway-stairs") {
      throw new Error("expected Starway Stairs view");
    }
    expect(view.canPlayAgain).toBe(true);
  });

  it("does not replay after taking a prize", () => {
    const view = buildGambleSiteView({
      state: {
        ...createDefaultState(),
        siteRuntime: {
          [GAMBLE_SITE.id]: {
            ...STARWAY_RUNTIME,
            results: [
              {
                tierNumber: 1,
                card: { rank: "3", suit: "clubs" },
                busted: false,
                resultSettled: true,
              },
            ],
            terminalReason: "cashed-out",
            prizeAwarded: 60,
          },
        },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });

    expect(view?.gameId).toBe("starway-stairs");
    if (view?.gameId !== "starway-stairs") {
      throw new Error("expected Starway Stairs view");
    }
    expect(view.canPlayAgain).toBe(false);
  });

  it("maps a terminal top win without another current tier", () => {
    const results: StarwayStairsSiteRuntime["results"] = [
      {
        tierNumber: 1,
        card: { rank: "3", suit: "clubs" },
        busted: false,
        resultSettled: true,
      },
      {
        tierNumber: 2,
        card: { rank: "5", suit: "diamonds" },
        busted: false,
        resultSettled: true,
      },
      {
        tierNumber: 3,
        card: { rank: "8", suit: "hearts" },
        busted: false,
        resultSettled: true,
      },
    ];
    const view = buildGambleSiteView({
      state: {
        ...createDefaultState(),
        siteRuntime: {
          [GAMBLE_SITE.id]: {
            ...STARWAY_RUNTIME,
            roundNumber: 1,
            results,
            terminalReason: "top",
            prizeAwarded: 300,
          },
        },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });

    expect(view?.gameId).toBe("starway-stairs");
    if (view?.gameId !== "starway-stairs") {
      throw new Error("expected Starway Stairs view");
    }
    expect(view.currentTierNumber).toBeNull();
    expect(view.cashOutReward).toBeNull();
    expect(view.terminalReason).toBe("top");
    expect(view.prizeAwarded).toBe(300);
    expect(view.canPlayAgain).toBe(false);
  });
});

function fourSuitCard(index: number): CardData {
  return {
    name: asCardName(`Four Suit Fixture ${String(index)}`),
    id: asCardId(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
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
    entryId,
    cardId: card.id,
    cardNumber: card.cardNumber,
    cardSnapshot: card,
    transfigurationOffers: [
      {
        entryId,
        type: "Empowered",
        effectDescription: "Fixture form.",
        effectDetails: { fixture: true },
        previewCard: { ...card, energyCost: 1 },
        essenceCost: 0,
      },
    ],
  };
}

describe("gamble-site-view-model — Four-Suit Reprise", () => {
  it("maps free forms and removes every used card UUID from later rounds", () => {
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
      rulesVersion: "fixture-four-suit-rules",
      isFarpoint: false,
      drawCost: 25,
      shuffleCommitments: ["round-1", "round-2", "round-3"],
      committedCards: [
        { rank: "4", suit: "diamonds" },
        { rank: "7", suit: "hearts" },
        { rank: "Q", suit: "clubs" },
      ],
      targets: [target, sameCardCopy, nextTarget],
      rounds: [
        {
          roundNumber: 1,
          shuffleCommitment: "round-1",
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
        ...createDefaultState(),
        essence: 25,
        deck: runtime.targets.map((candidate) => ({
          entryId: candidate.entryId,
          cardNumber: candidate.cardNumber,
          transfiguration: null,
          isBane: false,
        })),
        siteRuntime: { [GAMBLE_SITE.id]: runtime },
      },
      sceneNode: null,
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
        essenceCost: form.essenceCost,
        affordable: form.affordable,
      })),
    ).toEqual([
      {
        type: "Empowered",
        essenceCost: 0,
        affordable: true,
      },
    ]);
    expect(view.canPlayAgain).toBe(true);

    const replayView = buildGambleSiteView({
      state: {
        ...createDefaultState(),
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
      sceneNode: null,
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
    rulesVersion: "fixture-blackjack-rules",
    isFarpoint: false,
    wagerCost: 50,
    prizeEssence: 300,
    attemptNumber: 1,
    shuffleCommitment: "fixture-blackjack-commitment",
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
        ...createDefaultState(),
        essence: 64,
        siteRuntime: { [GAMBLE_SITE.id]: runtime },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: null,
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

  it("reveals both final totals and the flat player-win award", () => {
    const view = buildGambleSiteView({
      state: {
        ...createDefaultState(),
        siteRuntime: {
          [GAMBLE_SITE.id]: {
            ...runtime,
            playerCards: [
              { rank: "10", suit: "clubs" },
              { rank: "9", suit: "hearts" },
            ],
            dealerCards: [
              { rank: "10", suit: "spades" },
              { rank: "8", suit: "diamonds" },
            ],
            dealerRevealed: true,
            outcome: "player-win",
            resultSettled: true,
            essenceAwarded: 300,
          },
        },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: null,
    });
    expect(view?.gameId).toBe("blackjack");
    if (view?.gameId !== "blackjack") {
      throw new Error("expected Blackjack view");
    }
    expect(view).toMatchObject({
      playerTotal: 19,
      dealerTotal: 18,
      outcome: "player-win",
      essenceAwarded: 300,
      canPlayAgain: false,
    });
  });

  it("offers another paid hand after a settled push", () => {
    const view = buildGambleSiteView({
      state: {
        ...createDefaultState(),
        essence: 50,
        siteRuntime: {
          [GAMBLE_SITE.id]: {
            ...runtime,
            dealerRevealed: true,
            outcome: "push",
            resultSettled: true,
            essenceAwarded: 50,
          },
        },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: null,
    });
    expect(view?.gameId).toBe("blackjack");
    if (view?.gameId !== "blackjack") {
      throw new Error("expected Blackjack view");
    }
    expect(view.canPlayAgain).toBe(true);
  });

  it("offers up to two additional paid hands after dealer wins", () => {
    const view = buildGambleSiteView({
      state: {
        ...createDefaultState(),
        essence: 50,
        siteRuntime: {
          [GAMBLE_SITE.id]: {
            ...runtime,
            playerCards: [
              { rank: "10", suit: "clubs" },
              { rank: "9", suit: "hearts" },
            ],
            dealerCards: [
              { rank: "A", suit: "spades" },
              { rank: "K", suit: "diamonds" },
            ],
            dealerRevealed: true,
            outcome: "dealer-win",
            resultSettled: true,
          },
        },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: null,
    });
    expect(view?.gameId).toBe("blackjack");
    if (view?.gameId !== "blackjack") {
      throw new Error("expected Blackjack view");
    }
    expect(view).toMatchObject({
      attemptNumber: 1,
      maxAttempts: 3,
      canPlayAgain: true,
    });

    const finalAttemptView = buildGambleSiteView({
      state: {
        ...createDefaultState(),
        essence: 50,
        siteRuntime: {
          [GAMBLE_SITE.id]: {
            ...runtime,
            attemptNumber: 3,
            playerCards: [
              { rank: "10", suit: "clubs" },
              { rank: "9", suit: "hearts" },
            ],
            dealerCards: [
              { rank: "A", suit: "spades" },
              { rank: "K", suit: "diamonds" },
            ],
            dealerRevealed: true,
            outcome: "dealer-win",
            resultSettled: true,
          },
        },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: null,
    });
    expect(finalAttemptView?.gameId).toBe("blackjack");
    if (finalAttemptView?.gameId === "blackjack") {
      expect(finalAttemptView.canPlayAgain).toBe(false);
    }
  });

});
