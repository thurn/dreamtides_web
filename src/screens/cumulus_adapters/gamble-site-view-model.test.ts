import { describe, expect, it } from "vitest";
import { createDefaultState } from "../../state/journey-context";
import type { DreamGuideContent } from "../../types/content";
import type {
  GravokWagerSiteRuntime,
  SiteState,
  TidemarkProgressiveSiteRuntime,
} from "../../types/journey";
import type {
  GambleSiteView,
  GravokWagerSiteView,
} from "../../cumulus/screens/GambleSiteScreen";
import {
  buildGambleGateViews,
  buildGambleSiteView,
  gravokRevealGateId,
  GRAVOK_WAGER_GUIDE_LINE,
  resolveGambleGuide,
} from "./gamble-site-view-model";

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
    isNegative: false,
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
    expect(gravokRevealGateId("six")).toBe("nine");
    expect(gravokRevealGateId("nine")).toBe("jack");
    expect(gravokRevealGateId("jack")).toBe("six");
  });

  it("maps all exact gate targets, odds, rewards, and the locked jackpot", () => {
    const gates = buildGambleGateViews(RUNTIME, 12);

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
      guide: null,
    });
    expectGravokView(view);

    expect(view.runtimeReady).toBe(true);
    expect(view.canAfford).toBe(true);
    expect(view.canPlayAgain).toBe(true);
    expect(view.card).toEqual({ rank: "A", suit: "spades" });
    expect(view.guide.line).toBe(GRAVOK_WAGER_GUIDE_LINE);
    expect(view.result).toBeNull();
  });

  it("offers no further replay after two retries", () => {
    const state = {
      ...createDefaultState(),
      siteRuntime: {
        [GAMBLE_SITE.id]: { ...RUNTIME, roundNumber: 3 },
      },
    };

    const view = buildGambleSiteView({
      state,
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: null,
    });
    expectGravokView(view);

    expect(view.canPlayAgain).toBe(false);
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
          isNegative: false,
        },
      ],
      siteRuntime: { [GAMBLE_SITE.id]: resultRuntime },
    };
    const view = buildGambleSiteView({
      state,
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: null,
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
  });

  it("resolves the resident Gamble guide without production copy assertions", () => {
    const guides: readonly DreamGuideContent[] = [
      {
        id: "fixture-gambler",
        name: "Fixture Gambler",
        homeDreamscapeId: "fixture-dreamscape",
        siteType: "Gamble",
        dialog: ["A fixture greeting."],
        homeSpecialty: "Fixture specialty.",
      },
    ];

    expect(resolveGambleGuide(guides)?.id).toBe("fixture-gambler");
  });
});

const PROGRESSIVE_RUNTIME: TidemarkProgressiveSiteRuntime = {
  kind: "gamble",
  gameId: "tidemark-progressive-draw",
  rulesVersion: "fixture-progressive-rules",
  isFarpoint: false,
  shuffleCommitments: ["attempt-1", "attempt-2", "attempt-3", "attempt-4"],
  committedCards: [
    { rank: "J", suit: "clubs" },
    { rank: "10", suit: "diamonds" },
    { rank: "8", suit: "hearts" },
    { rank: "6", suit: "spades" },
  ],
  dreamsignCandidateScores: [
    { dreamsignId: "fixture-sign", score: 1 },
  ],
  strongPoolSize: 1,
  strongPoolCutoffScore: 1,
  rewardDreamsign: RUNTIME.rewardDreamsign,
  revealedCards: [],
  cumulativeCost: 0,
  result: null,
};

describe("gamble-site-view-model — Progressive Draw", () => {
  it("shows only draw one and keeps the locked Dreamsign out of the view", () => {
    const state = {
      ...createDefaultState(),
      essence: 75,
      siteRuntime: { [GAMBLE_SITE.id]: PROGRESSIVE_RUNTIME },
    };
    const view = buildGambleSiteView({
      state,
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: null,
    });

    expect(view?.gameId).toBe("tidemark-progressive-draw");
    if (view?.gameId !== "tidemark-progressive-draw") {
      throw new Error("expected Progressive Draw view");
    }
    expect(view.nextDraw).toEqual({
      attemptNumber: 1,
      targetRank: "Q",
      cost: 15,
      canAfford: true,
      available: true,
    });
    expect(view.result).toBeNull();
    expect(view).not.toHaveProperty("rewardDreamsign");
  });

  it("reveals only the next cost after a settled miss", () => {
    const runtime: TidemarkProgressiveSiteRuntime = {
      ...PROGRESSIVE_RUNTIME,
      revealedCards: [PROGRESSIVE_RUNTIME.committedCards[0]],
      cumulativeCost: 15,
      result: {
        attemptNumber: 1,
        card: PROGRESSIVE_RUNTIME.committedCards[0],
        won: false,
        costPaid: 15,
        cumulativeCost: 15,
        resultSettled: true,
        dreamsignAwarded: false,
        pendingDreamsignReplacement: false,
      },
    };
    const view = buildGambleSiteView({
      state: {
        ...createDefaultState(),
        essence: 20,
        siteRuntime: { [GAMBLE_SITE.id]: runtime },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: null,
    });

    expect(view?.gameId).toBe("tidemark-progressive-draw");
    if (view?.gameId !== "tidemark-progressive-draw") {
      throw new Error("expected Progressive Draw view");
    }
    expect(view.nextDraw).toEqual({
      attemptNumber: 2,
      targetRank: "10",
      cost: 25,
      canAfford: false,
      available: true,
    });
    expect(view.result).toMatchObject({
      attemptNumber: 1,
      targetRank: "Q",
      won: false,
      rewardDreamsign: null,
    });
  });

  it("reveals the Dreamsign only after a winning result settles", () => {
    const winningResult = {
      attemptNumber: 1 as const,
      card: { rank: "Q" as const, suit: "hearts" as const },
      won: true,
      costPaid: 15,
      cumulativeCost: 15,
      resultSettled: false,
      dreamsignAwarded: false,
      pendingDreamsignReplacement: false,
    };
    const build = (resultSettled: boolean) => buildGambleSiteView({
      state: {
        ...createDefaultState(),
        siteRuntime: {
          [GAMBLE_SITE.id]: {
            ...PROGRESSIVE_RUNTIME,
            revealedCards: [winningResult.card],
            cumulativeCost: 15,
            result: { ...winningResult, resultSettled },
          },
        },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: null,
    });

    const before = build(false);
    const after = build(true);
    expect(before?.gameId).toBe("tidemark-progressive-draw");
    expect(after?.gameId).toBe("tidemark-progressive-draw");
    if (
      before?.gameId !== "tidemark-progressive-draw" ||
      after?.gameId !== "tidemark-progressive-draw"
    ) {
      throw new Error("expected Progressive Draw views");
    }
    expect(before.result?.rewardDreamsign).toBeNull();
    expect(after.result?.rewardDreamsign).toMatchObject({
      id: "fixture-sign",
    });
    expect(after.nextDraw).toBeNull();
  });

  it("maps Farpoint's reduced current cost", () => {
    const view = buildGambleSiteView({
      state: {
        ...createDefaultState(),
        siteRuntime: {
          [GAMBLE_SITE.id]: { ...PROGRESSIVE_RUNTIME, isFarpoint: true },
        },
      },
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: null,
    });

    expect(view?.gameId).toBe("tidemark-progressive-draw");
    if (view?.gameId !== "tidemark-progressive-draw") {
      throw new Error("expected Progressive Draw view");
    }
    expect(view.nextDraw?.cost).toBe(10);
  });
});
