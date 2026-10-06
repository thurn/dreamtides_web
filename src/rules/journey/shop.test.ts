import { testJourneySeed } from "../../types/test-identities";
import { testEventActor } from "../../types/test-identities";
import { afterEach, describe, expect, it } from "vitest";
import { MINIMAL_SITES_DATA } from "../../testing/atlas-fixtures";

import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import type { EventContext, GameEvent } from "../../eventlog/types";
import { LayerName } from "../../types/layer-name";
import type {
  BattleModifier,
  DreamscapeNode,
  JourneyState,
  RuntimeShopSlot,
  ShopModifiers,
  ShopSiteRuntime,
  SiteState,
  SiteType,
} from "../../types/journey";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import {
  completeJourneySite,
  isSiteVisited,
  registerSiteContentProvider,
  type ShopRerollResult,
} from "./sites";
import { testSiteContentProvider } from "./test-content-providers";
import { registerDeckContentProvider } from "./deck";
import { parseSiteId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { testDreamscapeId, testDreamsignId, testExplorationActionId, testGuideId } from "../../types/test-identities";
import type { Genesis } from "../../eventlog/types";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS = {
  seed: testJourneySeed("shop-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
} satisfies Genesis;
const SITE_ID = parseSiteId("site-1");
const NODE_ID = parseAtlasNodeId("node-1");

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
    contentConfig: TEST_CONTENT_CONFIG,
    seq: 42,
    rng: makeRng(1),
    intervening: [],
    timestamp: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function event(
  type: GameEvent["type"],
  payload: Record<string, unknown>,
  actor = "alice",
): GameEvent {
  return {
    type,
    payload,
    actor: testEventActor(actor),
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
}

function reduce(
  state: FoldState,
  type: GameEvent["type"],
  payload: Record<string, unknown>,
  context: EventContext = ctx(),
): ReduceResult {
  return reduceGameEvent(state, event(type, payload), context);
}

function makeSite(
  type: SiteType,
  overrides: Partial<SiteState> = {},
): SiteState {
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
    dreamscapeId: testDreamscapeId("d1"),
    sites,
    position: { x: 0, y: 0 },
    state: "available",
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
  };
}

function cardSlot(
  overrides: Partial<Extract<RuntimeShopSlot, { itemType: "card" }>> = {},
): RuntimeShopSlot {
  return {
    itemType: "card",
    cardNumber: 7,
    basePrice: 100,
    discountPercent: 0,
    purchased: false,
    ...overrides,
  };
}

function dreamsignSlot(
  idSeed: string,
  overrides: Partial<Extract<RuntimeShopSlot, { itemType: "dreamsign" }>> = {},
): RuntimeShopSlot {
  return {
    itemType: "dreamsign",
    dreamsign: {
      id: testDreamsignId(idSeed),
      name: `Dreamsign ${idSeed}`,
      effectDescription: `Effect ${idSeed}`,
    },
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
    purchaseHistory: [],
  };
}

function shopModifiers(overrides: Partial<ShopModifiers> = {}): ShopModifiers {
  return {
    freeRerolls: 0,
    essenceDiscountPercent: 0,
    freeNextShopModifiers: [],
    freePurchaseModifiers: [],
    ...overrides,
  };
}

/** Journey state standing in a dreamscape node holding `sites`. */
function stateWith(
  sites: SiteState[],
  overrides: Partial<JourneyState> = {},
): FoldState {
  const base = genesisFoldState(GENESIS);
  return {
    ...base,
    journey: {
      ...base.journey,
      currentDreamscape: NODE_ID,
      atlas: {
        ...base.journey.atlas,
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

/** A shop state with `slots`, plus any journey overrides (essence, modifiers). */
function shopState(
  slots: RuntimeShopSlot[],
  overrides: Partial<JourneyState> = {},
  siteType: "Shop" | "DreamsignBazaar" = "Shop",
): FoldState {
  return stateWith([makeSite(siteType)], {
    siteRuntime: { [SITE_ID]: shopRuntime(slots) },
    ...overrides,
  });
}

/** A provider that regenerates a shop with a single deterministic card slot. */
const rerollProvider = testSiteContentProvider({
  rerollShop({ rng }): ShopRerollResult {
    const draw = Math.floor(rng(0) * 1_000_000);
    return {
      slots: [cardSlot({ cardNumber: draw })],
      remainingDreamsignPoolIds: [testDreamsignId(`pool-${String(draw)}`)],
      remainingDreamsignPool: [testDreamsignId(`pool-${String(draw)}`)],
      draftState: null,
    };
  },
});

afterEach(() => {
  registerSiteContentProvider(null);
  registerDeckContentProvider(null);
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
    expect(result.state.journey.essence).toBe(50);
    expect(result.state.journey.deck).toHaveLength(0);
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
    expect(result.state.journey.essence).toBe(200);
    expect(result.state.journey.deck).toHaveLength(1);
    expect(result.state.journey.deck[0].cardNumber).toBe(9);
    const runtime = result.state.journey.siteRuntime[
      SITE_ID
    ] as ShopSiteRuntime;
    expect(runtime.slots[0].purchased).toBe(true);
  });

  it("preserves a persisted Shop-slot transfiguration on the purchased entry", () => {
    const state = shopState(
      [cardSlot({ cardNumber: 9, transfiguration: "Empowered" })],
      { essence: 300 },
    );
    const result = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.deck).toMatchObject([
      { cardNumber: 9, transfiguration: "Empowered" },
    ]);
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
        shopModifiers: shopModifiers({
          essenceDiscountPercent: shopDiscount,
        }),
      },
    );
    const result = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.essence).toBe(300 - expectedPrice);
  });

  it("keeps a bound Card Shop free across paid rerolls and persists every receipt", () => {
    registerSiteContentProvider(rerollProvider);
    const freePurchaseSource = {
      sourceSiteId: parseSiteId("exploration-free-shop"),
      sourceActionId: testExplorationActionId("action-free-shop"),
    };
    const state = shopState([cardSlot({ cardNumber: 9 })], {
      essence: 300,
      siteRuntime: {
        [SITE_ID]: {
          ...shopRuntime([cardSlot({ cardNumber: 9 })]),
          freePurchaseSource,
        },
      },
    });

    const first = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
    });
    const rerolled = reduce(
      first.state,
      "REROLL_SHOP",
      { siteId: SITE_ID },
      ctx({ seq: 43 }),
    );
    const second = reduce(
      rerolled.state,
      "BUY_SHOP_SLOT",
      {
        siteId: SITE_ID,
        slotIndex: 0,
      },
      ctx({ seq: 44 }),
    );

    expect(first.outcome).toBe("applied");
    expect(first.state.journey.essence).toBe(300);
    expect(rerolled.outcome).toBe("applied");
    expect(rerolled.state.journey.essence).toBe(250);
    expect(second.outcome).toBe("applied");
    expect(second.state.journey.essence).toBe(250);
    const runtime = second.state.journey.siteRuntime[SITE_ID];
    expect(runtime).toMatchObject({
      kind: "shop",
      freePurchaseSource,
      purchaseHistory: [
        {
          eventSeq: 42,
          siteId: SITE_ID,
          slotIndex: 0,
          item: { kind: "card", cardNumber: 9 },
          priceBeforeFree: 100,
          pricePaid: 0,
          essenceBefore: 300,
          essenceAfter: 300,
          freeNextShopSource: freePurchaseSource,
        },
        {
          eventSeq: 44,
          siteId: SITE_ID,
          slotIndex: 0,
          pricePaid: 0,
          essenceBefore: 250,
          essenceAfter: 250,
          freeNextShopSource: freePurchaseSource,
        },
      ],
    });
  });

  it("consumes a T82 purchase at a Dreamsign Bazaar and records replacement identity", () => {
    const modifier = {
      kind: "free-purchases" as const,
      sourceSiteId: parseSiteId("exploration-site"),
      sourceActionId: testExplorationActionId("free-bazaar-action"),
      initialCount: 1,
      remainingCount: 1,
    };
    const state = shopState(
      [dreamsignSlot("offered-dreamsign")],
      {
        essence: 0,
        maxDreamsigns: 1,
        dreamsigns: [
          {
            id: testDreamsignId("replaced-dreamsign"),
            name: "Replaced",
            effectDescription: "Replaced effect",
          },
        ],
        shopModifiers: shopModifiers({ freePurchaseModifiers: [modifier] }),
      },
      "DreamsignBazaar",
    );

    const result = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
      purgeIndex: 0,
    });

    expect(result.outcome).toBe("applied");
    expect(result.state.journey.shopModifiers.freePurchaseModifiers).toEqual(
      [],
    );
    expect(result.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      kind: "shop",
      purchaseHistory: [
        {
          item: {
            kind: "dreamsign",
            dreamsignId: testDreamsignId("offered-dreamsign"),
            replacedDreamsignId: testDreamsignId("replaced-dreamsign"),
          },
          priceBeforeFree: 100,
          pricePaid: 0,
          essenceBefore: 0,
          essenceAfter: 0,
          freePurchaseModifier: {
            sourceActionId: testExplorationActionId("free-bazaar-action"),
            remainingBefore: 1,
            remainingAfter: 0,
          },
        },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// REROLL_SHOP
// ---------------------------------------------------------------------------

describe("REROLL_SHOP", () => {

  it("consumes a free reroll before charging essence (order)", () => {
    registerSiteContentProvider(rerollProvider);
    const state = shopState([cardSlot()], {
      essence: 300,
      shopModifiers: shopModifiers({ freeRerolls: 1 }),
    });
    const result = reduce(state, "REROLL_SHOP", { siteId: SITE_ID });
    expect(result.outcome).toBe("applied");
    // Free reroll consumed first; essence untouched.
    expect(result.state.journey.shopModifiers.freeRerolls).toBe(0);
    expect(result.state.journey.essence).toBe(300);
    const runtime = result.state.journey.siteRuntime[
      SITE_ID
    ] as ShopSiteRuntime;
    expect(runtime.rerollCount).toBe(1);
  });

  it("charges essence when no free reroll is available", () => {
    registerSiteContentProvider(rerollProvider);
    const cost = 50;
    const state = shopState([cardSlot()], {
      essence: 300,
      shopModifiers: shopModifiers(),
    });
    const result = reduce(state, "REROLL_SHOP", { siteId: SITE_ID });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.shopModifiers.freeRerolls).toBe(0);
    expect(result.state.journey.essence).toBe(300 - cost);
  });
});

// ---------------------------------------------------------------------------
// GRANT_FREE_REROLLS / APPLY_SHOP_DISCOUNT
// ---------------------------------------------------------------------------

describe("shop modifier grants", () => {
  it("GRANT_FREE_REROLLS adds to the free-reroll pool", () => {
    const state = shopState([cardSlot()], {
      shopModifiers: shopModifiers({ freeRerolls: 1 }),
    });
    const result = reduce(state, "GRANT_FREE_REROLLS", { count: 2 });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.shopModifiers.freeRerolls).toBe(3);
  });

  it("APPLY_SHOP_DISCOUNT adds to the essence discount", () => {
    const state = shopState([cardSlot()], {
      shopModifiers: shopModifiers({ essenceDiscountPercent: 10 }),
    });
    const result = reduce(state, "APPLY_SHOP_DISCOUNT", { percent: 15 });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.shopModifiers.essenceDiscountPercent).toBe(25);
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
    expect(result.state.journey.battleModifiers).toEqual([modifier]);
  });

  it("PUSH_TEMPORARY_NIGHTMARE_GRANT adds Nightmare entries and a modifier", () => {
    registerDeckContentProvider({
      resolveCardNumber: (cardId) =>
        cardId === NIGHTMARE_CARD_ID ? 10002 : null,
      resolveDreamsign: () => null,
    });
    const state = shopState([cardSlot()]);
    const result = reduce(state, "PUSH_TEMPORARY_NIGHTMARE_GRANT", {
      cardId: NIGHTMARE_CARD_ID,
      count: 2,
      battlesRemaining: 1,
      source: "augury",
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.deck).toHaveLength(2);
    expect(result.state.journey.deck.every((e) => e.isBane)).toBe(true);
    expect(result.state.journey.deck.every((e) => e.cardNumber === 10002)).toBe(
      true,
    );
    const modifiers = result.state.journey.battleModifiers;
    expect(modifiers).toHaveLength(1);
    const mod = modifiers[0];
    expect(mod.kind).toBe("temporary_nightmare_grant");
    if (mod.kind === "temporary_nightmare_grant") {
      expect(mod.count).toBe(2);
      expect(mod.addedEntryIds).toHaveLength(2);
      expect(mod.addedEntryIds).toEqual(
        result.state.journey.deck.map((e) => e.entryId),
      );
    }
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
    const mods = result.state.journey.dreamscapeModifiers;
    expect(mods).toHaveLength(1);
    const mod = mods[0];
    expect(mod.kind).toBe("remove_shop_sites");
    expect(mod.dreamscapesRemaining).toBe(3);
  });

  it("BOOST_SITE_APPEARANCE appends a boost modifier with its dreamscape count", () => {
    const state = shopState([cardSlot()]);
    const result = reduce(state, "BOOST_SITE_APPEARANCE", {
      siteType: "Essence",
      percent: 50,
      dreamscapesRemaining: 2,
    });
    expect(result.outcome).toBe("applied");
    const mod = result.state.journey.dreamscapeModifiers[0];
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
    const state = shopState([cardSlot()], {
      screen: { type: "dreamscape" },
      activeSiteId: null,
    }); // node has one Shop site
    const result = reduce(state, "REPLACE_SITE_TYPE", {
      nodeId: NODE_ID,
      fromSiteType: "Shop",
      toSiteType: "Essence",
    });
    expect(result.outcome).toBe("applied");
    const node = result.state.journey.atlas.nodes[NODE_ID];
    expect(node.sites).toHaveLength(1);
    expect(node.sites[0].type).toBe("Essence");
    expect(node.sites[0].id).not.toBe(SITE_ID);
  });

  it("ADD_SITE_TO_DREAMSCAPE appends a new site to the node", () => {
    const state = shopState([cardSlot()]);
    const result = reduce(state, "ADD_SITE_TO_DREAMSCAPE", {
      nodeId: NODE_ID,
      siteType: "Essence",
    });
    expect(result.outcome).toBe("applied");
    const node = result.state.journey.atlas.nodes[NODE_ID];
    expect(node.sites).toHaveLength(2);
    expect(node.sites[1].type).toBe("Essence");
    expect(node.sites[1].isVisited).toBe(false);
  });

  it("uses configured Random Site destinations and presenting guide for Atlas edits", () => {
    registerSiteContentProvider(
      testSiteContentProvider({
        sitesData: {
          ...MINIMAL_SITES_DATA,
          randomSite: {
            ...MINIMAL_SITES_DATA.randomSite,
            destinations: ["Exploration"],
            guideId: testGuideId("fixture-random-guide"),
          },
        },
      }),
    );
    const state = shopState([cardSlot()]);
    const result = reduce(state, "ADD_SITE_TO_DREAMSCAPE", {
      nodeId: NODE_ID,
      siteType: "RandomSite",
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.atlas.nodes[NODE_ID].sites[1]).toMatchObject({
      type: "RandomSite",
      randomSite: {
        mode: "single",
        presentingGuideId: testGuideId("fixture-random-guide"),
        candidateSiteTypes: ["Exploration"],
        destinationSiteType: "Exploration",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Augury offers (provider-seam delegated)
// ---------------------------------------------------------------------------

describe("augury offers", () => {
  it("ACCEPT_AUGURY_OFFER delegates to the provider and applies its state", () => {
    const provider = testSiteContentProvider({
      resolveAugury({ journey, action }) {
        return action === "accept" ? { ...journey, essence: 499 } : null;
      },
    });
    registerSiteContentProvider(provider);
    const state = stateWith([makeSite("Augury")]);
    const result = reduce(state, "ACCEPT_AUGURY_OFFER", {
      siteId: SITE_ID,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.essence).toBe(499);
  });

  it("DECLINE_AUGURY delegates to the provider", () => {
    const provider = testSiteContentProvider({
      resolveAugury({ journey, action }) {
        return action === "decline"
          ? completeJourneySite(journey, SITE_ID)
          : null;
      },
    });
    registerSiteContentProvider(provider);
    const state = stateWith([makeSite("Augury")]);
    const result = reduce(state, "DECLINE_AUGURY", {
      siteId: SITE_ID,
    });
    expect(result.outcome).toBe("applied");
    expect(isSiteVisited(result.state.journey, SITE_ID)).toBe(true);
  });
});
