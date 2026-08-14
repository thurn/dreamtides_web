import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { economyFixture } from "../../testing/economy-fixture";
import { MINIMAL_SITES_DATA } from "../../__test-helpers__/atlas-fixtures";

import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import { LayerName } from "../../types/layer-name";
import type {
  DeckEntry,
  Dreamsign,
  DreamscapeNode,
  JourneyState,
  ShopSiteRuntime,
  SiteRuntimeState,
  SiteState,
  SiteType,
} from "../../types/journey";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import { registerSiteContentProvider, type SiteContentProvider } from "./sites";
import { asDreamscapeId } from "../../types/identifiers";
import { asDeckEntryId } from "../../types/identifiers";
import { asGuideId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import { asSiteId } from "../../types/identifiers";
import { asExplorationActionId } from "../../types/identifiers";
import { asDreamsignId } from "../../types/identifiers";
import { asAtlasNodeId } from "../../types/identifiers";
import { asShuffleCommitment } from "../../types/identifiers";
import { asClientId } from "../../types/identifiers";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS: Genesis = {
  seed: "sites-seed",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: {
    poolVariant: "tides4",
  },
};

/** A deterministic PRNG bound to a seed so a generation draw is reproducible. */
function makeRng(seed: number): (drawIndex: number) => number {
  return (drawIndex: number) => {
    let x = (seed + drawIndex * 2654435761) >>> 0;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x1_0000_0000;
  };
}

function ctx(overrides: Partial<EventContext> = {}): EventContext {
  return {
    seq: 42,
    rng: makeRng(1),
    intervening: [],
    timestamp: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function event(
  type: string,
  payload: Record<string, unknown>,
  actor = "alice",
): GameEvent {
  return {
    type,
    payload,
    actor,
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
}

function reduce(
  state: FoldState,
  type: string,
  payload: Record<string, unknown>,
  context: EventContext = ctx(),
): ReduceResult {
  return reduceGameEvent(state, event(type, payload), context);
}

function makeEntry(
  overrides: Partial<DeckEntry> & { entryId: DeckEntryId },
): DeckEntry {
  return {
    cardNumber: 1,
    transfiguration: null,
    isBane: false,
    ...overrides,
  };
}

function dreamsign(id: string): Dreamsign {
  return { id: asDreamsignId(id), name: "n", effectDescription: "e" };
}

const SITE_ID = "site-1";
const NODE_ID = "node-1";

function makeSite(type: SiteType, isEnhanced = false): SiteState {
  return {
    id: asSiteId(SITE_ID),
    type,
    isEnhanced,
    isVisited: false,
    data: {},
  };
}

function makeNode(sites: SiteState[]): DreamscapeNode {
  return {
    id: asAtlasNodeId(NODE_ID),
    layer: LayerName.Two,
    indexInLayer: 0,
    dreamscapeId: asDreamscapeId("d1"),
    sites,
    position: { x: 0, y: 0 },
    state: "available",
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
  };
}

/**
 * A journey state with one dreamscape node holding `sites`, the player standing
 * in that node so `canVisitSite` passes for a non-Battle site.
 */
function stateWithSites(
  sites: SiteState[],
  overrides: Partial<JourneyState> = {},
): FoldState {
  const base = genesisFoldState(GENESIS);
  return {
    ...base,
    journey: {
      ...base.journey,
      currentDreamscape: asAtlasNodeId(NODE_ID),
      atlas: {
        ...base.journey.atlas,
        nodes: { [NODE_ID]: makeNode(sites) },
        startingNodeId: asAtlasNodeId(NODE_ID),
        currentNodeId: asAtlasNodeId(NODE_ID),
      },
      screen: { type: "site", siteId: asSiteId(SITE_ID) },
      activeSiteId: asSiteId(SITE_ID),
      ...overrides,
    },
  };
}

function siteState(
  type: SiteType,
  overrides: Partial<JourneyState> = {},
): FoldState {
  return stateWithSites([makeSite(type)], overrides);
}

/**
 * A deterministic fake {@link SiteContentProvider} whose runtime embeds an
 * rng-derived value so re-folding the same event yields a byte-identical
 * runtime and a fresh seq yields a different one. Content-free types (essence,
 * augury) are generated purely in-reducer and never reach this provider.
 */
const fakeProvider: SiteContentProvider = {
  sitesData: MINIMAL_SITES_DATA,
  economyData: economyFixture(),
  openSite({ site, rng }) {
    const draw = Math.floor(rng(0) * 1_000_000);
    switch (site.type) {
      case "Reward":
        return {
          runtime: {
            kind: "reward",
            reward: { rewardType: "essence", essenceAmount: draw },
            remainingDreamsignPoolIds: [asDreamsignId(`pool-${String(draw)}`)],
            accepted: false,
          },
          remainingDreamsignPool: [asDreamsignId(`pool-${String(draw)}`)],
        };
      case "DreamsignRevelation":
        return {
          runtime: {
            kind: "dreamsignOffer",
            offeredDreamsigns: [dreamsign(`ds-${String(draw)}`)],
            remainingDreamsignPool: [asDreamsignId(`pool-${String(draw)}`)],
            accepted: false,
          },
          remainingDreamsignPool: [asDreamsignId(`pool-${String(draw)}`)],
        };
      case "Shop":
      case "DreamsignBazaar":
        return {
          runtime: {
            kind: "shop",
            slots: [
              {
                itemType: "card",
                cardNumber: draw,
                basePrice: 100,
                discountPercent: 0,
                purchased: false,
              },
            ],
            rerollCount: 0,
            remainingDreamsignPoolIds: [],
            purchaseHistory: [],
          },
        };
      case "Transfiguration":
        return {
          runtime: {
            kind: "cardChoice",
            choiceKind: "transfiguration",
            entryIds: [asDeckEntryId("deck-1")],
            acceptedEntryIds: [],
            transfigurationOffers: [
              {
                entryId: asDeckEntryId("deck-1"),
                type: "Empowered",
                effectDescription: "boost",
                effectDetails: { draw },
                previewCard: {} as never,
                essenceCost: 50,
              },
            ],
          },
        };
      case "Duplication":
        return {
          runtime: {
            kind: "cardChoice",
            choiceKind: "duplication",
            entryIds: [asDeckEntryId("deck-1")],
            acceptedEntryIds: [],
          },
        };
      case "Gamble":
        return {
          runtime: {
            kind: "gamble",
            gameId: "gravok-three-gate-wager",
            roundNumber: 1,
            isFarpoint: site.isEnhanced,
            wagerCost: site.isEnhanced ? 0 : 50,
            shuffleCommitment: asShuffleCommitment(`fixture-${String(draw)}`),
            committedCard: { rank: "7", suit: "clubs" },
            dreamsignCandidateIds: [],
            rewardDreamsign: null,
            result: null,
          },
        };
      default:
        return null;
    }
  },
};

afterEach(() => {
  registerSiteContentProvider(null);
});

function runtimeOf(result: ReduceResult): SiteRuntimeState | undefined {
  return result.state.journey.siteRuntime[SITE_ID];
}

describe("Random Site", () => {
  beforeEach(() => registerSiteContentProvider(fakeProvider));

  function homeRandomSite(): SiteState {
    return {
      ...makeSite("RandomSite", true),
      randomSite: {
        mode: "homeChoice",
        presentingGuideId: asGuideId("fixture-random-guide"),
        candidateSiteTypes: [
          "Shop",
          "Purge",
          "Augury",
          "Gamble",
          "Exploration",
        ],
      },
    };
  }

  it("persists three distinct deterministic home choices", () => {
    const first = reduce(stateWithSites([homeRandomSite()]), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    });
    const replay = reduce(stateWithSites([homeRandomSite()]), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    });
    expect(first.outcome).toBe("applied");
    expect(runtimeOf(first)).toEqual(runtimeOf(replay));
    const runtime = runtimeOf(first);
    expect(runtime?.kind).toBe("randomSite");
    if (runtime?.kind !== "randomSite")
      throw new Error("expected Random Site runtime");
    expect(runtime.offeredSiteTypes).toHaveLength(3);
    expect(new Set(runtime.offeredSiteTypes).size).toBe(3);
  });

  it("preserves the configured presenting guide when materializing a home choice", () => {
    const opened = reduce(stateWithSites([homeRandomSite()]), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    });
    const runtime = runtimeOf(opened);
    if (runtime?.kind !== "randomSite")
      throw new Error("expected Random Site runtime");
    const selected = runtime.offeredSiteTypes[0];
    const chosen = reduce(opened.state, "CHOOSE_RANDOM_SITE", {
      siteId: asSiteId(SITE_ID),
      siteType: selected,
    });
    const materialized = chosen.state.journey.atlas.nodes[NODE_ID].sites[0];
    expect(chosen.outcome).toBe("applied");
    expect(materialized).toMatchObject({
      id: SITE_ID,
      type: selected,
      isEnhanced: true,
      randomSite: {
        mode: "homeChoice",
        presentingGuideId: asGuideId("fixture-random-guide"),
        destinationSiteType: selected,
        materialized: true,
      },
    });
    expect(chosen.state.journey.siteRuntime[SITE_ID]).toBeUndefined();

    const stale = reduce(chosen.state, "CHOOSE_RANDOM_SITE", {
      siteId: asSiteId(SITE_ID),
      siteType: runtime.offeredSiteTypes[1],
    });
    expect(stale.outcome).toBe("bounced");
  });

  it("materializes a persisted single destination when entered", () => {
    const wrapper: SiteState = {
      ...makeSite("RandomSite", true),
      randomSite: {
        mode: "single",
        presentingGuideId: asGuideId("fixture-random-guide"),
        candidateSiteTypes: ["Exploration"],
        destinationSiteType: "Exploration",
      },
    };
    const base = stateWithSites([wrapper], {
      screen: { type: "dreamscape" },
      activeSiteId: null,
    });
    const entered = reduce(base, "ENTER_SITE", { siteId: asSiteId(SITE_ID) });
    expect(entered.outcome).toBe("applied");
    expect(entered.state.journey.atlas.nodes[NODE_ID].sites[0]).toMatchObject({
      id: SITE_ID,
      type: "Exploration",
      isEnhanced: true,
      randomSite: {
        presentingGuideId: asGuideId("fixture-random-guide"),
      },
    });
  });

  it("bounces choices that were not offered", () => {
    const opened = reduce(stateWithSites([homeRandomSite()]), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    });
    const out = reduce(opened.state, "CHOOSE_RANDOM_SITE", {
      siteId: asSiteId(SITE_ID),
      siteType: "DreamsignBazaar",
    });
    expect(out.outcome).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// OPEN_SITE — generation determinism
// ---------------------------------------------------------------------------

describe("OPEN_SITE generation determinism", () => {
  const providerTypes: SiteType[] = [
    "Reward",
    "DreamsignRevelation",
    "Shop",
    "Transfiguration",
    "Duplication",
    "Gamble",
  ];

  for (const type of providerTypes) {
    it(`${type}: same seed+seq folds to a hash-identical runtime`, () => {
      registerSiteContentProvider(fakeProvider);
      const deck = [
        makeEntry({ entryId: asDeckEntryId("deck-1"), cardNumber: 7 }),
      ];
      const a = reduce(siteState(type, { deck }), "OPEN_SITE", {
        siteId: asSiteId(SITE_ID),
      });
      const b = reduce(siteState(type, { deck }), "OPEN_SITE", {
        siteId: asSiteId(SITE_ID),
      });
      expect(a.outcome).toBe("applied");
      expect(b.outcome).toBe("applied");
      expect(runtimeOf(a)).toBeDefined();
      expect(JSON.stringify(runtimeOf(a))).toBe(JSON.stringify(runtimeOf(b)));
    });
  }

  it("Essence: pure in-reducer generation is deterministic in seed+seq", () => {
    registerSiteContentProvider(fakeProvider);
    const a = reduce(siteState("Essence"), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    });
    const b = reduce(siteState("Essence"), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    });
    expect(a.outcome).toBe("applied");
    const ra = runtimeOf(a);
    expect(ra?.kind).toBe("essence");
    expect(JSON.stringify(ra)).toBe(JSON.stringify(runtimeOf(b)));
  });

  it("Essence: enhanced site draws a larger band than a normal site", () => {
    registerSiteContentProvider(fakeProvider);
    const normal = reduce(siteState("Essence"), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    });
    const enhanced = reduce(
      stateWithSites([makeSite("Essence", true)]),
      "OPEN_SITE",
      { siteId: asSiteId(SITE_ID) },
    );
    const nAmount =
      runtimeOf(normal)?.kind === "essence"
        ? (runtimeOf(normal) as { amount: number }).amount
        : -1;
    const eAmount =
      runtimeOf(enhanced)?.kind === "essence"
        ? (runtimeOf(enhanced) as { amount: number }).amount
        : -1;
    expect(nAmount).toBeGreaterThanOrEqual(200);
    expect(nAmount).toBeLessThanOrEqual(300);
    expect(eAmount).toBeGreaterThanOrEqual(400);
    expect(eAmount).toBeLessThanOrEqual(600);
  });

  it("bounces a provider-backed type when no provider is registered", () => {
    const state = siteState("Reward");
    const out = reduce(state, "OPEN_SITE", { siteId: asSiteId(SITE_ID) });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });

  it("bounces a site type with no runtime (Battle)", () => {
    registerSiteContentProvider(fakeProvider);
    const out = reduce(siteState("Battle"), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    });
    expect(out.outcome).toBe("bounced");
  });

  it("bounces an unknown site id", () => {
    registerSiteContentProvider(fakeProvider);
    const out = reduce(siteState("Reward"), "OPEN_SITE", {
      siteId: asSiteId("ghost"),
    });
    expect(out.outcome).toBe("bounced");
  });

  it("applies a provider's T56 queue shift atomically with the Shop runtime", () => {
    const firstModifier = {
      kind: "free-next-shop" as const,
      sourceSiteId: asSiteId("exploration-one"),
      sourceActionId: asExplorationActionId("action-one"),
    };
    const secondModifier = {
      kind: "free-next-shop" as const,
      sourceSiteId: asSiteId("exploration-two"),
      sourceActionId: asExplorationActionId("action-two"),
    };
    registerSiteContentProvider({
      ...fakeProvider,
      openSite(input) {
        const generated = fakeProvider.openSite(input);
        if (generated === null || input.site.type !== "Shop") return generated;
        return {
          ...generated,
          runtime: {
            ...(generated.runtime as ShopSiteRuntime),
            freePurchaseSource: {
              sourceSiteId: firstModifier.sourceSiteId,
              sourceActionId: firstModifier.sourceActionId,
            },
          },
          shopModifiers: {
            ...input.journey.shopModifiers,
            freeNextShopModifiers: [secondModifier],
          },
        };
      },
    });
    const initial = siteState("Shop", {
      shopModifiers: {
        ...siteState("Shop").journey.shopModifiers,
        freeNextShopModifiers: [firstModifier, secondModifier],
      },
    });

    const opened = reduce(initial, "OPEN_SITE", { siteId: asSiteId(SITE_ID) });
    const duplicate = reduce(opened.state, "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    });

    expect(opened.outcome).toBe("applied");
    expect(opened.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      kind: "shop",
      purchaseHistory: [],
      freePurchaseSource: {
        sourceSiteId: firstModifier.sourceSiteId,
        sourceActionId: firstModifier.sourceActionId,
      },
    });
    expect(opened.state.journey.shopModifiers.freeNextShopModifiers).toEqual([
      secondModifier,
    ]);
    expect(duplicate.outcome).toBe("bounced");
    expect(duplicate.state).toEqual(opened.state);
  });
});

// ---------------------------------------------------------------------------
// OPEN_SITE — idempotence
// ---------------------------------------------------------------------------

describe("OPEN_SITE idempotence", () => {
  beforeEach(() => registerSiteContentProvider(fakeProvider));
  it("allows an observer to commit the displayed site's deterministic bootstrap", () => {
    const hosted = {
      ...siteState("Essence"),
      playtestControl: {
        mode: "single-controller" as const,
        controllerClientId: asClientId("controller"),
      },
    };

    const out = reduceGameEvent(
      hosted,
      event("OPEN_SITE", { siteId: asSiteId(SITE_ID) }, "observer"),
      ctx(),
    );

    expect(out.outcome).toBe("applied");
    expect(out.state.journey.siteRuntime[SITE_ID]?.kind).toBe("essence");
    expect(out.state.playtestControl?.controllerClientId).toBe("controller");
  });

  it("rejects an observer bootstrap for a site that is not displayed", () => {
    const hosted = {
      ...siteState("Essence", {
        screen: { type: "dreamscape" as const },
        activeSiteId: null,
      }),
      playtestControl: {
        mode: "single-controller" as const,
        controllerClientId: asClientId("controller"),
      },
    };

    const out = reduceGameEvent(
      hosted,
      event("OPEN_SITE", { siteId: asSiteId(SITE_ID) }, "observer"),
      ctx(),
    );

    expect(out.outcome).toBe("bounced");
    expect(out.bounceReason).toBe("observer_read_only");
  });

  it("bounces a repeated OPEN_SITE without changing or regenerating runtime", () => {
    const first = reduce(siteState("Essence"), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    });
    expect(first.outcome).toBe("applied");
    const second = reduce(first.state, "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    });
    expect(second.outcome).toBe("bounced");
    // Runtime is not regenerated/overwritten: state hash unchanged.
    expect(JSON.stringify(second.state.journey)).toBe(
      JSON.stringify(first.state.journey),
    );
    expect(second.state.journey.siteRuntime[SITE_ID]).toEqual(
      first.state.journey.siteRuntime[SITE_ID],
    );
  });

  it("a fresh seq does not overwrite an existing runtime", () => {
    const first = reduce(siteState("Essence"), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    });
    const second = reduce(
      first.state,
      "OPEN_SITE",
      { siteId: asSiteId(SITE_ID) },
      ctx({ seq: 99, rng: makeRng(777) }),
    );
    expect(second.outcome).toBe("bounced");
    expect(second.state.journey.siteRuntime[SITE_ID]).toEqual(
      first.state.journey.siteRuntime[SITE_ID],
    );
  });
});

// ---------------------------------------------------------------------------
// ACCEPT_ESSENCE
// ---------------------------------------------------------------------------

describe("ACCEPT_ESSENCE", () => {
  beforeEach(() => registerSiteContentProvider(fakeProvider));
  function opened(): FoldState {
    return reduce(siteState("Essence", { essence: 0 }), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    }).state;
  }

  it("adds the runtime amount, marks accepted, and completes the site", () => {
    const state = opened();
    const amount = (state.journey.siteRuntime[SITE_ID] as { amount: number })
      .amount;
    const out = reduce(state, "ACCEPT_ESSENCE", { siteId: asSiteId(SITE_ID) });
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(amount);
    expect(
      (out.state.journey.siteRuntime[SITE_ID] as { accepted: boolean })
        .accepted,
    ).toBe(true);
    expect(out.state.journey.visitedSites).toContain(SITE_ID);
    expect(out.state.journey.screen.type).toBe("dreamscape");
  });

  it("generates and accepts the reward atomically when the site was not opened", () => {
    const state = siteState("Essence", { essence: 450 });
    const out = reduce(state, "ACCEPT_ESSENCE", { siteId: asSiteId(SITE_ID) });
    expect(out.outcome).toBe("applied");
    const runtime = out.state.journey.siteRuntime[SITE_ID];
    expect(runtime?.kind).toBe("essence");
    if (runtime?.kind !== "essence")
      throw new Error("expected Essence runtime");
    expect(runtime.amount).toBeGreaterThanOrEqual(200);
    expect(runtime.amount).toBeLessThanOrEqual(300);
    expect(runtime.accepted).toBe(true);
    expect(out.state.journey.essence).toBe(
      state.journey.essence + runtime.amount,
    );
    expect(out.state.journey.visitedSites).toContain(SITE_ID);
  });

  it("bounces a double-accept on an already-accepted site", () => {
    const accepted = reduce(opened(), "ACCEPT_ESSENCE", {
      siteId: asSiteId(SITE_ID),
    }).state;
    const out = reduce(accepted, "ACCEPT_ESSENCE", {
      siteId: asSiteId(SITE_ID),
    });
    expect(out.outcome).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// ACCEPT_REWARD / dreamsign offer / reject
// ---------------------------------------------------------------------------

describe("ACCEPT_REWARD (essence reward)", () => {
  function opened(essence = 0): FoldState {
    registerSiteContentProvider(fakeProvider);
    return reduce(siteState("Reward", { essence }), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    }).state;
  }

  it("grants the essence reward and completes the site", () => {
    const state = opened();
    const amount = (
      state.journey.siteRuntime[SITE_ID] as {
        reward: { essenceAmount: number };
      }
    ).reward.essenceAmount;
    const out = reduce(state, "ACCEPT_REWARD", { siteId: asSiteId(SITE_ID) });
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(amount);
    expect(out.state.journey.visitedSites).toContain(SITE_ID);
  });

  it("bounces accept-before-open and double-accept", () => {
    const before = reduce(siteState("Reward"), "ACCEPT_REWARD", {
      siteId: asSiteId(SITE_ID),
    });
    expect(before.outcome).toBe("bounced");
    const accepted = reduce(opened(), "ACCEPT_REWARD", {
      siteId: asSiteId(SITE_ID),
    }).state;
    expect(
      reduce(accepted, "ACCEPT_REWARD", { siteId: asSiteId(SITE_ID) }).outcome,
    ).toBe("bounced");
  });
});

describe("ACCEPT_REWARD (Dreamsign reward at the cap)", () => {
  function openedAtCap(): FoldState {
    return siteState("Reward", {
      maxDreamsigns: 2,
      dreamsigns: [dreamsign("held-1"), dreamsign("held-2")],
      siteRuntime: {
        [SITE_ID]: {
          kind: "reward",
          reward: {
            rewardType: "dreamsign",
            dreamsign: dreamsign("reward-dreamsign"),
          },
          remainingDreamsignPoolIds: [],
          accepted: false,
        },
      },
    });
  }

  it("requires a purge slot, then replaces that held Dreamsign and completes the site", () => {
    const state = openedAtCap();

    const withoutReplacement = reduce(state, "ACCEPT_REWARD", {
      siteId: asSiteId(SITE_ID),
    });
    expect(withoutReplacement.outcome).toBe("bounced");
    expect(withoutReplacement.state.journey.visitedSites).not.toContain(
      SITE_ID,
    );

    const withReplacement = reduce(state, "ACCEPT_REWARD", {
      siteId: asSiteId(SITE_ID),
      purgeIndex: 1,
    });
    expect(withReplacement.outcome).toBe("applied");
    expect(
      withReplacement.state.journey.dreamsigns.map((sign) => sign.id),
    ).toEqual(["held-1", "reward-dreamsign"]);
    expect(withReplacement.state.journey.visitedSites).toContain(SITE_ID);
  });
});

describe("dreamsign offer accept / reject", () => {
  function opened(overrides: Partial<JourneyState> = {}): FoldState {
    registerSiteContentProvider(fakeProvider);
    return reduce(siteState("DreamsignRevelation", overrides), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    }).state;
  }

  it("accepts an offered dreamsign by id and appends it", () => {
    const state = opened();
    const offered = (
      state.journey.siteRuntime[SITE_ID] as {
        offeredDreamsigns: Dreamsign[];
      }
    ).offeredDreamsigns[0];
    const out = reduce(state, "ACCEPT_DREAMSIGN_OFFER", {
      siteId: asSiteId(SITE_ID),
      dreamsignId: offered.id,
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.dreamsigns.map((d) => d.id)).toContain(offered.id);
    expect(out.state.journey.visitedSites).toContain(SITE_ID);
  });

  it("bounces an unoffered dreamsign id", () => {
    const out = reduce(opened(), "ACCEPT_DREAMSIGN_OFFER", {
      siteId: asSiteId(SITE_ID),
      dreamsignId: asDreamsignId("not-offered"),
    });
    expect(out.outcome).toBe("bounced");
  });

  it("rejects the offer and completes the site", () => {
    const out = reduce(opened(), "REJECT_DREAMSIGN_OFFER", {
      siteId: asSiteId(SITE_ID),
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.visitedSites).toContain(SITE_ID);
    expect(
      (out.state.journey.siteRuntime[SITE_ID] as { accepted: boolean })
        .accepted,
    ).toBe(true);
  });

  it("bounces reject-before-open and a double reject", () => {
    expect(
      reduce(siteState("DreamsignRevelation"), "REJECT_DREAMSIGN_OFFER", {
        siteId: asSiteId(SITE_ID),
      }).outcome,
    ).toBe("bounced");
    const rejected = reduce(opened(), "REJECT_DREAMSIGN_OFFER", {
      siteId: asSiteId(SITE_ID),
    }).state;
    expect(
      reduce(rejected, "REJECT_DREAMSIGN_OFFER", { siteId: asSiteId(SITE_ID) })
        .outcome,
    ).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// Augury: complete / reroll / force
// ---------------------------------------------------------------------------

describe("Augury", () => {
  it("COMPLETE_AUGURY marks completed and completes the site", () => {
    const out = reduce(siteState("Augury"), "COMPLETE_AUGURY", {
      siteId: asSiteId(SITE_ID),
    });
    expect(out.outcome).toBe("applied");
    expect(
      (out.state.journey.siteRuntime[SITE_ID] as { completed: boolean })
        .completed,
    ).toBe(true);
    expect(out.state.journey.visitedSites).toContain(SITE_ID);
  });

  it("REROLL_AUGURY advances the runtime (nonce bumped, hash differs)", () => {
    const opened = reduce(siteState("Augury"), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    }).state;
    const before = JSON.stringify(opened.journey.siteRuntime[SITE_ID]);
    const out = reduce(opened, "REROLL_AUGURY", { siteId: asSiteId(SITE_ID) });
    expect(out.outcome).toBe("applied");
    expect(JSON.stringify(out.state.journey.siteRuntime[SITE_ID])).not.toBe(
      before,
    );
    const first = out.state;
    const second = reduce(first, "REROLL_AUGURY", {
      siteId: asSiteId(SITE_ID),
    });
    expect(JSON.stringify(second.state.journey.siteRuntime[SITE_ID])).not.toBe(
      JSON.stringify(first.journey.siteRuntime[SITE_ID]),
    );
  });

  it("REROLL bounces once the augury is completed", () => {
    const completed = reduce(siteState("Augury"), "COMPLETE_AUGURY", {
      siteId: asSiteId(SITE_ID),
    }).state;
    expect(
      reduce(completed, "REROLL_AUGURY", { siteId: asSiteId(SITE_ID) }).outcome,
    ).toBe("bounced");
  });

  it("FORCE_AUGURY_ARCHETYPE stores the forced archetype", () => {
    const out = reduce(siteState("Augury"), "FORCE_AUGURY_ARCHETYPE", {
      siteId: asSiteId(SITE_ID),
      archetypeId: "fit_card_grant",
    });
    expect(out.outcome).toBe("applied");
    expect(
      (out.state.journey.siteRuntime[SITE_ID] as { forcedArchetypeId?: string })
        .forcedArchetypeId,
    ).toBe("fit_card_grant");
  });
});

// ---------------------------------------------------------------------------
// Card choice: transfiguration / duplication (Task-12 deferrals)
// ---------------------------------------------------------------------------

describe("ACCEPT_TRANSFIGURATION_CHOICE", () => {
  function opened(essence = 1000): FoldState {
    registerSiteContentProvider(fakeProvider);
    const deck = [
      makeEntry({ entryId: asDeckEntryId("deck-1"), cardNumber: 7 }),
    ];
    return reduce(
      siteState("Transfiguration", { deck, essence }),
      "OPEN_SITE",
      { siteId: asSiteId(SITE_ID) },
    ).state;
  }

  it("applies the transfiguration, charges essence, completes the site", () => {
    const state = opened(1000);
    const offer = (
      state.journey.siteRuntime[SITE_ID] as {
        transfigurationOffers: { essenceCost: number; type: string }[];
      }
    ).transfigurationOffers[0];
    const out = reduce(state, "ACCEPT_TRANSFIGURATION_CHOICE", {
      siteId: asSiteId(SITE_ID),
      entryId: asDeckEntryId("deck-1"),
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(1000 - offer.essenceCost);
    const entry = out.state.journey.deck.find((e) => e.entryId === "deck-1");
    expect(entry?.transfiguration).toBe(offer.type);
    expect(out.state.journey.visitedSites).toContain(SITE_ID);
  });

  it("bounces without enough essence", () => {
    const out = reduce(opened(0), "ACCEPT_TRANSFIGURATION_CHOICE", {
      siteId: asSiteId(SITE_ID),
      entryId: asDeckEntryId("deck-1"),
    });
    expect(out.outcome).toBe("bounced");
  });

  it("bounces accept-before-open, unknown entry, and double-accept", () => {
    const deck = [makeEntry({ entryId: asDeckEntryId("deck-1") })];
    expect(
      reduce(
        siteState("Transfiguration", { deck }),
        "ACCEPT_TRANSFIGURATION_CHOICE",
        { siteId: asSiteId(SITE_ID), entryId: asDeckEntryId("deck-1") },
      ).outcome,
    ).toBe("bounced");
    const state = opened();
    expect(
      reduce(state, "ACCEPT_TRANSFIGURATION_CHOICE", {
        siteId: asSiteId(SITE_ID),
        entryId: asDeckEntryId("ghost"),
      }).outcome,
    ).toBe("bounced");
    const accepted = reduce(state, "ACCEPT_TRANSFIGURATION_CHOICE", {
      siteId: asSiteId(SITE_ID),
      entryId: asDeckEntryId("deck-1"),
    }).state;
    expect(
      reduce(accepted, "ACCEPT_TRANSFIGURATION_CHOICE", {
        siteId: asSiteId(SITE_ID),
        entryId: asDeckEntryId("deck-1"),
      }).outcome,
    ).toBe("bounced");
  });

  it("bounces an unrecognized requested type instead of accepting the first offer", () => {
    const state = opened(1000);
    const out = reduce(state, "ACCEPT_TRANSFIGURATION_CHOICE", {
      siteId: asSiteId(SITE_ID),
      entryId: asDeckEntryId("deck-1"),
      type: "bogus",
    });
    expect(out.outcome).toBe("bounced");
    expect(out.state.journey.deck[0].transfiguration).toBeNull();
  });
});

describe("ACCEPT_DUPLICATION_CHOICE", () => {
  function opened(): FoldState {
    registerSiteContentProvider(fakeProvider);
    const deck = [
      makeEntry({ entryId: asDeckEntryId("deck-1"), cardNumber: 7 }),
    ];
    return reduce(siteState("Duplication", { deck }), "OPEN_SITE", {
      siteId: asSiteId(SITE_ID),
    }).state;
  }

  it("appends a copy of the chosen entry and completes the site", () => {
    const out = reduce(opened(), "ACCEPT_DUPLICATION_CHOICE", {
      siteId: asSiteId(SITE_ID),
      entryId: asDeckEntryId("deck-1"),
    });
    expect(out.outcome).toBe("applied");
    expect(
      out.state.journey.deck.filter((e) => e.cardNumber === 7),
    ).toHaveLength(2);
    expect(out.state.journey.visitedSites).toContain(SITE_ID);
  });

  it("bounces accept-before-open and double-accept", () => {
    const deck = [makeEntry({ entryId: asDeckEntryId("deck-1") })];
    expect(
      reduce(siteState("Duplication", { deck }), "ACCEPT_DUPLICATION_CHOICE", {
        siteId: asSiteId(SITE_ID),
        entryId: asDeckEntryId("deck-1"),
      }).outcome,
    ).toBe("bounced");
    const accepted = reduce(opened(), "ACCEPT_DUPLICATION_CHOICE", {
      siteId: asSiteId(SITE_ID),
      entryId: asDeckEntryId("deck-1"),
    }).state;
    expect(
      reduce(accepted, "ACCEPT_DUPLICATION_CHOICE", {
        siteId: asSiteId(SITE_ID),
        entryId: asDeckEntryId("deck-1"),
      }).outcome,
    ).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// COMPLETE_SITE
// ---------------------------------------------------------------------------

describe("COMPLETE_SITE", () => {
  it("marks the site visited and returns to the dreamscape", () => {
    const out = reduce(siteState("Augury"), "COMPLETE_SITE", {
      siteId: asSiteId(SITE_ID),
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.visitedSites).toContain(SITE_ID);
    expect(out.state.journey.screen.type).toBe("dreamscape");
  });

  it("bounces a second completion of an already-visited site", () => {
    const done = reduce(siteState("Augury"), "COMPLETE_SITE", {
      siteId: asSiteId(SITE_ID),
    }).state;
    expect(
      reduce(done, "COMPLETE_SITE", { siteId: asSiteId(SITE_ID) }).outcome,
    ).toBe("bounced");
  });

  it("allows an observer to commit the deterministic completed-draft handoff", () => {
    const completedDraft = siteState("Draft", {
      draftState: {
        mode: "tides4",
        currentOffer: [],
        activeSiteId: asSiteId(SITE_ID),
        pickNumber: 6,
        sitePicksCompleted: 5,
        siteShownCardNumbers: [],
        draftPoolCopiesByCard: {},
        remainingCopiesByCard: {},
      },
    });
    const hosted = {
      ...completedDraft,
      playtestControl: {
        mode: "single-controller" as const,
        controllerClientId: asClientId("controller"),
      },
    };

    const out = reduceGameEvent(
      hosted,
      event("COMPLETE_SITE", { siteId: asSiteId(SITE_ID) }, "observer"),
      ctx(),
    );

    expect(out.outcome).toBe("applied");
    expect(out.state.journey.visitedSites).toContain(SITE_ID);
    expect(out.state.journey.screen.type).toBe("dreamscape");
    expect(out.state.playtestControl?.controllerClientId).toBe("controller");
  });

  it("keeps an observer from completing an active draft offer", () => {
    const activeDraft = siteState("Draft", {
      draftState: {
        mode: "tides4",
        currentOffer: [1, 2, 3, 4],
        activeSiteId: asSiteId(SITE_ID),
        pickNumber: 5,
        sitePicksCompleted: 4,
        siteShownCardNumbers: [1, 2, 3, 4],
        draftPoolCopiesByCard: { "1": 1, "2": 1, "3": 1, "4": 1 },
        remainingCopiesByCard: { "1": 1, "2": 1, "3": 1, "4": 1 },
      },
    });
    const hosted = {
      ...activeDraft,
      playtestControl: {
        mode: "single-controller" as const,
        controllerClientId: asClientId("controller"),
      },
    };

    const out = reduceGameEvent(
      hosted,
      event("COMPLETE_SITE", { siteId: asSiteId(SITE_ID) }, "observer"),
      ctx(),
    );

    expect(out.outcome).toBe("bounced");
    expect(out.bounceReason).toBe("observer_read_only");
  });
});

// ---------------------------------------------------------------------------
// PURGE_DECK_CARDS (completed: essence + negative Dreamsign + site coupling)
// ---------------------------------------------------------------------------

describe("PURGE_DECK_CARDS full behavior", () => {
  beforeEach(() => registerSiteContentProvider(fakeProvider));
  function purgeState(): FoldState {
    return stateWithSites([makeSite("Purge")], {
      essence: 500,
      deck: [
        makeEntry({ entryId: asDeckEntryId("deck-1"), cardNumber: 10 }),
        makeEntry({
          entryId: asDeckEntryId("nightmare"),
          cardNumber: 10002,
          isBane: true,
        }),
      ],
      dreamsigns: [dreamsign("first"), dreamsign("second")],
    });
  }

  it("bounces without a Purge site identity", () => {
    const out = reduce(purgeState(), "PURGE_DECK_CARDS", {
      entryIds: [asDeckEntryId("deck-1")],
    });
    expect(out.outcome).toBe("bounced");
  });

  it("derives the canonical price and completes the site atomically", () => {
    const state = purgeState();
    const out = reduce(state, "PURGE_DECK_CARDS", {
      entryIds: [asDeckEntryId("deck-1")],
      siteId: asSiteId(SITE_ID),
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(500 - 40);
    expect(out.state.journey.deck.map((e) => e.entryId)).toEqual(["nightmare"]);
    expect(out.state.journey.dreamsigns.map((d) => d.id)).toEqual([
      "first",
      "second",
    ]);
    expect(out.state.journey.visitedSites).toContain(SITE_ID);
    expect(out.state.journey.screen.type).toBe("dreamscape");
  });

  it("bounces a site purge whose cost exceeds current essence", () => {
    const state = purgeState();
    const out = reduce(
      { ...state, journey: { ...state.journey, essence: 3 } },
      "PURGE_DECK_CARDS",
      {
        entryIds: [asDeckEntryId("deck-1")],
        siteId: asSiteId(SITE_ID),
      },
    );
    expect(out.outcome).toBe("bounced");
    expect(out.state.journey.essence).toBe(3);
    expect(out.state.journey.visitedSites).not.toContain(SITE_ID);
  });

  it("ignores a forged client price and charges the derived price", () => {
    const state = purgeState();
    const out = reduce(
      { ...state, journey: { ...state.journey, essence: 100 } },
      "PURGE_DECK_CARDS",
      {
        entryIds: [asDeckEntryId("deck-1")],
        siteId: asSiteId(SITE_ID),
        cost: -100,
      },
    );
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(60);
  });

  it("bounces a re-purge of an already-visited site", () => {
    const done = reduce(purgeState(), "PURGE_DECK_CARDS", {
      entryIds: [asDeckEntryId("deck-1")],
      siteId: asSiteId(SITE_ID),
    }).state;
    const out = reduce(done, "PURGE_DECK_CARDS", {
      entryIds: [asDeckEntryId("deck-2")],
      siteId: asSiteId(SITE_ID),
    });
    expect(out.outcome).toBe("bounced");
  });
});
