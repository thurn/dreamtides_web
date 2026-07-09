import { afterEach, describe, expect, it } from "vitest";

import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import type { DeckEntry, Dreamsign, QuestState } from "../../types/quest";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import {
  registerDeckContentProvider,
  type DeckContentProvider,
} from "./deck";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS: Genesis = {
  seed: "deck-seed",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null, journeyVariant: "v2" },
};

function ctx(overrides: Partial<EventContext> = {}): EventContext {
  return {
    seq: 42,
    rng: () => 0,
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

function makeEntry(overrides: Partial<DeckEntry> & { entryId: string }): DeckEntry {
  return {
    cardNumber: 1,
    transfiguration: null,
    isBane: false,
    ...overrides,
  };
}

function stateWith(overrides: Partial<QuestState>): FoldState {
  const base = genesisFoldState(GENESIS);
  return { ...base, quest: { ...base.quest, ...overrides } };
}

/** A deck with two normal cards and three banes, entry ids deck-1..deck-5. */
function stateWithDeck(): FoldState {
  return stateWith({
    deck: [
      makeEntry({ entryId: "deck-1", cardNumber: 10 }),
      makeEntry({ entryId: "deck-2", cardNumber: 20 }),
      makeEntry({ entryId: "deck-3", cardNumber: 30, isBane: true }),
      makeEntry({ entryId: "deck-4", cardNumber: 40, isBane: true }),
      makeEntry({ entryId: "deck-5", cardNumber: 50, isBane: true }),
    ],
  });
}

function dreamsign(id: string, isBane = false): Dreamsign {
  return { id, name: "n", effectDescription: "e", isBane };
}

/** A deterministic PRNG bound to a seed so a purge draw is reproducible. */
function makeRng(seed: number): (drawIndex: number) => number {
  return (drawIndex: number) => {
    let x = (seed + drawIndex * 2654435761) >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

afterEach(() => {
  registerDeckContentProvider(null);
});

// ---------------------------------------------------------------------------
// Entry-id collision (DUPLICATE_DECK_ENTRY)
// ---------------------------------------------------------------------------

describe("DUPLICATE_DECK_ENTRY", () => {
  it("mints a fresh unique id distinct from every existing entry id", () => {
    const state = stateWithDeck();
    const out = reduce(state, "DUPLICATE_DECK_ENTRY", { entryId: "deck-2" });
    expect(out.outcome).toBe("applied");
    const deck = out.state.quest.deck;
    expect(deck).toHaveLength(6);
    const newEntry = deck[deck.length - 1];
    // Copy carries the source card, fresh id.
    expect(newEntry.cardNumber).toBe(20);
    const existingIds = state.quest.deck.map((e) => e.entryId);
    expect(existingIds).not.toContain(newEntry.entryId);
    // Id unique within the resulting deck.
    expect(new Set(deck.map((e) => e.entryId)).size).toBe(deck.length);
  });

  it("is deterministic: same seed+seq folds the same new id", () => {
    const a = reduce(stateWithDeck(), "DUPLICATE_DECK_ENTRY", {
      entryId: "deck-1",
    });
    const b = reduce(stateWithDeck(), "DUPLICATE_DECK_ENTRY", {
      entryId: "deck-1",
    });
    const deckA = a.state.quest.deck;
    const deckB = b.state.quest.deck;
    const idA = deckA[deckA.length - 1].entryId;
    const idB = deckB[deckB.length - 1].entryId;
    expect(idA).toBe(idB);
  });

  it("bounces a missing entry id and leaves state untouched by reference", () => {
    const state = stateWithDeck();
    const out = reduce(state, "DUPLICATE_DECK_ENTRY", { entryId: "nope" });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// Stale-target bounce (REMOVE / TRANSFIGURE / SET_DECK_ENTRY_*)
// ---------------------------------------------------------------------------

describe("stale-target bounce", () => {
  it("REMOVE_DECK_ENTRY bounces a missing target", () => {
    const state = stateWithDeck();
    const out = reduce(state, "REMOVE_DECK_ENTRY", { entryId: "ghost" });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });

  it("REMOVE_DECK_ENTRY removes a present target", () => {
    const state = stateWithDeck();
    const out = reduce(state, "REMOVE_DECK_ENTRY", { entryId: "deck-2" });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.deck.map((e) => e.entryId)).not.toContain("deck-2");
    expect(out.state.quest.deck).toHaveLength(4);
  });

  it("TRANSFIGURE_CARD bounces a missing target", () => {
    const state = stateWithDeck();
    const out = reduce(state, "TRANSFIGURE_CARD", {
      entryId: "ghost",
      transfiguration: "Empowered",
    });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });

  it("TRANSFIGURE_CARD applies to a present target", () => {
    const state = stateWithDeck();
    const out = reduce(state, "TRANSFIGURE_CARD", {
      entryId: "deck-1",
      transfiguration: "Empowered",
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.deck[0].transfiguration).toBe("Empowered");
  });

  it("SET_DECK_ENTRY_STAT_OVERRIDE bounces a missing target", () => {
    const state = stateWithDeck();
    const out = reduce(state, "SET_DECK_ENTRY_STAT_OVERRIDE", {
      entryId: "ghost",
      override: { spark: 3 },
    });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });

  it("SET_DECK_ENTRY_KEYWORDS bounces a missing target", () => {
    const state = stateWithDeck();
    const out = reduce(state, "SET_DECK_ENTRY_KEYWORDS", {
      entryId: "ghost",
      keywords: { fast: true },
    });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });

  it("SET_DECK_ENTRY_TYPE bounces a missing target", () => {
    const state = stateWithDeck();
    const out = reduce(state, "SET_DECK_ENTRY_TYPE", {
      entryId: "ghost",
      typeChange: null,
    });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// SET_DECK_ENTRY_* apply paths
// ---------------------------------------------------------------------------

describe("SET_DECK_ENTRY_* apply", () => {
  it("SET_DECK_ENTRY_STAT_OVERRIDE sets then drops the override on null", () => {
    const set = reduce(stateWithDeck(), "SET_DECK_ENTRY_STAT_OVERRIDE", {
      entryId: "deck-1",
      override: { spark: 4 },
    });
    expect(set.outcome).toBe("applied");
    expect(set.state.quest.deck[0].statOverride).toEqual({ spark: 4 });
    const drop = reduce(set.state, "SET_DECK_ENTRY_STAT_OVERRIDE", {
      entryId: "deck-1",
      override: null,
    });
    expect(drop.outcome).toBe("applied");
    expect(drop.state.quest.deck[0].statOverride).toBeUndefined();
  });

  it("SET_DECK_ENTRY_KEYWORDS sets the keyword modification", () => {
    const out = reduce(stateWithDeck(), "SET_DECK_ENTRY_KEYWORDS", {
      entryId: "deck-1",
      keywords: { fast: true, reclaim: 2 },
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.deck[0].keywordModification).toEqual({
      fast: true,
      reclaim: 2,
    });
  });

  it("SET_DECK_ENTRY_TYPE sets then drops the type change", () => {
    const typeChange = {
      predicateId: "p1",
      cardType: "Event",
      subtype: "sub",
      label: "L",
    };
    const set = reduce(stateWithDeck(), "SET_DECK_ENTRY_TYPE", {
      entryId: "deck-1",
      typeChange,
    });
    expect(set.outcome).toBe("applied");
    expect(set.state.quest.deck[0].typeChange).toEqual(typeChange);
    const drop = reduce(set.state, "SET_DECK_ENTRY_TYPE", {
      entryId: "deck-1",
      typeChange: null,
    });
    expect(drop.outcome).toBe("applied");
    expect(drop.state.quest.deck[0].typeChange).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Purge determinism / bane purges
// ---------------------------------------------------------------------------

describe("bane purges", () => {
  it("PURGE_ALL_BANE_CARDS removes every bane and keeps the rest", () => {
    const out = reduce(stateWithDeck(), "PURGE_ALL_BANE_CARDS", {});
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.deck.map((e) => e.entryId)).toEqual([
      "deck-1",
      "deck-2",
    ]);
  });

  it("PURGE_ALL_BANE_CARDS bounces when there are no banes", () => {
    const state = stateWith({
      deck: [makeEntry({ entryId: "deck-1" })],
    });
    const out = reduce(state, "PURGE_ALL_BANE_CARDS", {});
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });

  it("PURGE_RANDOM_BANE_CARDS removes the same entries for the same seed+seq", () => {
    const context = ctx({ seq: 7, rng: makeRng(7) });
    const a = reduce(stateWithDeck(), "PURGE_RANDOM_BANE_CARDS", { count: 2 }, context);
    const b = reduce(stateWithDeck(), "PURGE_RANDOM_BANE_CARDS", { count: 2 }, ctx({ seq: 7, rng: makeRng(7) }));
    expect(a.outcome).toBe("applied");
    const remainingA = a.state.quest.deck.map((e) => e.entryId).sort();
    const remainingB = b.state.quest.deck.map((e) => e.entryId).sort();
    expect(remainingA).toEqual(remainingB);
    // Removed exactly two banes; the two non-banes survive.
    expect(a.state.quest.deck).toHaveLength(3);
    expect(remainingA).toContain("deck-1");
    expect(remainingA).toContain("deck-2");
  });

  it("PURGE_RANDOM_BANE_CARDS bounces with no banes or a non-positive count", () => {
    const noBanes = stateWith({ deck: [makeEntry({ entryId: "deck-1" })] });
    expect(
      reduce(noBanes, "PURGE_RANDOM_BANE_CARDS", { count: 3 }).outcome,
    ).toBe("bounced");
    expect(
      reduce(stateWithDeck(), "PURGE_RANDOM_BANE_CARDS", { count: 0 }).outcome,
    ).toBe("bounced");
  });
});

// ---------------------------------------------------------------------------
// PURGE_DECK_CARDS
// ---------------------------------------------------------------------------

describe("PURGE_DECK_CARDS", () => {
  it("removes the listed entries", () => {
    const out = reduce(stateWithDeck(), "PURGE_DECK_CARDS", {
      entryIds: ["deck-1", "deck-3"],
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.deck.map((e) => e.entryId)).toEqual([
      "deck-2",
      "deck-4",
      "deck-5",
    ]);
  });

  it("bounces when no listed entry is present", () => {
    const state = stateWithDeck();
    const out = reduce(state, "PURGE_DECK_CARDS", { entryIds: ["ghost"] });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// ADD_CARD (content-provider resolution + id minting)
// ---------------------------------------------------------------------------

describe("ADD_CARD", () => {
  const provider: DeckContentProvider = {
    resolveCardNumber: (cardId) => (cardId === "known" ? 99 : null),
    resolveDreamsign: () => null,
  };

  it("bounces when no content provider is registered", () => {
    const state = stateWithDeck();
    const out = reduce(state, "ADD_CARD", { cardId: "known" });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });

  it("appends a resolved card with a fresh unique deterministic id", () => {
    registerDeckContentProvider(provider);
    const a = reduce(stateWithDeck(), "ADD_CARD", { cardId: "known" });
    expect(a.outcome).toBe("applied");
    const deckA = a.state.quest.deck;
    const added = deckA[deckA.length - 1];
    expect(added.cardNumber).toBe(99);
    expect(added.isBane).toBe(false);
    expect(stateWithDeck().quest.deck.map((e) => e.entryId)).not.toContain(
      added.entryId,
    );
    const b = reduce(stateWithDeck(), "ADD_CARD", { cardId: "known" });
    const deckB = b.state.quest.deck;
    expect(deckB[deckB.length - 1].entryId).toBe(added.entryId);
  });

  it("honors isBane and transfiguration options", () => {
    registerDeckContentProvider(provider);
    const out = reduce(stateWithDeck(), "ADD_CARD", {
      cardId: "known",
      isBane: true,
      transfiguration: "Kindled",
    });
    expect(out.outcome).toBe("applied");
    const deckOut = out.state.quest.deck;
    const added = deckOut[deckOut.length - 1];
    expect(added.isBane).toBe(true);
    expect(added.transfiguration).toBe("Kindled");
  });

  it("bounces an unknown card id", () => {
    registerDeckContentProvider(provider);
    const state = stateWithDeck();
    const out = reduce(state, "ADD_CARD", { cardId: "mystery" });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// Dreamsigns
// ---------------------------------------------------------------------------

describe("dreamsigns", () => {
  const provider: DeckContentProvider = {
    resolveCardNumber: () => null,
    resolveDreamsign: (id) => (id === "ds-new" ? dreamsign("ds-new") : null),
  };

  it("ADD_DREAMSIGN bounces at the maxDreamsigns limit", () => {
    registerDeckContentProvider(provider);
    const state = stateWith({
      maxDreamsigns: 2,
      dreamsigns: [dreamsign("ds-1"), dreamsign("ds-2")],
    });
    const out = reduce(state, "ADD_DREAMSIGN", { dreamsignId: "ds-new" });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });

  it("ADD_DREAMSIGN appends a resolved dreamsign below the limit", () => {
    registerDeckContentProvider(provider);
    const state = stateWith({
      maxDreamsigns: 3,
      dreamsigns: [dreamsign("ds-1")],
    });
    const out = reduce(state, "ADD_DREAMSIGN", { dreamsignId: "ds-new" });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.dreamsigns.map((d) => d.id)).toEqual([
      "ds-1",
      "ds-new",
    ]);
  });

  it("REMOVE_DREAMSIGN bounces a missing id", () => {
    const state = stateWith({ dreamsigns: [dreamsign("ds-1")] });
    const out = reduce(state, "REMOVE_DREAMSIGN", { dreamsignId: "ghost" });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });

  it("REMOVE_DREAMSIGN removes a present id", () => {
    const state = stateWith({
      dreamsigns: [dreamsign("ds-1"), dreamsign("ds-2")],
    });
    const out = reduce(state, "REMOVE_DREAMSIGN", { dreamsignId: "ds-1" });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.dreamsigns.map((d) => d.id)).toEqual(["ds-2"]);
  });

  it("SET_DREAMSIGN_POOL replaces the remaining pool", () => {
    const out = reduce(stateWith({}), "SET_DREAMSIGN_POOL", {
      ids: ["a", "b", "c"],
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.remainingDreamsignPool).toEqual(["a", "b", "c"]);
  });

  it("SET_DREAMSIGN_IS_BANE flips the flag on a matching id", () => {
    const state = stateWith({ dreamsigns: [dreamsign("ds-1", false)] });
    const out = reduce(state, "SET_DREAMSIGN_IS_BANE", {
      dreamsignId: "ds-1",
      isBane: true,
    });
    expect(out.outcome).toBe("applied");
    expect(out.state.quest.dreamsigns[0].isBane).toBe(true);
  });

  it("SET_DREAMSIGN_IS_BANE bounces a missing id", () => {
    const state = stateWith({ dreamsigns: [dreamsign("ds-1")] });
    const out = reduce(state, "SET_DREAMSIGN_IS_BANE", {
      dreamsignId: "ghost",
      isBane: true,
    });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// Deferred site-coupled cases (Task 14)
// ---------------------------------------------------------------------------

describe("site-coupled acceptance (deferred to Task 14)", () => {
  it("ACCEPT_TRANSFIGURATION_CHOICE bounces (does not half-apply)", () => {
    const state = stateWithDeck();
    const out = reduce(state, "ACCEPT_TRANSFIGURATION_CHOICE", {
      siteId: "s1",
      entryId: "deck-1",
    });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });

  it("ACCEPT_DUPLICATION_CHOICE bounces (does not half-apply)", () => {
    const state = stateWithDeck();
    const out = reduce(state, "ACCEPT_DUPLICATION_CHOICE", {
      siteId: "s1",
      entryId: "deck-1",
    });
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(state);
  });
});
