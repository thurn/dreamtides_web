import { afterEach, describe, expect, it } from "vitest";

import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import { LayerName } from "../../types/layer-name";
import type {
  DeckEntry,
  Dreamsign,
  DreamscapeNode,
  QuestState,
  SiteRuntimeState,
  SiteState,
  SiteType,
} from "../../types/quest";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import {
  registerSiteContentProvider,
  type SiteContentProvider,
} from "./sites";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS: Genesis = {
  seed: "sites-seed",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null, journeyVariant: "v2" },
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
  overrides: Partial<DeckEntry> & { entryId: string },
): DeckEntry {
  return {
    cardNumber: 1,
    transfiguration: null,
    isBane: false,
    ...overrides,
  };
}

function dreamsign(id: string, isBane = false): Dreamsign {
  return { id, name: "n", effectDescription: "e", isBane };
}

const SITE_ID = "site-1";
const NODE_ID = "node-1";

function makeSite(type: SiteType, isEnhanced = false): SiteState {
  return {
    id: SITE_ID,
    type,
    isEnhanced,
    isVisited: false,
    data: {},
  };
}

function makeNode(sites: SiteState[]): DreamscapeNode {
  return {
    id: NODE_ID,
    layer: LayerName.Two,
    indexInLayer: 0,
    dreamscapeId: "d1",
    biomeName: "Biome",
    biomeColor: "#fff",
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
 * A quest state with one dreamscape node holding `sites`, the player standing
 * in that node so `canVisitSite` passes for a non-Battle site.
 */
function stateWithSites(
  sites: SiteState[],
  overrides: Partial<QuestState> = {},
): FoldState {
  const base = genesisFoldState(GENESIS);
  return {
    ...base,
    quest: {
      ...base.quest,
      currentDreamscape: NODE_ID,
      atlas: {
        ...base.quest.atlas,
        nodes: { [NODE_ID]: makeNode(sites) },
        startingNodeId: NODE_ID,
        currentNodeId: NODE_ID,
      },
      screen: { type: "site", siteId: SITE_ID },
      activeSiteId: SITE_ID,
      ...overrides,
    },
  };
}

function siteState(type: SiteType, overrides: Partial<QuestState> = {}): FoldState {
  return stateWithSites([makeSite(type)], overrides);
}

/**
 * A deterministic fake {@link SiteContentProvider} whose runtime embeds an
 * rng-derived value so re-folding the same event yields a byte-identical
 * runtime and a fresh seq yields a different one. Content-free types (essence,
 * dreamAugury) are generated purely in-reducer and never reach this provider.
 */
const fakeProvider: SiteContentProvider = {
  openSite({ site, rng }) {
    const draw = Math.floor(rng(0) * 1_000_000);
    switch (site.type) {
      case "Reward":
        return {
          runtime: {
            kind: "reward",
            reward: { rewardType: "essence", essenceAmount: draw },
            remainingDreamsignPoolIds: [`pool-${String(draw)}`],
            accepted: false,
          },
          remainingDreamsignPool: [`pool-${String(draw)}`],
        };
      case "DreamsignRevelation":
        return {
          runtime: {
            kind: "dreamsignOffer",
            offeredDreamsigns: [dreamsign(`ds-${String(draw)}`)],
            remainingDreamsignPool: [`pool-${String(draw)}`],
            accepted: false,
          },
          remainingDreamsignPool: [`pool-${String(draw)}`],
        };
      case "Shop":
      case "DreamsignMarket":
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
          },
        };
      case "Transfiguration":
        return {
          runtime: {
            kind: "cardChoice",
            choiceKind: "transfiguration",
            entryIds: ["deck-1"],
            acceptedEntryIds: [],
            transfigurationOffers: [
              {
                entryId: "deck-1",
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
            entryIds: ["deck-1"],
            acceptedEntryIds: [],
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
  return result.state.quest.siteRuntime[SITE_ID];
}

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
  ];

  for (const type of providerTypes) {
    it(`${type}: same seed+seq folds to a hash-identical runtime`, () => {
      registerSiteContentProvider(fakeProvider);
      const deck = [makeEntry({ entryId: "deck-1", cardNumber: 7 })];
      const a = reduce(siteState(type, { deck }), "OPEN_SITE", {
        siteId: SITE_ID,
      });
      const b = reduce(siteState(type, { deck }), "OPEN_SITE", {
        siteId: SITE_ID,
      });
      expect(a.outcome).toBe("applied");
      expect(b.outcome).toBe("applied");
      expect(runtimeOf(a)).toBeDefined();
      expect(JSON.stringify(runtimeOf(a))).toBe(JSON.stringify(runtimeOf(b)));
    });
  }

  it("Essence: pure in-reducer generation is deterministic in seed+seq", () => {
    const a = reduce(siteState("Essence"), "OPEN_SITE", { siteId: SITE_ID });
    const b = reduce(siteState("Essence"), "OPEN_SITE", { siteId: SITE_ID });
    expect(a.outcome).toBe("applied");
    const ra = runtimeOf(a);
    expect(ra?.kind).toBe("essence");
    expect(JSON.stringify(ra)).toBe(JSON.stringify(runtimeOf(b)));
  });

  it("Essence: enhanced site draws a larger band than a normal site", () => {
    const normal = reduce(siteState("Essence"), "OPEN_SITE", {
      siteId: SITE_ID,
    });
    const enhanced = reduce(
      stateWithSites([makeSite("Essence", true)]),
      "OPEN_SITE",
      { siteId: SITE_ID },
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
    const out = reduce(state, "OPEN_SITE", { siteId: SITE_ID });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });

  it("bounces a site type with no runtime (Battle)", () => {
    registerSiteContentProvider(fakeProvider);
    const out = reduce(siteState("Battle"), "OPEN_SITE", { siteId: SITE_ID });
    expect(out.outcome).toBe("bounced");
  });

  it("bounces an unknown site id", () => {
    registerSiteContentProvider(fakeProvider);
    const out = reduce(siteState("Reward"), "OPEN_SITE", { siteId: "ghost" });
    expect(out.outcome).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// OPEN_SITE — idempotence
// ---------------------------------------------------------------------------

describe("OPEN_SITE idempotence", () => {
  it("second OPEN_SITE on the same site is a no-change APPLIED (not bounced)", () => {
    const first = reduce(siteState("Essence"), "OPEN_SITE", {
      siteId: SITE_ID,
    });
    expect(first.outcome).toBe("applied");
    const second = reduce(first.state, "OPEN_SITE", { siteId: SITE_ID });
    expect(second.outcome).toBe("applied");
    // Runtime is not regenerated/overwritten: state hash unchanged.
    expect(JSON.stringify(second.state.quest)).toBe(
      JSON.stringify(first.state.quest),
    );
    expect(second.state.quest.siteRuntime[SITE_ID]).toEqual(
      first.state.quest.siteRuntime[SITE_ID],
    );
  });

  it("a fresh seq does not overwrite an existing runtime", () => {
    const first = reduce(siteState("Essence"), "OPEN_SITE", {
      siteId: SITE_ID,
    });
    const second = reduce(
      first.state,
      "OPEN_SITE",
      { siteId: SITE_ID },
      ctx({ seq: 99, rng: makeRng(777) }),
    );
    expect(second.outcome).toBe("applied");
    expect(second.state.quest.siteRuntime[SITE_ID]).toEqual(
      first.state.quest.siteRuntime[SITE_ID],
    );
  });
});

// ---------------------------------------------------------------------------
// ACCEPT_ESSENCE
// ---------------------------------------------------------------------------

describe("ACCEPT_ESSENCE", () => {
  function opened(): FoldState {
    return reduce(siteState("Essence", { essence: 0 }), "OPEN_SITE", {
      siteId: SITE_ID,
    }).state;
  }

  it("adds the runtime amount, marks accepted, and completes the site", () => {
    const state = opened();
    const amount = (state.quest.siteRuntime[SITE_ID] as { amount: number })
      .amount;
    const out = reduce(state, "ACCEPT_ESSENCE", { siteId: SITE_ID });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.essence).toBe(amount);
    expect(
      (out.state.quest.siteRuntime[SITE_ID] as { accepted: boolean }).accepted,
    ).toBe(true);
    expect(out.state.quest.visitedSites).toContain(SITE_ID);
    expect(out.state.quest.screen.type).toBe("dreamscape");
  });

  it("bounces accept-before-open (no runtime)", () => {
    const state = siteState("Essence");
    const out = reduce(state, "ACCEPT_ESSENCE", { siteId: SITE_ID });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });

  it("bounces a double-accept on an already-accepted site", () => {
    const accepted = reduce(opened(), "ACCEPT_ESSENCE", {
      siteId: SITE_ID,
    }).state;
    const out = reduce(accepted, "ACCEPT_ESSENCE", { siteId: SITE_ID });
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
      siteId: SITE_ID,
    }).state;
  }

  it("grants the essence reward and completes the site", () => {
    const state = opened();
    const amount = (
      state.quest.siteRuntime[SITE_ID] as {
        reward: { essenceAmount: number };
      }
    ).reward.essenceAmount;
    const out = reduce(state, "ACCEPT_REWARD", { siteId: SITE_ID });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.essence).toBe(
      Math.min(amount, state.quest.essenceCap),
    );
    expect(out.state.quest.visitedSites).toContain(SITE_ID);
  });

  it("bounces accept-before-open and double-accept", () => {
    const before = reduce(siteState("Reward"), "ACCEPT_REWARD", {
      siteId: SITE_ID,
    });
    expect(before.outcome).toBe("bounced");
    const accepted = reduce(opened(), "ACCEPT_REWARD", {
      siteId: SITE_ID,
    }).state;
    expect(reduce(accepted, "ACCEPT_REWARD", { siteId: SITE_ID }).outcome).toBe(
      "bounced",
    );
  });
});

describe("dreamsign offer accept / reject", () => {
  function opened(overrides: Partial<QuestState> = {}): FoldState {
    registerSiteContentProvider(fakeProvider);
    return reduce(
      siteState("DreamsignRevelation", overrides),
      "OPEN_SITE",
      { siteId: SITE_ID },
    ).state;
  }

  it("accepts an offered dreamsign by id and appends it", () => {
    const state = opened();
    const offered = (
      state.quest.siteRuntime[SITE_ID] as {
        offeredDreamsigns: Dreamsign[];
      }
    ).offeredDreamsigns[0];
    const out = reduce(state, "ACCEPT_DREAMSIGN_OFFER", {
      siteId: SITE_ID,
      dreamsignId: offered.id,
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.dreamsigns.map((d) => d.id)).toContain(offered.id);
    expect(out.state.quest.visitedSites).toContain(SITE_ID);
  });

  it("bounces an unoffered dreamsign id", () => {
    const out = reduce(opened(), "ACCEPT_DREAMSIGN_OFFER", {
      siteId: SITE_ID,
      dreamsignId: "not-offered",
    });
    expect(out.outcome).toBe("bounced");
  });

  it("rejects the offer and completes the site", () => {
    const out = reduce(opened(), "REJECT_DREAMSIGN_OFFER", {
      siteId: SITE_ID,
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.visitedSites).toContain(SITE_ID);
    expect(
      (out.state.quest.siteRuntime[SITE_ID] as { accepted: boolean }).accepted,
    ).toBe(true);
  });

  it("bounces reject-before-open and a double reject", () => {
    expect(
      reduce(siteState("DreamsignRevelation"), "REJECT_DREAMSIGN_OFFER", {
        siteId: SITE_ID,
      }).outcome,
    ).toBe("bounced");
    const rejected = reduce(opened(), "REJECT_DREAMSIGN_OFFER", {
      siteId: SITE_ID,
    }).state;
    expect(
      reduce(rejected, "REJECT_DREAMSIGN_OFFER", { siteId: SITE_ID }).outcome,
    ).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// Dream Augury: complete / reroll / force
// ---------------------------------------------------------------------------

describe("Dream Augury", () => {
  it("COMPLETE_DREAM_AUGURY marks completed and completes the site", () => {
    const out = reduce(siteState("DreamAugury"), "COMPLETE_DREAM_AUGURY", {
      siteId: SITE_ID,
    });
    expect(out.outcome).toBe("applied");
    expect(
      (out.state.quest.siteRuntime[SITE_ID] as { completed: boolean })
        .completed,
    ).toBe(true);
    expect(out.state.quest.visitedSites).toContain(SITE_ID);
  });

  it("REROLL_DREAM_AUGURY advances the runtime (nonce bumped, hash differs)", () => {
    const opened = reduce(siteState("DreamAugury"), "OPEN_SITE", {
      siteId: SITE_ID,
    }).state;
    const before = JSON.stringify(opened.quest.siteRuntime[SITE_ID]);
    const out = reduce(opened, "REROLL_DREAM_AUGURY", { siteId: SITE_ID });
    expect(out.outcome).toBe("applied");
    expect(JSON.stringify(out.state.quest.siteRuntime[SITE_ID])).not.toBe(
      before,
    );
    const first = out.state;
    const second = reduce(first, "REROLL_DREAM_AUGURY", { siteId: SITE_ID });
    expect(JSON.stringify(second.state.quest.siteRuntime[SITE_ID])).not.toBe(
      JSON.stringify(first.quest.siteRuntime[SITE_ID]),
    );
  });

  it("REROLL bounces once the augury is completed", () => {
    const completed = reduce(
      siteState("DreamAugury"),
      "COMPLETE_DREAM_AUGURY",
      { siteId: SITE_ID },
    ).state;
    expect(
      reduce(completed, "REROLL_DREAM_AUGURY", { siteId: SITE_ID }).outcome,
    ).toBe("bounced");
  });

  it("FORCE_DREAM_AUGURY_ARCHETYPE stores the forced archetype", () => {
    const out = reduce(siteState("DreamAugury"), "FORCE_DREAM_AUGURY_ARCHETYPE", {
      siteId: SITE_ID,
      archetypeId: "arch-x",
    });
    expect(out.outcome).toBe("applied");
    expect(
      (out.state.quest.siteRuntime[SITE_ID] as { forcedArchetypeId?: string })
        .forcedArchetypeId,
    ).toBe("arch-x");
  });
});

// ---------------------------------------------------------------------------
// Card choice: transfiguration / duplication (Task-12 deferrals)
// ---------------------------------------------------------------------------

describe("ACCEPT_TRANSFIGURATION_CHOICE", () => {
  function opened(essence = 1000): FoldState {
    registerSiteContentProvider(fakeProvider);
    const deck = [makeEntry({ entryId: "deck-1", cardNumber: 7 })];
    return reduce(
      siteState("Transfiguration", { deck, essence, essenceCap: 2000 }),
      "OPEN_SITE",
      { siteId: SITE_ID },
    ).state;
  }

  it("applies the transfiguration, charges essence, completes the site", () => {
    const state = opened(1000);
    const offer = (
      state.quest.siteRuntime[SITE_ID] as {
        transfigurationOffers: { essenceCost: number; type: string }[];
      }
    ).transfigurationOffers[0];
    const out = reduce(state, "ACCEPT_TRANSFIGURATION_CHOICE", {
      siteId: SITE_ID,
      entryId: "deck-1",
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.essence).toBe(1000 - offer.essenceCost);
    const entry = out.state.quest.deck.find((e) => e.entryId === "deck-1");
    expect(entry?.transfiguration).toBe(offer.type);
    expect(out.state.quest.visitedSites).toContain(SITE_ID);
  });

  it("bounces without enough essence", () => {
    const out = reduce(opened(0), "ACCEPT_TRANSFIGURATION_CHOICE", {
      siteId: SITE_ID,
      entryId: "deck-1",
    });
    expect(out.outcome).toBe("bounced");
  });

  it("bounces accept-before-open, unknown entry, and double-accept", () => {
    const deck = [makeEntry({ entryId: "deck-1" })];
    expect(
      reduce(
        siteState("Transfiguration", { deck }),
        "ACCEPT_TRANSFIGURATION_CHOICE",
        { siteId: SITE_ID, entryId: "deck-1" },
      ).outcome,
    ).toBe("bounced");
    const state = opened();
    expect(
      reduce(state, "ACCEPT_TRANSFIGURATION_CHOICE", {
        siteId: SITE_ID,
        entryId: "ghost",
      }).outcome,
    ).toBe("bounced");
    const accepted = reduce(state, "ACCEPT_TRANSFIGURATION_CHOICE", {
      siteId: SITE_ID,
      entryId: "deck-1",
    }).state;
    expect(
      reduce(accepted, "ACCEPT_TRANSFIGURATION_CHOICE", {
        siteId: SITE_ID,
        entryId: "deck-1",
      }).outcome,
    ).toBe("bounced");
  });
});

describe("ACCEPT_DUPLICATION_CHOICE", () => {
  function opened(): FoldState {
    registerSiteContentProvider(fakeProvider);
    const deck = [makeEntry({ entryId: "deck-1", cardNumber: 7 })];
    return reduce(siteState("Duplication", { deck }), "OPEN_SITE", {
      siteId: SITE_ID,
    }).state;
  }

  it("appends a copy of the chosen entry and completes the site", () => {
    const out = reduce(opened(), "ACCEPT_DUPLICATION_CHOICE", {
      siteId: SITE_ID,
      entryId: "deck-1",
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.deck.filter((e) => e.cardNumber === 7)).toHaveLength(
      2,
    );
    expect(out.state.quest.visitedSites).toContain(SITE_ID);
  });

  it("bounces accept-before-open and double-accept", () => {
    const deck = [makeEntry({ entryId: "deck-1" })];
    expect(
      reduce(siteState("Duplication", { deck }), "ACCEPT_DUPLICATION_CHOICE", {
        siteId: SITE_ID,
        entryId: "deck-1",
      }).outcome,
    ).toBe("bounced");
    const accepted = reduce(opened(), "ACCEPT_DUPLICATION_CHOICE", {
      siteId: SITE_ID,
      entryId: "deck-1",
    }).state;
    expect(
      reduce(accepted, "ACCEPT_DUPLICATION_CHOICE", {
        siteId: SITE_ID,
        entryId: "deck-1",
      }).outcome,
    ).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// COMPLETE_SITE
// ---------------------------------------------------------------------------

describe("COMPLETE_SITE", () => {
  it("marks the site visited and returns to the dreamscape", () => {
    const out = reduce(siteState("DreamAugury"), "COMPLETE_SITE", {
      siteId: SITE_ID,
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.visitedSites).toContain(SITE_ID);
    expect(out.state.quest.screen.type).toBe("dreamscape");
  });

  it("bounces a second completion of an already-visited site", () => {
    const done = reduce(siteState("DreamAugury"), "COMPLETE_SITE", {
      siteId: SITE_ID,
    }).state;
    expect(reduce(done, "COMPLETE_SITE", { siteId: SITE_ID }).outcome).toBe(
      "bounced",
    );
  });
});

// ---------------------------------------------------------------------------
// PURGE_DECK_CARDS (completed: essence + bane dreamsign + site coupling)
// ---------------------------------------------------------------------------

describe("PURGE_DECK_CARDS full behavior", () => {
  function purgeState(): FoldState {
    return stateWithSites([makeSite("Purge")], {
      essence: 500,
      deck: [
        makeEntry({ entryId: "deck-1", cardNumber: 10 }),
        makeEntry({ entryId: "deck-2", cardNumber: 20, isBane: true }),
      ],
      dreamsigns: [dreamsign("keep", false), dreamsign("bane", true)],
    });
  }

  it("deck-only path (no siteId) still removes the listed entries", () => {
    const out = reduce(purgeState(), "PURGE_DECK_CARDS", {
      entryIds: ["deck-1"],
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.deck.map((e) => e.entryId)).toEqual(["deck-2"]);
    // No site coupling on the deck-only path.
    expect(out.state.quest.visitedSites).not.toContain(SITE_ID);
  });

  it("site path charges essence, removes free bane dreamsigns, completes site", () => {
    const state = purgeState();
    const out = reduce(state, "PURGE_DECK_CARDS", {
      entryIds: ["deck-1"],
      siteId: SITE_ID,
      cost: 120,
      baneDreamsignIndices: [1],
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.essence).toBe(500 - 120);
    expect(out.state.quest.deck.map((e) => e.entryId)).toEqual(["deck-2"]);
    // The bane dreamsign at index 1 is removed for free; the keeper remains.
    expect(out.state.quest.dreamsigns.map((d) => d.id)).toEqual(["keep"]);
    expect(out.state.quest.visitedSites).toContain(SITE_ID);
    expect(out.state.quest.screen.type).toBe("dreamscape");
  });

  it("does not remove a non-bane dreamsign even if its index is listed", () => {
    const state = purgeState();
    const out = reduce(state, "PURGE_DECK_CARDS", {
      entryIds: ["deck-1"],
      siteId: SITE_ID,
      cost: 0,
      baneDreamsignIndices: [0],
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.dreamsigns.map((d) => d.id)).toEqual([
      "keep",
      "bane",
    ]);
  });

  it("bounces a re-purge of an already-visited site", () => {
    const done = reduce(purgeState(), "PURGE_DECK_CARDS", {
      entryIds: ["deck-1"],
      siteId: SITE_ID,
      cost: 0,
    }).state;
    const out = reduce(done, "PURGE_DECK_CARDS", {
      entryIds: ["deck-2"],
      siteId: SITE_ID,
      cost: 0,
    });
    expect(out.outcome).toBe("bounced");
  });
});
