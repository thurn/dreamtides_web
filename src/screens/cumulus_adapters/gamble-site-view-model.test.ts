import { describe, expect, it } from "vitest";
import { createDefaultState } from "../../state/journey-context";
import type { DreamGuideContent } from "../../types/content";
import type { GambleSiteRuntime, SiteState } from "../../types/journey";
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

const RUNTIME: GambleSiteRuntime = {
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
    isBane: false,
  },
  result: null,
};

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

    expect(view.runtimeReady).toBe(true);
    expect(view.canAfford).toBe(true);
    expect(view.canPlayAgain).toBe(true);
    expect(view.card).toEqual({ rank: "A", suit: "spades" });
    expect(view.guide.line).toBe(GRAVOK_WAGER_GUIDE_LINE);
    expect(view.result).toBeNull();
  });

  it("offers no further replay after three retries", () => {
    const state = {
      ...createDefaultState(),
      siteRuntime: {
        [GAMBLE_SITE.id]: { ...RUNTIME, roundNumber: 4 },
      },
    };

    const view = buildGambleSiteView({
      state,
      sceneNode: null,
      site: GAMBLE_SITE,
      guide: null,
    });

    expect(view.canPlayAgain).toBe(false);
  });

  it("maps a jackpot result and its at-cap replacement by UUID", () => {
    const resultRuntime: GambleSiteRuntime = {
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
          isBane: false,
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
