import { describe, expect, it } from "vitest";
import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import type { GravokGateId, StandardPlayingCardRank } from "../../types/gamble";
import { LayerName } from "../../types/layer-name";
import type {
  Dreamsign,
  GambleSiteRuntime,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";

const SITE_ID = "fixture-gamble";
const NODE_ID = "fixture-node";
const GENESIS: Genesis = {
  seed: "fixture-seed",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: {
    poolVariant: "test",
    draftMode: "pool",
    fresh20PackSize: null,
  },
};
const REWARD_DREAMSIGN: Dreamsign = {
  id: "reward-sign",
  name: "Reward Sign",
  effectDescription: "Fixture effect.",
  isBane: false,
};

function runtime(
  rank: StandardPlayingCardRank,
  overrides: Partial<GambleSiteRuntime> = {},
): GambleSiteRuntime {
  return {
    kind: "gamble",
    gameId: "gravok-three-gate-wager",
    rulesVersion: "fixture-rules",
    isFarpoint: false,
    wagerCost: 50,
    shuffleCommitment: "fixture-commitment",
    committedCard: { rank, suit: "clubs" },
    dreamsignCandidateIds: ["reward-sign"],
    rewardDreamsign: REWARD_DREAMSIGN,
    result: null,
    ...overrides,
  };
}

function stateWith(
  rank: StandardPlayingCardRank,
  overrides: Partial<JourneyState> = {},
  runtimeOverrides: Partial<GambleSiteRuntime> = {},
): FoldState {
  const base = genesisFoldState(GENESIS);
  const site: SiteState = {
    id: SITE_ID,
    type: "Gamble",
    isEnhanced: false,
    isVisited: false,
  };
  return {
    ...base,
    journey: {
      ...base.journey,
      essence: 200,
      maxDreamsigns: 12,
      remainingDreamsignPool: ["reward-sign", "other-sign"],
      currentDreamscape: NODE_ID,
      activeSiteId: SITE_ID,
      screen: { type: "site", siteId: SITE_ID },
      atlas: {
        ...base.journey.atlas,
        startingNodeId: NODE_ID,
        currentNodeId: NODE_ID,
        nodes: {
          [NODE_ID]: {
            id: NODE_ID,
            layer: LayerName.Two,
            indexInLayer: 0,
            dreamscapeId: "fixture-dreamscape",
            biomeName: "Fixture",
            biomeColor: "#ffffff",
            sites: [site],
            position: { x: 0, y: 0 },
            state: "available",
            enhancedSiteType: null,
            forwardIds: [],
            backwardIds: [],
            knownDreamsignId: null,
          },
        },
      },
      siteRuntime: {
        [SITE_ID]: runtime(rank, runtimeOverrides),
      },
      ...overrides,
    },
  };
}

function apply(
  state: FoldState,
  type:
    | "PLACE_GRAVOK_WAGER"
    | "SETTLE_GRAVOK_WAGER"
    | "REPLACE_GRAVOK_WAGER_DREAMSIGN"
    | "COMPLETE_SITE",
  payload: Record<string, unknown>,
) {
  const event: GameEvent = {
    type,
    payload,
    actor: "fixture-player",
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
  const context: EventContext = {
    seq: 1,
    timestamp: "1970-01-01T00:00:00.000Z",
    rng: () => 0.5,
    intervening: [],
  };
  return reduceGameEvent(state, event, context);
}

function wager(state: FoldState, gateId: GravokGateId) {
  return apply(state, "PLACE_GRAVOK_WAGER", { siteId: SITE_ID, gateId });
}

function settleWager(state: FoldState) {
  return apply(state, "SETTLE_GRAVOK_WAGER", { siteId: SITE_ID });
}

describe("Gravok's Three-Gate Wager", () => {
  it("settles the Six Gate exactly once when its result is presented", () => {
    const wagered = wager(stateWith("6"), "six");

    expect(wagered.outcome).toBe("applied");
    expect(wagered.state.journey.essence).toBe(200);
    expect(wagered.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      kind: "gamble",
      result: {
        gateId: "six",
        card: { rank: "6", suit: "clubs" },
        won: true,
        essenceGained: 100,
        essenceSettled: false,
      },
    });
    expect(
      apply(wagered.state, "COMPLETE_SITE", { siteId: SITE_ID }).outcome,
    ).toBe("bounced");

    const settled = settleWager(wagered.state);
    expect(settled.outcome).toBe("applied");
    expect(settled.state.journey.essence).toBe(250);
    expect(settled.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: { essenceSettled: true },
    });
    const duplicate = settleWager(settled.state);
    expect(duplicate.outcome).toBe("bounced");
    expect(duplicate.state).toEqual(settled.state);
  });

  it("busts below the chosen threshold and grants no reward", () => {
    const out = wager(stateWith("10"), "jack");

    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(200);
    expect(out.state.journey.dreamsigns).toEqual([]);
    expect(out.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: { won: false, essenceGained: 0, dreamsignAwarded: false },
    });
    expect(settleWager(out.state).state.journey.essence).toBe(150);
  });

  it("awards both jackpot rewards and spends the UUID-backed Dreamsign", () => {
    const out = wager(stateWith("J"), "jack");

    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(200);
    expect(out.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([
      "reward-sign",
    ]);
    expect(out.state.journey.remainingDreamsignPool).toEqual(["other-sign"]);
    expect(out.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: {
        won: true,
        dreamsignAwarded: true,
        pendingDreamsignReplacement: false,
      },
    });
    expect(settleWager(out.state).state.journey.essence).toBe(350);
  });

  it("applies Farpoint's free cost without changing thresholds or payouts", () => {
    const out = wager(
      stateWith("9", {}, { isFarpoint: true, wagerCost: 0 }),
      "nine",
    );

    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(200);
    expect(out.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: { gateId: "nine", won: true, essenceGained: 150 },
    });
    expect(settleWager(out.state).state.journey.essence).toBe(350);
  });

  it("bounces an unaffordable wager and an unavailable jackpot", () => {
    const poor = wager(stateWith("A", { essence: 49 }), "six");
    const unavailable = wager(
      stateWith("A", {}, { rewardDreamsign: null, dreamsignCandidateIds: [] }),
      "jack",
    );

    expect(poor.outcome).toBe("bounced");
    expect(poor.state.journey.essence).toBe(49);
    expect(unavailable.outcome).toBe("bounced");
    expect(unavailable.state.journey.essence).toBe(200);
  });

  it("holds a jackpot Dreamsign at the cap until a UUID replacement resolves", () => {
    const held: Dreamsign = {
      id: "held-sign",
      name: "Held Sign",
      effectDescription: "Held effect.",
      isBane: false,
    };
    const won = wager(
      stateWith("A", { maxDreamsigns: 1, dreamsigns: [held] }),
      "jack",
    );

    expect(won.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([
      "held-sign",
    ]);
    expect(won.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: {
        pendingDreamsignReplacement: true,
        dreamsignAwarded: false,
      },
    });

    const unsettledReplacement = apply(
      won.state,
      "REPLACE_GRAVOK_WAGER_DREAMSIGN",
      {
        siteId: SITE_ID,
        replacedDreamsignId: "held-sign",
      },
    );
    expect(unsettledReplacement.outcome).toBe("bounced");

    const settled = settleWager(won.state);
    const replaced = apply(settled.state, "REPLACE_GRAVOK_WAGER_DREAMSIGN", {
      siteId: SITE_ID,
      replacedDreamsignId: "held-sign",
    });
    expect(replaced.outcome).toBe("applied");
    expect(replaced.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([
      "reward-sign",
    ]);
    expect(replaced.state.journey.visitedSites).toContain(SITE_ID);
    expect(replaced.state.journey.screen).toEqual({ type: "dreamscape" });
    expect(replaced.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: {
        dreamsignAwarded: true,
        pendingDreamsignReplacement: false,
        replacedDreamsignId: "held-sign",
      },
    });
  });

  it("rejects a second wager against a resolved commitment", () => {
    const first = wager(stateWith("Q"), "nine");
    const second = wager(first.state, "six");

    expect(second.outcome).toBe("bounced");
    expect(second.state).toEqual(first.state);
  });
});
