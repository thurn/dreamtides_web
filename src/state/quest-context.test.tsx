// @vitest-environment jsdom

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestContent } from "../data/quest-content";
import { getLogEntries, resetLog } from "../logging";
import type { CardData } from "../types/cards";
import type {
  DreamAtlas,
  DreamscapeNode,
  Dreamsign,
  QuestState,
  SiteState,
} from "../types/quest";
import {
  buildMerchantContext,
  generateMerchantEncounter,
} from "../journey_v2";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestDreamsignTemplate,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
} from "../journey_v2/testing/fixtures";
import type {
  MerchantAcceptRequest,
  MerchantDeclineRequest,
  MerchantOffer,
} from "../journey_v2";
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
    dreamcallers: [],
    dreamsignTemplates: [],
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
  questContent,
  initialState,
}: {
  cardDatabase?: Map<number, CardData>;
  questContent?: QuestContent;
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
      questContent: questContent ?? makeQuestContent(cardDatabase),
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

const MERCHANT_UUIDS = {
  deckHighEvent: "81000000-0000-4000-8000-000000000001",
  deckHighCharacter: "81000000-0000-4000-8000-000000000002",
  deckFillerA: "81000000-0000-4000-8000-000000000003",
  deckFillerB: "81000000-0000-4000-8000-000000000004",
  deckFillerC: "81000000-0000-4000-8000-000000000005",
  deckFillerD: "81000000-0000-4000-8000-000000000006",
  drawA: "81000000-0000-4000-8000-000000000101",
  drawB: "81000000-0000-4000-8000-000000000102",
  drawC: "81000000-0000-4000-8000-000000000103",
  recursionA: "81000000-0000-4000-8000-000000000201",
  recursionB: "81000000-0000-4000-8000-000000000202",
  interactionA: "81000000-0000-4000-8000-000000000301",
  interactionB: "81000000-0000-4000-8000-000000000302",
  earlyA: "81000000-0000-4000-8000-000000000401",
  earlyB: "81000000-0000-4000-8000-000000000402",
} as const;

function makeMerchantCard(
  id: string,
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return makeMerchantTestCard({
    id,
    cardNumber,
    name: `Merchant Fixture ${String(cardNumber)}`,
    cardType: "Character",
    energyCost: 2,
    spark: 1,
    renderedText: "",
    ...overrides,
  });
}

function merchantFixtureCards(): CardData[] {
  return [
    makeMerchantCard(MERCHANT_UUIDS.deckHighEvent, 1, {
      cardType: "Event",
      energyCost: 5,
      spark: null,
      renderedText: "Fast.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.deckHighCharacter, 2, {
      energyCost: 5,
      spark: 4,
    }),
    makeMerchantCard(MERCHANT_UUIDS.deckFillerA, 3, { energyCost: 4 }),
    makeMerchantCard(MERCHANT_UUIDS.deckFillerB, 4, { energyCost: 4 }),
    makeMerchantCard(MERCHANT_UUIDS.deckFillerC, 5, { energyCost: 3 }),
    makeMerchantCard(MERCHANT_UUIDS.deckFillerD, 6, { energyCost: 3 }),
    makeMerchantCard(MERCHANT_UUIDS.drawA, 101, {
      renderedText: "Draw a card.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.drawB, 102, {
      renderedText: "Draw two cards.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.drawC, 103, {
      renderedText: "When this enters, draw a card.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.recursionA, 201, {
      renderedText: "Reclaim 1.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.recursionB, 202, {
      renderedText: "Return a card from your void to your hand.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.interactionA, 301, {
      renderedText: "Banish an enemy.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.interactionB, 302, {
      renderedText: "Prevent the next damage.",
    }),
    makeMerchantCard(MERCHANT_UUIDS.earlyA, 401, { energyCost: 1 }),
    makeMerchantCard(MERCHANT_UUIDS.earlyB, 402, { energyCost: 1 }),
  ];
}

function makeMerchantProviderFixture(): {
  state: QuestState;
  questContent: QuestContent;
  site: SiteState;
} {
  const site = makeMerchantTestSite({
    id: "site-merchant-provider",
    type: "DreamJourney",
  });
  const state = makeMerchantTestQuestState({
    seed: "merchant-provider-seed",
    essence: 240,
    essenceCap: 360,
    currentDreamscape: "dreamscape-a",
    screen: { type: "site", siteId: site.id },
    activeSiteId: site.id,
    deck: [1, 2, 3, 4, 5, 6].map((cardNumber, index) =>
      makeMerchantTestDeckEntry({
        entryId: `deck-${String(index + 1)}`,
        cardNumber,
      }),
    ),
    atlas: {
      nodes: {
        "dreamscape-a": {
          id: "dreamscape-a",
          biomeName: "Fixture",
          biomeColor: "#123456",
          sites: [site],
          position: { x: 0, y: 0 },
          status: "available",
          enhancedSiteType: null,
        },
      },
      edges: [],
      startingNodeId: "dreamscape-a",
    },
  });
  const cards = merchantFixtureCards();
  const corpus: Record<string, { quality: number }> = {};
  for (const [index, card] of cards.entries()) {
    corpus[card.id] = { quality: 0.1 + (index % 10) / 10 };
  }
  const questContent = makeMerchantTestContent({
    cards,
    dreamsignTemplates: [
      makeMerchantTestDreamsignTemplate({ id: "sign-a", name: "Sign A" }),
      makeMerchantTestDreamsignTemplate({ id: "sign-b", name: "Sign B" }),
    ],
    merchantCorpus: makeMerchantTestCorpus({ cards: corpus }),
    dreamsignProfiles: new Map(),
  });
  return { state, questContent, site };
}

function merchantEncounterFor(fixture: {
  state: QuestState;
  questContent: QuestContent;
  site: SiteState;
}) {
  return generateMerchantEncounter(
    buildMerchantContext({
      questState: fixture.state,
      questContent: fixture.questContent,
      site: fixture.site,
    }),
  );
}

function merchantAcceptRequestFor(offer: MerchantOffer): MerchantAcceptRequest {
  return {
    encounterSignature: offer.encounterSignature,
    offerId: offer.offerId,
    archetypeId: offer.archetypeId,
  };
}

function merchantDeclineRequestFor(offer: MerchantOffer): MerchantDeclineRequest {
  return {
    encounterSignature: offer.encounterSignature,
    offerId: offer.offerId,
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

describe("Dream Merchant v2 mutations", () => {
  it("accepts one generated offer and completes the site", () => {
    const fixture = makeMerchantProviderFixture();
    const encounter = merchantEncounterFor(fixture);
    // Prefer a direct-payload (non-hidden) offer; fall back to a face-up
    // chooser offer using its first candidate. `hiddenUntilCommit` offers are
    // excluded because they require a prior commit step — tested separately in
    // the commit-then-reveal suite.
    const directOffer = encounter.offers.find(
      (candidate) => candidate.applyPayload !== undefined && !candidate.hiddenUntilCommit,
    );
    const offerWithFirstCandidate = (() => {
      for (const candidate of encounter.offers) {
        if (candidate.hiddenUntilCommit) continue;
        const first = candidate.choiceRequest?.candidates[0];
        if (first !== undefined) return { offer: candidate, choice: first };
      }
      return null;
    })();

    const offerId = directOffer?.offerId ?? offerWithFirstCandidate?.offer.offerId;
    if (offerId === undefined) throw new Error("Expected at least one usable non-hidden offer");
    const offer = encounter.offers.find((o) => o.offerId === offerId);
    if (offer === undefined) throw new Error("Expected merchant offer");

    const acceptRequest: MerchantAcceptRequest = {
      encounterSignature: offer.encounterSignature,
      offerId: offer.offerId,
      archetypeId: offer.archetypeId,
      ...(directOffer === undefined && offerWithFirstCandidate !== null
        ? { choice: { choiceId: offerWithFirstCandidate.choice.choiceId } }
        : {}),
    };

    const quest = mountQuestContext({
      cardDatabase: fixture.questContent.cardDatabase,
      questContent: fixture.questContent,
      initialState: fixture.state,
    });

    act(() => {
      quest.mutations.acceptDreamMerchantOffer(
        fixture.site.id,
        acceptRequest,
      );
    });

    expect(quest.state.visitedSites).toContain(fixture.site.id);
    expect(quest.state.atlas.nodes["dreamscape-a"]?.sites[0]?.isVisited).toBe(true);
    expect(quest.state.siteRuntime[fixture.site.id]).toEqual({
      kind: "dreamJourney",
      completed: true,
    });
    expect(quest.state.screen).toEqual({ type: "dreamscape" });
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "merchant_offer_accepted",
          siteId: fixture.site.id,
          offerId: offer.offerId,
          archetypeId: offer.archetypeId,
          targetKey: offer.targetKey,
        }),
      ]),
    );
  });

  it("leaves state unchanged and logs validation failure for an invalid request", () => {
    const fixture = makeMerchantProviderFixture();
    const offer = merchantEncounterFor(fixture).offers[0];
    if (offer === undefined) throw new Error("Expected merchant offer");
    const quest = mountQuestContext({
      cardDatabase: fixture.questContent.cardDatabase,
      questContent: fixture.questContent,
      initialState: fixture.state,
    });
    const before = quest.state;

    act(() => {
      quest.mutations.acceptDreamMerchantOffer(fixture.site.id, {
        ...merchantAcceptRequestFor(offer),
        encounterSignature: `${offer.encounterSignature}-stale`,
      });
    });

    expect(quest.state).toBe(before);
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "merchant_offer_validation_failed",
          siteId: fixture.site.id,
          offerId: offer.offerId,
          reason: "stale_encounter",
        }),
      ]),
    );
  });

  it("declines the merchant and completes the site without deck or resource changes", () => {
    const fixture = makeMerchantProviderFixture();
    const offer = merchantEncounterFor(fixture).offers[0];
    if (offer === undefined) throw new Error("Expected merchant offer");
    const quest = mountQuestContext({
      cardDatabase: fixture.questContent.cardDatabase,
      questContent: fixture.questContent,
      initialState: fixture.state,
    });

    act(() => {
      quest.mutations.declineDreamMerchant(
        fixture.site.id,
        merchantDeclineRequestFor(offer),
      );
    });

    expect(quest.state.deck).toEqual(fixture.state.deck);
    expect(quest.state.dreamsigns).toEqual(fixture.state.dreamsigns);
    expect(quest.state.essence).toBe(fixture.state.essence);
    expect(quest.state.essenceCap).toBe(fixture.state.essenceCap);
    expect(quest.state.omens).toBe(fixture.state.omens);
    expect(quest.state.visitedSites).toContain(fixture.site.id);
    expect(quest.state.siteRuntime[fixture.site.id]).toEqual({
      kind: "dreamJourney",
      completed: true,
    });
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "merchant_offer_declined",
          siteId: fixture.site.id,
          offerId: offer.offerId,
        }),
      ]),
    );
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

  it("expires a dreamsign-site removal modifier after its configured dreamscape move", () => {
    const currentNode = makeNode("dreamscape-1", [makeSite("s-1", "Battle")]);
    const nextNode = makeNode("dreamscape-2", [makeSite("s-2", "Battle")]);
    const initialState: QuestState = {
      ...createDefaultState(),
      atlas: makeAtlasWithCurrent(currentNode, [nextNode]),
      currentDreamscape: currentNode.id,
    };
    const quest = mountQuestContext({ initialState });

    act(() => {
      quest.mutations.removeSiteTypeFromNextDreamscapes(
        "DreamsignOffering",
        1,
        "src-dreamsign",
      );
    });

    expect(quest.state.dreamscapeModifiers).toEqual([
      {
        kind: "remove_dreamsign_sites",
        dreamscapesRemaining: 1,
        source: "src-dreamsign",
      },
    ]);

    act(() => {
      quest.mutations.setCurrentDreamscape(nextNode.id);
    });

    expect(quest.state.dreamscapeModifiers).toEqual([]);
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
