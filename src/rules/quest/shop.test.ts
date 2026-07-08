import { afterEach, describe, expect, it } from "vitest";

import type { EventContext, GameEvent } from "../../eventlog/types";
import { LayerName } from "../../types/layer-name";
import type {
  BattleModifier,
  DreamscapeNode,
  QuestState,
  RuntimeShopSlot,
  ShopSiteRuntime,
  SiteState,
  SiteType,
} from "../../types/quest";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import {
  registerSiteContentProvider,
  type ShopRerollResult,
  type SiteContentProvider,
} from "./sites";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS = { seed: "shop-seed", reducerVersion: "test", createdAt: 0 };
const SITE_ID = "site-1";
const NODE_ID = "node-1";

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

function makeSite(type: SiteType, overrides: Partial<SiteState> = {}): SiteState {
  return {
    id: SITE_ID,
    type,
    isEnhanced: false,
    isVisited: false,
    data: {},
    ...overrides,
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

function cardSlot(overrides: Partial<Extract<RuntimeShopSlot, { itemType: "card" }>> = {}): RuntimeShopSlot {
  return {
    itemType: "card",
    cardNumber: 7,
    basePrice: 100,
    discountPercent: 0,
    purchased: false,
    ...overrides,
  };
}

function shopRuntime(slots: RuntimeShopSlot[]): ShopSiteRuntime {
  return {
    kind: "shop",
    slots,
    rerollCount: 0,
    remainingDreamsignPoolIds: [],
  };
}

/** Quest state standing in a dreamscape node holding `sites`. */
function stateWith(
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

/** A shop state with `slots`, plus any quest overrides (essence, modifiers). */
function shopState(
  slots: RuntimeShopSlot[],
  overrides: Partial<QuestState> = {},
): FoldState {
  return stateWith([makeSite("Shop")], {
    siteRuntime: { [SITE_ID]: shopRuntime(slots) },
    ...overrides,
  });
}

/** A provider that regenerates a shop with a single deterministic card slot. */
const rerollProvider: SiteContentProvider = {
  openSite() {
    return null;
  },
  rerollShop({ rng }): ShopRerollResult {
    const draw = Math.floor(rng(0) * 1_000_000);
    return {
      slots: [cardSlot({ cardNumber: draw })],
      remainingDreamsignPoolIds: [`pool-${String(draw)}`],
      remainingDreamsignPool: [`pool-${String(draw)}`],
      draftState: null,
    };
  },
};

afterEach(() => {
  registerSiteContentProvider(null);
});

// ---------------------------------------------------------------------------
// BUY_SHOP_SLOT
// ---------------------------------------------------------------------------

describe("BUY_SHOP_SLOT", () => {
  it("bounces when the price exceeds current essence, leaving essence unchanged", () => {
    const state = shopState([cardSlot({ basePrice: 100 })], { essence: 50 });
    const result = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
    });
    expect(result.outcome).toBe("bounced");
    expect(result.state.quest.essence).toBe(50);
    expect(result.state.quest.deck).toHaveLength(0);
  });

  it("buys a card slot: charges the price, adds the card, marks the slot purchased", () => {
    const state = shopState([cardSlot({ basePrice: 100, cardNumber: 9 })], {
      essence: 300,
    });
    const result = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.essence).toBe(200);
    expect(result.state.quest.deck).toHaveLength(1);
    expect(result.state.quest.deck[0].cardNumber).toBe(9);
    const runtime = result.state.quest.siteRuntime[SITE_ID] as ShopSiteRuntime;
    expect(runtime.slots[0].purchased).toBe(true);
  });

  it("bounces a second buy on the same slot (the coop double-buy race)", () => {
    const state = shopState([cardSlot({ basePrice: 100 })], { essence: 300 });
    const first = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
    });
    expect(first.outcome).toBe("applied");
    expect(first.state.quest.essence).toBe(200);
    const second = reduce(first.state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
    });
    expect(second.outcome).toBe("bounced");
    // Essence unchanged by the bounced second buy; deck did not double.
    expect(second.state.quest.essence).toBe(200);
    expect(second.state.quest.deck).toHaveLength(1);
  });

  it("charges the discounted price when a slot and shop discount both apply", () => {
    const basePrice = 200;
    const slotDiscount = 10;
    const shopDiscount = 15;
    // ShopModifiers contract: additive discount, clamped to 100, applied as a
    // round(basePrice * (1 - pct/100)) essence charge.
    const expectedPrice = Math.round(
      basePrice * (1 - (slotDiscount + shopDiscount) / 100),
    );
    const state = shopState(
      [cardSlot({ basePrice, discountPercent: slotDiscount })],
      {
        essence: 300,
        shopModifiers: { freeRerolls: 0, essenceDiscountPercent: shopDiscount },
      },
    );
    const result = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.essence).toBe(300 - expectedPrice);
  });

  it("bounces on an out-of-range slot index", () => {
    const state = shopState([cardSlot()], { essence: 300 });
    const result = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 5,
    });
    expect(result.outcome).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// REROLL_SHOP
// ---------------------------------------------------------------------------

describe("REROLL_SHOP", () => {
  it("bounces when no content provider is registered", () => {
    const state = shopState([cardSlot()], { essence: 300 });
    const result = reduce(state, "REROLL_SHOP", { siteId: SITE_ID });
    expect(result.outcome).toBe("bounced");
  });

  it("consumes a free reroll before charging essence (order)", () => {
    registerSiteContentProvider(rerollProvider);
    const state = shopState([cardSlot()], {
      essence: 300,
      shopModifiers: { freeRerolls: 1, essenceDiscountPercent: 0 },
    });
    const result = reduce(state, "REROLL_SHOP", { siteId: SITE_ID });
    expect(result.outcome).toBe("applied");
    // Free reroll consumed first; essence untouched.
    expect(result.state.quest.shopModifiers.freeRerolls).toBe(0);
    expect(result.state.quest.essence).toBe(300);
    const runtime = result.state.quest.siteRuntime[SITE_ID] as ShopSiteRuntime;
    expect(runtime.rerollCount).toBe(1);
  });

  it("charges essence when no free reroll is available", () => {
    registerSiteContentProvider(rerollProvider);
    const cost = 50;
    const state = shopState([cardSlot()], {
      essence: 300,
      shopModifiers: { freeRerolls: 0, essenceDiscountPercent: 0 },
    });
    const result = reduce(state, "REROLL_SHOP", {
      siteId: SITE_ID,
      essenceCost: cost,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.shopModifiers.freeRerolls).toBe(0);
    expect(result.state.quest.essence).toBe(300 - cost);
  });

  it("bounces a paid reroll the player cannot afford, leaving essence unchanged", () => {
    registerSiteContentProvider(rerollProvider);
    const state = shopState([cardSlot()], {
      essence: 20,
      shopModifiers: { freeRerolls: 0, essenceDiscountPercent: 0 },
    });
    const result = reduce(state, "REROLL_SHOP", {
      siteId: SITE_ID,
      essenceCost: 50,
    });
    expect(result.outcome).toBe("bounced");
    expect(result.state.quest.essence).toBe(20);
  });

  it("bounces a reroll of an already-rerolled shop", () => {
    registerSiteContentProvider(rerollProvider);
    const runtime = { ...shopRuntime([cardSlot()]), rerollCount: 1 };
    const state = shopState([cardSlot()], {
      essence: 300,
      shopModifiers: { freeRerolls: 1, essenceDiscountPercent: 0 },
      siteRuntime: { [SITE_ID]: runtime },
    });
    const result = reduce(state, "REROLL_SHOP", { siteId: SITE_ID });
    expect(result.outcome).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// GRANT_FREE_REROLLS / APPLY_SHOP_DISCOUNT
// ---------------------------------------------------------------------------

describe("shop modifier grants", () => {
  it("GRANT_FREE_REROLLS adds to the free-reroll pool", () => {
    const state = shopState([cardSlot()], {
      shopModifiers: { freeRerolls: 1, essenceDiscountPercent: 0 },
    });
    const result = reduce(state, "GRANT_FREE_REROLLS", { count: 2 });
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.shopModifiers.freeRerolls).toBe(3);
  });

  it("GRANT_FREE_REROLLS bounces a non-positive count", () => {
    const state = shopState([cardSlot()]);
    expect(reduce(state, "GRANT_FREE_REROLLS", { count: 0 }).outcome).toBe(
      "bounced",
    );
  });

  it("APPLY_SHOP_DISCOUNT adds to the essence discount", () => {
    const state = shopState([cardSlot()], {
      shopModifiers: { freeRerolls: 0, essenceDiscountPercent: 10 },
    });
    const result = reduce(state, "APPLY_SHOP_DISCOUNT", { percent: 15 });
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.shopModifiers.essenceDiscountPercent).toBe(25);
  });

  it("APPLY_SHOP_DISCOUNT bounces a non-positive percent", () => {
    const state = shopState([cardSlot()]);
    expect(reduce(state, "APPLY_SHOP_DISCOUNT", { percent: 0 }).outcome).toBe(
      "bounced",
    );
  });
});

// ---------------------------------------------------------------------------
// Battle modifiers
// ---------------------------------------------------------------------------

describe("battle modifiers", () => {
  it("PUSH_BATTLE_MODIFIER appends a reward-reduction modifier", () => {
    const modifier: BattleModifier = {
      kind: "reward_reduction_percent",
      percent: 25,
      battlesRemaining: 2,
      source: "augury",
    };
    const state = shopState([cardSlot()]);
    const result = reduce(state, "PUSH_BATTLE_MODIFIER", { modifier });
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.battleModifiers).toEqual([modifier]);
  });

  it("PUSH_BATTLE_MODIFIER bounces a malformed modifier", () => {
    const state = shopState([cardSlot()]);
    expect(
      reduce(state, "PUSH_BATTLE_MODIFIER", { modifier: { kind: "nope" } })
        .outcome,
    ).toBe("bounced");
  });

  it("PUSH_TEMPORARY_BANE_GRANT adds bane deck entries and a modifier", () => {
    const state = shopState([cardSlot()]);
    const result = reduce(state, "PUSH_TEMPORARY_BANE_GRANT", {
      cardNumber: 3,
      baneName: "Doubt",
      count: 2,
      battlesRemaining: 1,
      source: "augury",
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.deck).toHaveLength(2);
    expect(result.state.quest.deck.every((e) => e.isBane)).toBe(true);
    expect(result.state.quest.deck.every((e) => e.cardNumber === 3)).toBe(true);
    const modifiers = result.state.quest.battleModifiers;
    expect(modifiers).toHaveLength(1);
    const mod = modifiers[0];
    expect(mod.kind).toBe("temporary_bane_grant");
    if (mod.kind === "temporary_bane_grant") {
      expect(mod.count).toBe(2);
      expect(mod.addedEntryIds).toHaveLength(2);
      expect(mod.addedEntryIds).toEqual(
        result.state.quest.deck.map((e) => e.entryId),
      );
    }
  });

  it("PUSH_TEMPORARY_BANE_GRANT bounces a non-positive count", () => {
    const state = shopState([cardSlot()]);
    expect(
      reduce(state, "PUSH_TEMPORARY_BANE_GRANT", {
        cardNumber: 3,
        baneName: "Doubt",
        count: 0,
        battlesRemaining: 1,
        source: "x",
      }).outcome,
    ).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// Dreamscape modifiers
// ---------------------------------------------------------------------------

describe("dreamscape modifiers", () => {
  it("BAN_SITE_TYPE appends a remove_shop_sites modifier that decrements over dreamscapes", () => {
    const state = shopState([cardSlot()]);
    const result = reduce(state, "BAN_SITE_TYPE", {
      siteType: "Shop",
      dreamscapesRemaining: 3,
    });
    expect(result.outcome).toBe("applied");
    const mods = result.state.quest.dreamscapeModifiers;
    expect(mods).toHaveLength(1);
    const mod = mods[0];
    expect(mod.kind).toBe("remove_shop_sites");
    expect(mod.dreamscapesRemaining).toBe(3);
  });

  it("BAN_SITE_TYPE bounces a non-Shop site type", () => {
    const state = shopState([cardSlot()]);
    expect(
      reduce(state, "BAN_SITE_TYPE", {
        siteType: "Essence",
        dreamscapesRemaining: 3,
      }).outcome,
    ).toBe("bounced");
  });

  it("BOOST_SITE_APPEARANCE appends a boost modifier with its dreamscape count", () => {
    const state = shopState([cardSlot()]);
    const result = reduce(state, "BOOST_SITE_APPEARANCE", {
      siteType: "Essence",
      percent: 50,
      dreamscapesRemaining: 2,
    });
    expect(result.outcome).toBe("applied");
    const mod = result.state.quest.dreamscapeModifiers[0];
    expect(mod.kind).toBe("boost_site_appearance");
    if (mod.kind === "boost_site_appearance") {
      expect(mod.siteType).toBe("Essence");
      expect(mod.percent).toBe(50);
      expect(mod.dreamscapesRemaining).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Atlas edits
// ---------------------------------------------------------------------------

describe("atlas edits", () => {
  it("REPLACE_SITE_TYPE swaps a matching unvisited site for a new one", () => {
    const state = shopState([cardSlot()], {}); // node has one Shop site
    const result = reduce(state, "REPLACE_SITE_TYPE", {
      nodeId: NODE_ID,
      fromSiteType: "Shop",
      toSiteType: "Essence",
    });
    expect(result.outcome).toBe("applied");
    const node = result.state.quest.atlas.nodes[NODE_ID];
    expect(node.sites).toHaveLength(1);
    expect(node.sites[0].type).toBe("Essence");
    expect(node.sites[0].id).not.toBe(SITE_ID);
  });

  it("REPLACE_SITE_TYPE bounces when no unvisited site of the source type exists", () => {
    const state = shopState([cardSlot()]);
    expect(
      reduce(state, "REPLACE_SITE_TYPE", {
        nodeId: NODE_ID,
        fromSiteType: "Essence",
        toSiteType: "Shop",
      }).outcome,
    ).toBe("bounced");
  });

  it("ADD_SITE_TO_DREAMSCAPE appends a new site to the node", () => {
    const state = shopState([cardSlot()]);
    const result = reduce(state, "ADD_SITE_TO_DREAMSCAPE", {
      nodeId: NODE_ID,
      siteType: "Essence",
    });
    expect(result.outcome).toBe("applied");
    const node = result.state.quest.atlas.nodes[NODE_ID];
    expect(node.sites).toHaveLength(2);
    expect(node.sites[1].type).toBe("Essence");
    expect(node.sites[1].isVisited).toBe(false);
  });

  it("ADD_SITE_TO_DREAMSCAPE bounces an unknown node", () => {
    const state = shopState([cardSlot()]);
    expect(
      reduce(state, "ADD_SITE_TO_DREAMSCAPE", {
        nodeId: "nope",
        siteType: "Essence",
      }).outcome,
    ).toBe("bounced");
  });

  it("UPDATE_ATLAS replaces the atlas wholesale", () => {
    const state = shopState([cardSlot()]);
    const newAtlas = {
      ...state.quest.atlas,
      startingNodeId: "brand-new-node",
    };
    const result = reduce(state, "UPDATE_ATLAS", { atlas: newAtlas });
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.atlas.startingNodeId).toBe("brand-new-node");
  });

  it("UPDATE_ATLAS bounces a non-object atlas", () => {
    const state = shopState([cardSlot()]);
    expect(reduce(state, "UPDATE_ATLAS", { atlas: 42 }).outcome).toBe(
      "bounced",
    );
  });
});

// ---------------------------------------------------------------------------
// Card source debug
// ---------------------------------------------------------------------------

describe("SET_CARD_SOURCE_DEBUG", () => {
  it("sets and clears the card-source debug state", () => {
    const debugState = {
      screenLabel: "Shop",
      surface: "Shop",
      entries: [],
    };
    const state = shopState([cardSlot()]);
    const set = reduce(state, "SET_CARD_SOURCE_DEBUG", { state: debugState });
    expect(set.outcome).toBe("applied");
    expect(set.state.quest.cardSourceDebug).toEqual(debugState);
    const cleared = reduce(set.state, "SET_CARD_SOURCE_DEBUG", { state: null });
    expect(cleared.outcome).toBe("applied");
    expect(cleared.state.quest.cardSourceDebug).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Merchant offers (provider-seam delegated)
// ---------------------------------------------------------------------------

describe("merchant offers", () => {
  it("ACCEPT_MERCHANT_OFFER delegates to the provider and applies its state", () => {
    const provider: SiteContentProvider = {
      openSite() {
        return null;
      },
      resolveMerchant({ quest, action }) {
        return action === "accept" ? { ...quest, essence: 999 } : null;
      },
    };
    registerSiteContentProvider(provider);
    const state = stateWith([makeSite("DreamAugury")]);
    const result = reduce(state, "ACCEPT_MERCHANT_OFFER", { siteId: SITE_ID });
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.essence).toBe(999);
  });

  it("ACCEPT_MERCHANT_OFFER bounces when the provider returns null", () => {
    const provider: SiteContentProvider = {
      openSite() {
        return null;
      },
      resolveMerchant() {
        return null;
      },
    };
    registerSiteContentProvider(provider);
    const state = stateWith([makeSite("DreamAugury")]);
    expect(
      reduce(state, "ACCEPT_MERCHANT_OFFER", { siteId: SITE_ID }).outcome,
    ).toBe("bounced");
  });

  it("ACCEPT_MERCHANT_OFFER bounces with no provider or unknown site", () => {
    const state = stateWith([makeSite("DreamAugury")]);
    expect(
      reduce(state, "ACCEPT_MERCHANT_OFFER", { siteId: SITE_ID }).outcome,
    ).toBe("bounced");
    const provider: SiteContentProvider = {
      openSite() {
        return null;
      },
      resolveMerchant({ quest }) {
        return { ...quest };
      },
    };
    registerSiteContentProvider(provider);
    expect(
      reduce(state, "ACCEPT_MERCHANT_OFFER", { siteId: "missing" }).outcome,
    ).toBe("bounced");
  });

  it("DECLINE_MERCHANT delegates to the provider", () => {
    const provider: SiteContentProvider = {
      openSite() {
        return null;
      },
      resolveMerchant({ quest, action }) {
        return action === "decline"
          ? { ...quest, visitedSites: [...quest.visitedSites, SITE_ID] }
          : null;
      },
    };
    registerSiteContentProvider(provider);
    const state = stateWith([makeSite("DreamAugury")]);
    const result = reduce(state, "DECLINE_MERCHANT", { siteId: SITE_ID });
    expect(result.outcome).toBe("applied");
    expect(result.state.quest.visitedSites).toContain(SITE_ID);
  });
});
