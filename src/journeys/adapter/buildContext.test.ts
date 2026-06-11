import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildJourneyContentBundle,
  cardDataToCardContent,
  dreamcallerContentToJourneyDreamcaller,
  normalizeRarity,
} from "./content-bridge";
import { buildJourneyContext } from "./buildContext";
import { journeySeedForSite } from "./seed";
import type { CardData } from "../../types/cards";
import type {
  DreamcallerContent,
  ResolvedDreamcallerPackage,
} from "../../types/content";
import type {
  DeckEntry,
  Dreamcaller,
  Dreamsign,
  QuestState,
  SiteState,
} from "../../types/quest";

// Minimal helpers used across the table-driven and projection tests below.
// Test fixtures are hand-built so this file stays under <100 ms total and
// does not depend on the real card-data.json / dreamsign-data.json / etc.

function makeCard(overrides: Partial<CardData> & { cardNumber: number }): CardData {
  return {
    id: `card-${overrides.cardNumber}`,
    name: `Card ${overrides.cardNumber}`,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: overrides.cardNumber,
    artOwned: false,
    ...overrides,
  };
}

function makeDeckEntry(overrides: Partial<DeckEntry> & { entryId: string }): DeckEntry {
  return {
    cardNumber: 1,
    transfiguration: null,
    isBane: false,
    ...overrides,
  };
}

function makeDreamcaller(): Dreamcaller {
  return {
    id: "dc-1",
    name: "Test Dreamcaller",
    title: "Title",
    renderedText: "",
    imageNumber: "1",
    startingEssence: 250,
  };
}

function makeResolvedPackage(
  draftPool: Record<string, number> = {},
  dreamsignPoolIds: string[] = [],
): ResolvedDreamcallerPackage {
  return {
    dreamcaller: {
      id: "dc-1",
      name: "Test Dreamcaller",
      title: "Title",
      renderedText: "",
      imageNumber: "1",
      startingEssence: 250,
    },
    draftPoolCopiesByCard: draftPool,
    dreamsignPoolIds,
    mandatoryOnlyPoolSize: 0,
    draftPoolSize: 0,
    doubledCardCount: 0,
    legalSubsetCount: 0,
    preferredSubsetCount: 0,
  };
}

function makeQuestState(overrides: {
  deck?: DeckEntry[];
  dreamsigns?: Dreamsign[];
  remainingDreamsignPool?: string[];
  resolvedPackage?: ResolvedDreamcallerPackage | null;
  essence?: number;
  essenceCap?: number;
  omens?: number;
  completionLevel?: number;
  startingNodeId?: string;
  seed?: string;
} = {}): QuestState {
  return {
    seed: overrides.seed ?? "test-seed",
    essence: overrides.essence ?? 100,
    essenceCap: overrides.essenceCap ?? 500,
    omens: overrides.omens ?? 5,
    maxDreamsigns: 12,
    deck: overrides.deck ?? [],
    dreamcaller: makeDreamcaller(),
    resolvedPackage: overrides.resolvedPackage ?? makeResolvedPackage(),
    cardSourceDebug: null,
    remainingDreamsignPool: overrides.remainingDreamsignPool ?? [],
    dreamsigns: overrides.dreamsigns ?? [],
    completionLevel: overrides.completionLevel ?? 0,
    atlas: {
      nodes: {},
      edges: [],
      startingNodeId: overrides.startingNodeId ?? "node-start",
    },
    currentDreamscape: null,
    visitedSites: [],
    siteRuntime: {},
    draftState: null,
    screen: { type: "dreamscape" },
    activeSiteId: null,
    failureSummary: null,
    hasSeenStartingDeckPopup: true,
    battleModifiers: [],
    shopModifiers: {
      freeRerolls: 0,
      upcomingOmenDiscounts: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: [],
  };
}

function makeSite(id: string): SiteState {
  return { id, type: "DreamJourney", isEnhanced: false, isVisited: false };
}

describe("normalizeRarity", () => {
  // Bug class: drift in the rarity normalization table. Four expected
  // mappings, one per input branch. Any change to the mapping table or
  // misspelling of a branch label produces a different output here.
  it("maps Legendary to Rare, Starter to Starter, undefined/other to Uncommon", () => {
    expect(normalizeRarity("Legendary")).toBe("Rare");
    expect(normalizeRarity("Starter")).toBe("Starter");
    expect(normalizeRarity(undefined)).toBe("Uncommon");
    expect(normalizeRarity("Common")).toBe("Uncommon");
  });
});

describe("journeySeedForSite", () => {
  // Bug class: non-determinism in seed derivation. If the seed is unstable
  // across calls, the manifest is unstable across renders. The site/id and
  // startingNodeId axes are independently required: a constant hash that
  // ignores the site would pass the same-args check but fail the
  // different-site check.
  it("is stable for the same site and quest state", () => {
    const questState = makeQuestState({ startingNodeId: "node-A" });
    const site = makeSite("site-1");

    const first = journeySeedForSite(site, questState);
    const second = journeySeedForSite(site, questState);

    expect(first).toBe(second);
    expect(first).toHaveLength(16);
  });

  it("differs across distinct sites in the same quest", () => {
    const questState = makeQuestState({ startingNodeId: "node-A" });

    expect(journeySeedForSite(makeSite("site-1"), questState)).not.toBe(
      journeySeedForSite(makeSite("site-2"), questState),
    );
  });

  it("differs across distinct starting nodes for the same site id", () => {
    const site = makeSite("site-1");

    expect(
      journeySeedForSite(site, makeQuestState({ startingNodeId: "node-A" })),
    ).not.toBe(
      journeySeedForSite(site, makeQuestState({ startingNodeId: "node-B" })),
    );
  });

  it("differs across distinct quest seeds for the same site and starting node", () => {
    // Bug 2: two fresh games on the same atlas (same startingNodeId, same
    // siteId) must produce different journey seeds so the player does not
    // see the same shape and dream art on every new quest. The per-quest
    // `seed` axis on `QuestState` is the entropy source.
    const site = makeSite("site-1");

    expect(
      journeySeedForSite(
        site,
        makeQuestState({ startingNodeId: "node-A", seed: "quest-seed-1" }),
      ),
    ).not.toBe(
      journeySeedForSite(
        site,
        makeQuestState({ startingNodeId: "node-A", seed: "quest-seed-2" }),
      ),
    );
  });
});

describe("buildJourneyContext bane derivation", () => {
  // Bug class: banes silently disappearing from the projection. The
  // projection must carry every bane-flagged deck entry into
  // `projection.banes`, and the projected deck must still include all five
  // entries (banes are not removed from the deck).
  it("projects bane-flagged deck entries to projection.banes without dropping them from the deck", () => {
    const cards: CardData[] = [
      makeCard({ cardNumber: 1, id: "card-normal-1", name: "Normal One" }),
      makeCard({ cardNumber: 2, id: "card-normal-2", name: "Normal Two" }),
      makeCard({ cardNumber: 3, id: "card-normal-3", name: "Normal Three" }),
      makeCard({ cardNumber: 99, id: "card-bane-a", name: "Bane Alpha" }),
      makeCard({ cardNumber: 100, id: "card-bane-b", name: "Bane Beta" }),
    ];
    const deck: DeckEntry[] = [
      makeDeckEntry({ entryId: "e1", cardNumber: 1 }),
      makeDeckEntry({ entryId: "e2", cardNumber: 2 }),
      makeDeckEntry({ entryId: "e3", cardNumber: 3 }),
      makeDeckEntry({ entryId: "e4", cardNumber: 99, isBane: true }),
      makeDeckEntry({ entryId: "e5", cardNumber: 100, isBane: true }),
    ];

    const content = buildJourneyContentBundle({
      cards,
      dreamcallers: [],
      dreamsignTemplates: [],
    });
    const questState = makeQuestState({ deck });

    const context = buildJourneyContext(questState, content, makeSite("s"));

    expect(context.state.quest.deck.entries).toHaveLength(5);
    expect(context.state.quest.banes).toHaveLength(2);
    expect(context.state.quest.banes.map((b) => b.baneName).sort()).toEqual([
      "Bane Alpha",
      "Bane Beta",
    ]);
  });
});

describe("buildJourneyContext deck projection", () => {
  // Bug class: duplicate-cardNumber rows arriving as separate entries with
  // `copies: 1` each instead of collapsing into a single `{ cardId, copies: N }`
  // row. The summary aggregation depends on this reshape, so a regression
  // here cascades into wrong totalCards / uniqueCards / starterCards.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("collapses duplicate cardNumber rows and aggregates the deck summary", () => {
    const cards: CardData[] = [
      makeCard({ cardNumber: 1, id: "card-1", name: "One" }),
      makeCard({ cardNumber: 2, id: "card-2", name: "Two" }),
      makeCard({
        cardNumber: 3,
        id: "card-3",
        name: "Three",
        rarity: "Starter",
      }),
    ];
    const deck: DeckEntry[] = [
      makeDeckEntry({ entryId: "e1", cardNumber: 1 }),
      makeDeckEntry({ entryId: "e2", cardNumber: 1 }),
      makeDeckEntry({ entryId: "e3", cardNumber: 1 }),
      makeDeckEntry({ entryId: "e4", cardNumber: 2 }),
      makeDeckEntry({ entryId: "e5", cardNumber: 3 }),
    ];
    const content = buildJourneyContentBundle({
      cards,
      dreamcallers: [],
      dreamsignTemplates: [],
    });
    const questState = makeQuestState({ deck });

    const context = buildJourneyContext(questState, content, makeSite("s"));

    expect(context.state.quest.deck.entries).toHaveLength(3);
    const card1Entry = context.state.quest.deck.entries.find(
      (entry) => entry.cardId === "card-1",
    );
    const card2Entry = context.state.quest.deck.entries.find(
      (entry) => entry.cardId === "card-2",
    );
    const card3Entry = context.state.quest.deck.entries.find(
      (entry) => entry.cardId === "card-3",
    );
    expect(card1Entry?.copies).toBe(3);
    expect(card2Entry?.copies).toBe(1);
    expect(card3Entry?.copies).toBe(1);

    expect(context.state.quest.deck.summary.totalCards).toBe(5);
    expect(context.state.quest.deck.summary.uniqueCards).toBe(3);
    expect(context.state.quest.deck.summary.starterCards).toBe(1);
  });

  it("preserves transfiguration state alongside projected deck entry ids", () => {
    const cards: CardData[] = [
      makeCard({ cardNumber: 1, id: "card-1", name: "One" }),
    ];
    const deck: DeckEntry[] = [
      makeDeckEntry({
        entryId: "e1",
        cardNumber: 1,
        transfiguration: "Empowered",
      }),
      makeDeckEntry({ entryId: "e2", cardNumber: 1, transfiguration: null }),
    ];
    const content = buildJourneyContentBundle({
      cards,
      dreamcallers: [],
      dreamsignTemplates: [],
    });
    const questState = makeQuestState({ deck });

    const context = buildJourneyContext(questState, content, makeSite("s"));

    expect(context.state.quest.deck.entries).toEqual([
      {
        cardId: "card-1",
        copies: 2,
        entryIds: ["e1", "e2"],
        entryTransfigurations: ["Empowered", null],
      },
    ]);
  });

  it("projects fast keyword modifications as entry-specific journey cards", () => {
    const cards: CardData[] = [
      makeCard({ cardNumber: 1, id: "card-1", name: "One", isFast: false }),
    ];
    const deck: DeckEntry[] = [
      makeDeckEntry({
        entryId: "e1",
        cardNumber: 1,
        keywordModification: { fast: true },
      }),
      makeDeckEntry({ entryId: "e2", cardNumber: 1 }),
    ];
    const content = buildJourneyContentBundle({
      cards,
      dreamcallers: [],
      dreamsignTemplates: [],
    });
    const questState = makeQuestState({ deck });

    const context = buildJourneyContext(questState, content, makeSite("s"));
    const modifiedCard = context.content.cards.find(
      (card) => card.id === "card-1::deck-entry:e1:card-modification",
    );

    expect(modifiedCard?.raw["is-fast"]).toBe(true);
    expect(context.state.quest.deck.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cardId: "card-1::deck-entry:e1:card-modification",
          copies: 1,
          entryIds: ["e1"],
        }),
        expect.objectContaining({
          cardId: "card-1",
          copies: 1,
          entryIds: ["e2"],
        }),
      ]),
    );
  });

  it("warns and skips deck entries whose cardNumber is not in the content bundle", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const cards: CardData[] = [
      makeCard({ cardNumber: 1, id: "card-1", name: "One" }),
    ];
    const deck: DeckEntry[] = [
      makeDeckEntry({ entryId: "e1", cardNumber: 1 }),
      makeDeckEntry({ entryId: "e-orphan", cardNumber: 999 }),
    ];
    const content = buildJourneyContentBundle({
      cards,
      dreamcallers: [],
      dreamsignTemplates: [],
    });
    const questState = makeQuestState({ deck });

    const context = buildJourneyContext(questState, content, makeSite("s"));

    expect(context.state.quest.deck.entries).toHaveLength(1);
    expect(context.state.quest.deck.entries[0]?.cardId).toBe("card-1");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("999"));
  });
});

describe("buildJourneyContext projections", () => {
  it("projects resources, dreamsigns, and dreamsign pool from quest state", () => {
    const dreamsigns: Dreamsign[] = [
      { id: "ds-1", name: "DS One", effectDescription: "", isBane: false },
      { name: "DS Anon", effectDescription: "", isBane: false },
    ];
    const questState = makeQuestState({
      essence: 123,
      essenceCap: 400,
      omens: 7,
      completionLevel: 2,
      dreamsigns,
      remainingDreamsignPool: ["ds-pool-1", "ds-pool-2"],
    });
    const content = buildJourneyContentBundle({
      cards: [],
      dreamcallers: [],
      dreamsignTemplates: [],
    });

    const context = buildJourneyContext(questState, content, makeSite("s"));

    expect(context.state.quest.resources).toEqual({
      essence: 123,
      maxEssence: 400,
      omens: 7,
      dreamscape: 2,
    });
    expect(context.state.quest.activeDreamsigns).toEqual([
      { dreamsignId: "ds-1" },
      { dreamsignId: "DS Anon" },
    ]);
    expect(context.state.quest.dreamsignPoolIds).toEqual([
      "ds-pool-1",
      "ds-pool-2",
    ]);
  });

  it("projects draft pool from resolvedPackage.draftPoolCopiesByCard", () => {
    const resolved = makeResolvedPackage({ "card-a": 2, "card-b": 1 });
    const questState = makeQuestState({ resolvedPackage: resolved });
    const content = buildJourneyContentBundle({
      cards: [],
      dreamcallers: [],
      dreamsignTemplates: [],
    });

    const context = buildJourneyContext(questState, content, makeSite("s"));

    expect(context.state.quest.draftPool).toHaveLength(2);
    expect(
      context.state.quest.draftPool.find((entry) => entry.cardId === "card-a")
        ?.copies,
    ).toBe(2);
    expect(
      context.state.quest.draftPool.find((entry) => entry.cardId === "card-b")
        ?.copies,
    ).toBe(1);
  });

  it("computes a contentVersion that changes when content changes", () => {
    const cards: CardData[] = [makeCard({ cardNumber: 1 })];
    const dreamcallers: DreamcallerContent[] = [
      {
        id: "dc-x",
        name: "DC X",
        title: "T",
        renderedText: "",
        imageNumber: "1",
        startingEssence: 250,
      },
    ];
    const bundleA = buildJourneyContentBundle({
      cards,
      dreamcallers,
      dreamsignTemplates: [],
    });
    const bundleB = buildJourneyContentBundle({
      cards: [...cards, makeCard({ cardNumber: 2 })],
      dreamcallers,
      dreamsignTemplates: [],
    });
    const questState = makeQuestState();
    const site = makeSite("s");

    const versionA = buildJourneyContext(questState, bundleA, site).contentVersion;
    const versionB = buildJourneyContext(questState, bundleB, site).contentVersion;

    expect(versionA).not.toBe(versionB);
    // Stable across calls with the same inputs.
    expect(buildJourneyContext(questState, bundleA, site).contentVersion).toBe(
      versionA,
    );
  });
});

describe("cardDataToCardContent and dreamcallerContentToJourneyDreamcaller", () => {
  it("maps required fields and preserves CardData in raw for downstream helpers", () => {
    const card = makeCard({
      cardNumber: 42,
      id: "card-42",
      name: "Forty-Two",
      energyCost: 3,
      spark: 2,
      rarity: "Legendary",
      isFast: true,
      renderedText: "Some text.",
    });

    const projected = cardDataToCardContent(card);

    expect(projected.id).toBe("card-42");
    expect(projected.name).toBe("Forty-Two");
    expect(projected.cardNumber).toBe(42);
    expect(projected.cardType).toBe("Character");
    expect(projected.energyCost).toBe(3);
    expect(projected.spark).toBe(2);
    expect(projected.rarity).toBe("Rare");
    // `raw` is consumed by predicate helpers like `cardHasResonantTrigger`,
    // which read `rendered-text`, `is-fast`, and `subtype`.
    expect(projected.raw["rendered-text"]).toBe("Some text.");
    expect(projected.raw["is-fast"]).toBe(true);
  });

  it("maps DreamcallerContent to a journey Dreamcaller with awakening default", () => {
    const source: DreamcallerContent = {
      id: "dc-q",
      name: "DC Q",
      title: "Title Q",
      renderedText: "",
      imageNumber: "9",
      startingEssence: 250,
    };

    const projected = dreamcallerContentToJourneyDreamcaller(source);

    expect(projected.id).toBe("dc-q");
    expect(projected.name).toBe("DC Q");
    expect(projected.title).toBe("Title Q");
    expect(projected.awakening).toBe("0");
  });
});
