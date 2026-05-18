// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestContent } from "../data/quest-content";
import { resetLog } from "../logging";
import type { CardData } from "../types/cards";
import type { ResolvedDreamcallerPackage } from "../types/content";
import type {
  DreamAtlas,
  DreamscapeNode,
  Dreamsign,
  QuestState,
  SiteState,
} from "../types/quest";
import {
  QuestProvider,
  createDefaultState,
  useQuest,
  type QuestContextValue,
} from "./quest-context";

const roots: Root[] = [];

function makeCard(cardNumber: number, name?: string): CardData {
  return {
    name: name ?? `Card ${String(cardNumber)}`,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    tides: [],
    renderedText: "Test card.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeDreamsign(id: string, name: string): Dreamsign {
  return {
    id,
    name,
    effectDescription: `${name} effect.`,
    isBane: false,
  };
}

function makeQuestContent(
  cardDatabase: Map<number, CardData> = new Map(),
): QuestContent {
  return {
    cardDatabase,
    cardsByPackageTide: new Map(),
    dreamcallers: [],
    dreamsignTemplates: [],
    resolvedPackagesByDreamcallerId: new Map<
      string,
      ResolvedDreamcallerPackage
    >(),
  };
}

function makeSite(
  id: string,
  type: SiteState["type"],
  overrides: Partial<SiteState> = {},
): SiteState {
  return {
    id,
    type,
    isEnhanced: false,
    isVisited: false,
    ...overrides,
  };
}

function makeNode(
  id: string,
  sites: SiteState[],
  overrides: Partial<DreamscapeNode> = {},
): DreamscapeNode {
  return {
    id,
    biomeName: `Biome ${id}`,
    biomeColor: "#fff",
    sites,
    position: { x: 0, y: 0 },
    status: "available",
    enhancedSiteType: null,
    ...overrides,
  };
}

function makeAtlasWithCurrent(
  currentNode: DreamscapeNode,
  others: DreamscapeNode[] = [],
  edges: Array<[string, string]> = [],
): DreamAtlas {
  const nodes: Record<string, DreamscapeNode> = {
    [currentNode.id]: currentNode,
  };
  for (const node of others) {
    nodes[node.id] = node;
  }
  return {
    nodes,
    edges,
    startingNodeId: currentNode.id,
  };
}

function mount(element: ReactElement): void {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  act(() => {
    root.render(element);
  });
}

interface LiveQuestHandle {
  readonly state: QuestState;
  readonly mutations: QuestContextValue["mutations"];
}

/**
 * Mount a single-player QuestProvider and return a handle whose `state` and
 * `mutations` getters reread the latest `QuestContextValue` on every access.
 * The provider re-renders the `Capture` child on every state change; reading
 * `handle.state` after an `act()` always returns the post-mutation snapshot.
 */
function mountQuestContext({
  cardDatabase = new Map<number, CardData>(),
  initialState,
}: {
  cardDatabase?: Map<number, CardData>;
  initialState?: QuestState;
} = {}): LiveQuestHandle {
  if (initialState !== undefined) {
    sessionStorage.setItem(
      "quest-prototype-state-v1",
      JSON.stringify({ version: 1, state: initialState }),
    );
  }

  const captureRef: { current: QuestContextValue | null } = { current: null };

  function Capture() {
    captureRef.current = useQuest();
    return null;
  }

  mount(
    createElement(QuestProvider, {
      cardDatabase,
      questContent: makeQuestContent(cardDatabase),
      children: createElement(Capture),
    }),
  );

  if (captureRef.current === null) {
    throw new Error("Failed to capture quest context");
  }
  return {
    get state(): QuestState {
      if (captureRef.current === null) {
        throw new Error("Quest context captured null after mount");
      }
      return captureRef.current.state;
    },
    get mutations(): QuestContextValue["mutations"] {
      if (captureRef.current === null) {
        throw new Error("Quest context captured null after mount");
      }
      return captureRef.current.mutations;
    },
  };
}

beforeEach(() => {
  resetLog();
  sessionStorage.clear();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  for (const root of roots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("QuestState default modifier fields", () => {
  it("initializes battleModifiers to an empty array", () => {
    const state = createDefaultState();
    expect(state.battleModifiers).toEqual([]);
  });

  it("initializes shopModifiers to its empty record shape", () => {
    const state = createDefaultState();
    expect(state.shopModifiers).toEqual({
      freeRerolls: 0,
      upcomingOmenDiscounts: 0,
      essenceDiscountPercent: 0,
    });
  });

  it("initializes dreamscapeModifiers to an empty array", () => {
    const state = createDefaultState();
    expect(state.dreamscapeModifiers).toEqual([]);
  });
});

describe("pushBattleRewardModifier", () => {
  it("appends a reward_reduction_flat entry with the provided amount and battles", () => {
    const quest = mountQuestContext();

    act(() => {
      quest.mutations.pushBattleRewardModifier("flat", 10, 2, "src");
    });

    expect(quest.state.battleModifiers).toEqual([
      {
        kind: "reward_reduction_flat",
        amount: 10,
        battlesRemaining: 2,
        source: "src",
      },
    ]);
  });
});

describe("pushTemporaryBaneGrant", () => {
  it("adds bane deck entries and a modifier whose addedEntryIds match the new entries", () => {
    const cardDatabase = new Map<number, CardData>([
      [501, makeCard(501, "Nightmare")],
    ]);
    const quest = mountQuestContext({ cardDatabase });

    act(() => {
      quest.mutations.pushTemporaryBaneGrant("Nightmare", 2, 3, "journey:test");
    });

    const baneEntries = quest.state.deck.filter((entry) => entry.isBane);
    expect(baneEntries).toHaveLength(2);
    expect(baneEntries.every((entry) => entry.cardNumber === 501)).toBe(true);

    const addedEntryIds = baneEntries.map((entry) => entry.entryId);
    expect(quest.state.battleModifiers).toEqual([
      {
        kind: "temporary_bane_grant",
        baneName: "Nightmare",
        count: 2,
        battlesRemaining: 3,
        addedEntryIds,
        source: "journey:test",
      },
    ]);
  });
});

describe("incrementCompletionLevel battle modifier decay", () => {
  it("decrements each battleModifier and drops entries that reach zero", () => {
    const cardDatabase = new Map<number, CardData>([
      [501, makeCard(501, "Nightmare")],
    ]);
    const quest = mountQuestContext({ cardDatabase });

    act(() => {
      quest.mutations.pushBattleRewardModifier("flat", 10, 1, "src-1");
      quest.mutations.pushBattleRewardModifier("flat", 20, 2, "src-2");
      quest.mutations.pushBattleRewardModifier("percent", 25, 2, "src-3");
      quest.mutations.pushTemporaryBaneGrant("Nightmare", 1, 1, "src-4");
    });

    const initialBanes = quest.state.deck
      .filter((entry) => entry.isBane)
      .map((entry) => entry.entryId);
    expect(initialBanes).toHaveLength(1);

    act(() => {
      quest.mutations.incrementCompletionLevel(0, 0, null, null, false);
    });

    const kinds = quest.state.battleModifiers.map((modifier) => modifier.kind);
    expect(kinds).toEqual(["reward_reduction_flat", "reward_reduction_percent"]);
    expect(quest.state.battleModifiers[0]).toMatchObject({
      kind: "reward_reduction_flat",
      battlesRemaining: 1,
      source: "src-2",
    });
    expect(quest.state.battleModifiers[1]).toMatchObject({
      kind: "reward_reduction_percent",
      battlesRemaining: 1,
      source: "src-3",
      percent: 25,
    });

    // The temporary bane grant's deck entry should have been removed when its
    // counter dropped to zero.
    const remainingBanes = quest.state.deck.filter((entry) => entry.isBane);
    expect(remainingBanes).toEqual([]);
  });
});

describe("setCurrentDreamscape dreamscape modifier decay", () => {
  it("decrements every dreamscapeModifier when the dreamscape changes; drops entries at zero", () => {
    const currentNode = makeNode("dreamscape-1", [makeSite("s-1", "Battle")]);
    const nextNode = makeNode("dreamscape-2", [makeSite("s-2", "Battle")]);
    const initialState: QuestState = {
      ...createDefaultState(),
      atlas: makeAtlasWithCurrent(currentNode, [nextNode]),
      currentDreamscape: currentNode.id,
    };
    const quest = mountQuestContext({ initialState });

    act(() => {
      quest.mutations.removeSiteTypeFromNextDreamscapes("Shop", 1, "src-1");
      quest.mutations.removeSiteTypeFromNextDreamscapes("DreamsignOffering", 2, "src-2");
    });

    expect(quest.state.dreamscapeModifiers).toHaveLength(2);

    act(() => {
      quest.mutations.setCurrentDreamscape(nextNode.id);
    });

    expect(quest.state.dreamscapeModifiers).toHaveLength(1);
    expect(quest.state.dreamscapeModifiers[0]).toMatchObject({
      kind: "remove_dreamsign_sites",
      dreamscapesRemaining: 1,
      source: "src-2",
    });
  });

  it("does not decrement when the dreamscape id is unchanged", () => {
    const currentNode = makeNode("dreamscape-1", [makeSite("s-1", "Battle")]);
    const initialState: QuestState = {
      ...createDefaultState(),
      atlas: makeAtlasWithCurrent(currentNode),
      currentDreamscape: currentNode.id,
    };
    const quest = mountQuestContext({ initialState });

    act(() => {
      quest.mutations.removeSiteTypeFromNextDreamscapes("Shop", 2, "src-1");
    });

    act(() => {
      quest.mutations.setCurrentDreamscape(currentNode.id);
    });

    expect(quest.state.dreamscapeModifiers[0]).toMatchObject({
      dreamscapesRemaining: 2,
    });
  });
});

describe("rerollShop free-reroll consumption", () => {
  it("skips the omen cost and decrements freeRerolls when freeRerolls > 0", () => {
    const cardDatabase = new Map<number, CardData>();
    const site = makeSite("shop-site", "Shop");
    const node = makeNode("dreamscape-1", [site]);
    const initialState: QuestState = {
      ...createDefaultState(),
      atlas: makeAtlasWithCurrent(node),
      currentDreamscape: node.id,
      omens: 0, // no omens means a paid reroll would no-op
      shopModifiers: {
        freeRerolls: 2,
        upcomingOmenDiscounts: 0,
        essenceDiscountPercent: 0,
      },
      siteRuntime: {
        [site.id]: {
          kind: "shop",
          slots: [],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
          restrictedTide: null,
        },
      },
    };
    const quest = mountQuestContext({ cardDatabase, initialState });

    act(() => {
      quest.mutations.rerollShop(site);
    });

    expect(quest.state.omens).toBe(0);
    expect(quest.state.shopModifiers.freeRerolls).toBe(1);
    const runtime = quest.state.siteRuntime[site.id];
    if (runtime?.kind !== "shop") {
      throw new Error("Expected shop runtime");
    }
    expect(runtime.rerollCount).toBe(1);
  });
});

describe("buyShopSlot essence discounts", () => {
  it("charges card slots with the permanent shop essence discount applied", () => {
    const cardDatabase = new Map<number, CardData>([[101, makeCard(101)]]);
    const site = makeSite("shop-site", "Shop");
    const node = makeNode("dreamscape-1", [site]);
    const initialState: QuestState = {
      ...createDefaultState(),
      atlas: makeAtlasWithCurrent(node),
      currentDreamscape: node.id,
      essence: 100,
      shopModifiers: {
        freeRerolls: 0,
        upcomingOmenDiscounts: 0,
        essenceDiscountPercent: 50,
      },
      siteRuntime: {
        [site.id]: {
          kind: "shop",
          slots: [
            {
              itemType: "card",
              cardNumber: 101,
              basePrice: 100,
              discountPercent: 30,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
          restrictedTide: null,
        },
      },
    };
    const quest = mountQuestContext({ cardDatabase, initialState });

    act(() => {
      quest.mutations.buyShopSlot(site.id, 0);
    });

    expect(quest.state.essence).toBe(80);
    expect(quest.state.deck[quest.state.deck.length - 1]).toMatchObject({
      cardNumber: 101,
    });
    const runtime = quest.state.siteRuntime[site.id];
    if (runtime?.kind !== "shop") {
      throw new Error("Expected shop runtime");
    }
    expect(runtime.slots[0]?.purchased).toBe(true);
  });
});

describe("buyShopSlot omen discounts", () => {
  it("spends one upcoming omen discount on a positive Dreamsign omen price", () => {
    const dreamsign = makeDreamsign("dreamsign-1", "Dreamsign One");
    const site = makeSite("shop-site", "Shop");
    const node = makeNode("dreamscape-1", [site]);
    const initialState: QuestState = {
      ...createDefaultState(),
      atlas: makeAtlasWithCurrent(node),
      currentDreamscape: node.id,
      omens: 2,
      shopModifiers: {
        freeRerolls: 0,
        upcomingOmenDiscounts: 1,
        essenceDiscountPercent: 0,
      },
      siteRuntime: {
        [site.id]: {
          kind: "shop",
          slots: [
            {
              itemType: "dreamsign",
              dreamsign,
              basePrice: 2,
              discountPercent: 0,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
          restrictedTide: null,
        },
      },
    };
    const quest = mountQuestContext({ initialState });

    act(() => {
      quest.mutations.buyShopSlot(site.id, 0);
    });

    expect(quest.state.omens).toBe(1);
    expect(quest.state.shopModifiers.upcomingOmenDiscounts).toBe(0);
    expect(quest.state.dreamsigns).toEqual([dreamsign]);
  });

  it("keeps upcoming omen discounts when a free Dreamsign slot is purchased", () => {
    const dreamsign = makeDreamsign("dreamsign-1", "Dreamsign One");
    const site = makeSite("shop-site", "Shop");
    const node = makeNode("dreamscape-1", [site]);
    const initialState: QuestState = {
      ...createDefaultState(),
      atlas: makeAtlasWithCurrent(node),
      currentDreamscape: node.id,
      omens: 0,
      shopModifiers: {
        freeRerolls: 0,
        upcomingOmenDiscounts: 1,
        essenceDiscountPercent: 0,
      },
      siteRuntime: {
        [site.id]: {
          kind: "shop",
          slots: [
            {
              itemType: "dreamsign",
              dreamsign,
              basePrice: 0,
              discountPercent: 0,
              purchased: false,
            },
          ],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
          restrictedTide: null,
        },
      },
    };
    const quest = mountQuestContext({ initialState });

    act(() => {
      quest.mutations.buyShopSlot(site.id, 0);
    });

    expect(quest.state.omens).toBe(0);
    expect(quest.state.shopModifiers.upcomingOmenDiscounts).toBe(1);
    expect(quest.state.dreamsigns).toEqual([dreamsign]);
  });
});

describe("grantFreeShopRerolls", () => {
  it("increments shopModifiers.freeRerolls additively", () => {
    const quest = mountQuestContext();

    act(() => {
      quest.mutations.grantFreeShopRerolls(3, "src");
    });

    expect(quest.state.shopModifiers.freeRerolls).toBe(3);

    act(() => {
      quest.mutations.grantFreeShopRerolls(2, "src");
    });

    expect(quest.state.shopModifiers.freeRerolls).toBe(5);
  });
});

describe("addSiteToDreamscape", () => {
  it("adds an unvisited site of the requested type to the current dreamscape", () => {
    const node = makeNode("dreamscape-1", [makeSite("s-1", "Battle")]);
    const initialState: QuestState = {
      ...createDefaultState(),
      atlas: makeAtlasWithCurrent(node),
      currentDreamscape: node.id,
    };
    const quest = mountQuestContext({ initialState });

    act(() => {
      quest.mutations.addSiteToDreamscape("current", "Shop", "src");
    });

    const currentNode = quest.state.atlas.nodes[node.id];
    const types = currentNode?.sites.map((site) => site.type) ?? [];
    expect(types).toContain("Shop");
    const newShop = currentNode?.sites.find((site) => site.type === "Shop");
    expect(newShop?.isVisited).toBe(false);
  });

  it("adds a site to the next dreamscape via edges", () => {
    const current = makeNode("dreamscape-1", [makeSite("s-1", "Battle")]);
    const next = makeNode("dreamscape-2", [makeSite("s-2", "Battle")]);
    const initialState: QuestState = {
      ...createDefaultState(),
      atlas: makeAtlasWithCurrent(current, [next], [[current.id, next.id]]),
      currentDreamscape: current.id,
    };
    const quest = mountQuestContext({ initialState });

    act(() => {
      quest.mutations.addSiteToDreamscape("next", "Shop", "src");
    });

    expect(
      quest.state.atlas.nodes[next.id]?.sites.map((s) => s.type),
    ).toContain("Shop");
    expect(
      quest.state.atlas.nodes[current.id]?.sites.map((s) => s.type),
    ).not.toContain("Shop");
  });

  it("targets the forward neighbour, skipping completed ancestors", () => {
    // Atlas edges are stored as [parent, child] tuples in insertion order;
    // when the player has progressed past the starting dreamscape, the
    // `[D1, D2]` edge appears before `[D2, D3]`. Completed ancestors must be
    // skipped so the site lands in the still-unvisited D3.
    const d1 = makeNode("D1", [makeSite("d1-s1", "Battle")], {
      status: "completed",
    });
    const d2 = makeNode("D2", [makeSite("d2-s1", "Battle")], {
      status: "available",
    });
    const d3 = makeNode("D3", [makeSite("d3-s1", "Battle")], {
      status: "unavailable",
    });
    const initialState: QuestState = {
      ...createDefaultState(),
      atlas: {
        nodes: { D1: d1, D2: d2, D3: d3 },
        edges: [
          ["D1", "D2"],
          ["D2", "D3"],
        ],
        startingNodeId: d1.id,
      },
      currentDreamscape: d2.id,
    };
    const quest = mountQuestContext({ initialState });

    act(() => {
      quest.mutations.addSiteToDreamscape("next", "Shop", "src");
    });

    expect(quest.state.atlas.nodes.D3?.sites.map((s) => s.type)).toContain(
      "Shop",
    );
    expect(quest.state.atlas.nodes.D1?.sites.map((s) => s.type)).not.toContain(
      "Shop",
    );
  });
});

describe("replaceSiteType", () => {
  it("swaps one unvisited site of `from` for `to` in the current dreamscape", () => {
    const battleSite = makeSite("s-battle", "Battle");
    const node = makeNode("dreamscape-1", [battleSite]);
    const initialState: QuestState = {
      ...createDefaultState(),
      atlas: makeAtlasWithCurrent(node),
      currentDreamscape: node.id,
    };
    const quest = mountQuestContext({ initialState });

    act(() => {
      quest.mutations.replaceSiteType("Battle", "Essence", "src");
    });

    const types =
      quest.state.atlas.nodes[node.id]?.sites.map((site) => site.type) ?? [];
    expect(types).toContain("Essence");
    expect(types).not.toContain("Battle");
  });

  it("no-ops when there are no matching unvisited sites", () => {
    const visitedBattle = makeSite("s-battle", "Battle", { isVisited: true });
    const essence = makeSite("s-essence", "Essence");
    const node = makeNode("dreamscape-1", [visitedBattle, essence]);
    const initialState: QuestState = {
      ...createDefaultState(),
      atlas: makeAtlasWithCurrent(node),
      currentDreamscape: node.id,
    };
    const quest = mountQuestContext({ initialState });

    act(() => {
      quest.mutations.replaceSiteType("Battle", "Essence", "src");
    });

    const types =
      quest.state.atlas.nodes[node.id]?.sites.map((site) => site.type) ?? [];
    expect(types).toEqual(["Battle", "Essence"]);
  });
});

describe("removeSiteTypeFromNextDreamscapes", () => {
  it("pushes a dreamscape-scoped modifier with the configured dreamscapesRemaining", () => {
    const quest = mountQuestContext();

    act(() => {
      quest.mutations.removeSiteTypeFromNextDreamscapes("Shop", 2, "src");
    });

    expect(quest.state.dreamscapeModifiers).toEqual([
      {
        kind: "remove_shop_sites",
        dreamscapesRemaining: 2,
        source: "src",
      },
    ]);
  });
});

describe("applyShopEssenceDiscount", () => {
  it("adds the percent to shopModifiers.essenceDiscountPercent", () => {
    const quest = mountQuestContext();

    act(() => {
      quest.mutations.applyShopEssenceDiscount(20, "src");
    });

    expect(quest.state.shopModifiers.essenceDiscountPercent).toBe(20);

    act(() => {
      quest.mutations.applyShopEssenceDiscount(15, "src");
    });

    expect(quest.state.shopModifiers.essenceDiscountPercent).toBe(35);
  });
});

describe("grantShopOmenDiscounts", () => {
  it("increments shopModifiers.upcomingOmenDiscounts additively", () => {
    const quest = mountQuestContext();

    act(() => {
      quest.mutations.grantShopOmenDiscounts(3, "src");
    });

    expect(quest.state.shopModifiers.upcomingOmenDiscounts).toBe(3);

    act(() => {
      quest.mutations.grantShopOmenDiscounts(2, "src");
    });

    expect(quest.state.shopModifiers.upcomingOmenDiscounts).toBe(5);
  });
});

describe("boostSiteAppearance", () => {
  it("pushes a boost_site_appearance modifier with siteType + percent + dreamscapesRemaining", () => {
    const quest = mountQuestContext();

    act(() => {
      quest.mutations.boostSiteAppearance("Shop", 20, 3, "src");
    });

    expect(quest.state.dreamscapeModifiers).toEqual([
      {
        kind: "boost_site_appearance",
        siteType: "Shop",
        percent: 20,
        dreamscapesRemaining: 3,
        source: "src",
      },
    ]);
  });
});

describe("addCardById", () => {
  it("resolves a known cardId via linear scan and appends a non-bane deck entry", () => {
    const cardDatabase = new Map<number, CardData>([
      [501, makeCard(501, "Nightmare")],
      [502, makeCard(502, "Dreamer")],
    ]);
    const quest = mountQuestContext({ cardDatabase });

    let entryId: string | null = null;
    act(() => {
      entryId = quest.mutations.addCardById("card-502", "journey:test");
    });

    expect(quest.state.deck).toHaveLength(1);
    const entry = quest.state.deck[0];
    expect(entryId).toBe(entry?.entryId);
    expect(entry?.cardNumber).toBe(502);
    expect(entry?.isBane).toBe(false);
  });

  it("warns and no-ops when the cardId is unknown", () => {
    const cardDatabase = new Map<number, CardData>([
      [501, makeCard(501, "Nightmare")],
    ]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const quest = mountQuestContext({ cardDatabase });
    const deckBefore = quest.state.deck;

    let entryId: string | null = "not-null";
    act(() => {
      entryId = quest.mutations.addCardById("card-999", "journey:test");
    });

    expect(entryId).toBeNull();
    expect(quest.state.deck).toBe(deckBefore);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("addCardById: unknown cardId 'card-999'"),
    );
  });

  it("adds a transfigured entry through the composed mutation", () => {
    const cardDatabase = new Map<number, CardData>([
      [501, makeCard(501, "Nightmare")],
    ]);
    const quest = mountQuestContext({ cardDatabase });

    let entryId: string | null = null;
    act(() => {
      entryId = quest.mutations.addCardByIdWithTransfiguration(
        "card-501",
        "Bronze",
        "journey:test",
      );
    });

    expect(quest.state.deck).toHaveLength(1);
    expect(quest.state.deck[0]).toEqual({
      entryId,
      cardNumber: 501,
      transfiguration: "Bronze",
      isBane: false,
    });
  });
});

describe("addBaneCardById", () => {
  it("resolves a known cardId via linear scan and appends a bane-flagged deck entry", () => {
    const cardDatabase = new Map<number, CardData>([
      [501, makeCard(501, "Nightmare")],
    ]);
    const quest = mountQuestContext({ cardDatabase });

    act(() => {
      quest.mutations.addBaneCardById("card-501", "journey:test");
    });

    expect(quest.state.deck).toHaveLength(1);
    const entry = quest.state.deck[0];
    expect(entry?.cardNumber).toBe(501);
    expect(entry?.isBane).toBe(true);
  });

  it("warns and no-ops when the cardId is unknown", () => {
    const cardDatabase = new Map<number, CardData>([
      [501, makeCard(501, "Nightmare")],
    ]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const quest = mountQuestContext({ cardDatabase });
    const deckBefore = quest.state.deck;

    act(() => {
      quest.mutations.addBaneCardById("card-missing", "journey:test");
    });

    expect(quest.state.deck).toBe(deckBefore);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("addBaneCardById: unknown cardId 'card-missing'"),
    );
  });
});

describe("changeDeckEntryKeywords", () => {
  it("adds repeated Reclaim grants together on one deck entry", () => {
    const cardDatabase = new Map<number, CardData>([
      [501, makeCard(501, "Reclaim Target")],
    ]);
    const initialState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "deck-501",
          cardNumber: 501,
          transfiguration: null,
          typeChange: null,
          keywordModification: null,
          isBane: false,
        },
      ],
    };
    const quest = mountQuestContext({ cardDatabase, initialState });

    act(() => {
      quest.mutations.changeDeckEntryKeywords(
        "deck-501",
        { reclaim: 2 },
        "journey:first",
      );
    });
    act(() => {
      quest.mutations.changeDeckEntryKeywords(
        "deck-501",
        { reclaim: 3 },
        "journey:second",
      );
    });

    expect(quest.state.deck[0]?.keywordModification).toEqual({ reclaim: 5 });
  });
});
