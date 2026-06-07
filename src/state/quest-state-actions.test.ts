import { beforeEach, describe, expect, it, vi } from "vitest";
import { STARTER_CARD_NUMBERS } from "../data/starter-cards";
import type { CardData } from "../types/cards";
import type { DreamcallerContent } from "../types/content";
import type { QuestContent } from "../data/quest-content";
import {
  buildTestCorpusCards,
  makeTestPoolContext,
} from "../__test-helpers__/pool-context";
import type { DreamAtlas, QuestState } from "../types/quest";
import type { PoolDraftState, ReplayDraftState } from "../types/draft";
import type { DraftRecord } from "../data/cards-v2-database";
import { buildFitModel, type FitModel } from "../draft/replay/fit-model";
import { toQuestDreamcaller } from "../data/dreamcaller-selection";
import { createDefaultState } from "./quest-context";
import {
  addCardToQuestState,
  changeQuestEssence,
  commitPreparedDraftCardPickInQuestState,
  completeQuestSite,
  nextDeckEntryId,
  pickDraftCardInQuestState,
  prepareDraftCardPickInQuestState,
  setQuestScreen,
  startQuestFromDreamcaller,
  updateQuestAtlas,
} from "./quest-state-actions";

function makeCard(
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return {
    name: `Card ${String(cardNumber)}`,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType: "Event",
    subtype: "Test",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Test card.",
    imageNumber: cardNumber,
    artOwned: true,
    ...overrides,
  };
}

function makeDreamcaller(): DreamcallerContent {
  return {
    id: "dreamcaller-1",
    name: "Test Dreamcaller",
    title: "State Witness",
    renderedText: "Test ability.",
    imageNumber: "0006",
    startingEssence: 275,
    signatureCards: ["Alpha Card 1"],
  };
}

function makeQuestContent(
  dreamcaller: DreamcallerContent = makeDreamcaller(),
): QuestContent {
  const starterCards = STARTER_CARD_NUMBERS.map((cardNumber) =>
    makeCard(cardNumber, { isStarter: true }),
  );
  const corpusCards = buildTestCorpusCards();
  const cardDatabase = new Map<number, CardData>(
    [...starterCards, ...corpusCards].map((card) => [card.cardNumber, card]),
  );

  return {
    cardDatabase,
    dreamcallers: [dreamcaller],
    dreamsignTemplates: [],
    poolContext: makeTestPoolContext(["dreamsign-a", "dreamsign-b"]),
  };
}

function makeAtlas(): DreamAtlas {
  return {
    startingNodeId: "dreamscape-1",
    edges: [],
    nodes: {
      "dreamscape-1": {
        id: "dreamscape-1",
        biomeName: "Test Biome",
        biomeColor: "#22c55e",
        sites: [
          {
            id: "site-1",
            type: "Draft",
            isEnhanced: false,
            isVisited: false,
          },
          {
            id: "site-2",
            type: "Battle",
            isEnhanced: false,
            isVisited: false,
          },
        ],
        position: { x: 200, y: 0 },
        status: "available",
        enhancedSiteType: null,
      },
    },
  };
}

/**
 * A deterministic deck-fit corpus for replay tests. Forty cards `C1..C40`
 * (numbers 1..40). Card `C1` strongly co-occurs with `C2` and `C3` with `C4`
 * across a 20-deck corpus, so a deck containing `C1` ranks `C2` ahead of `C4`
 * and vice-versa — giving the next-offer ranking an unambiguous, deck-dependent
 * answer with no RNG. Mirrors the design verified for the fit model.
 */
const REPLAY_NAME_INDEX: Map<string, number> = (() => {
  const index = new Map<string, number>();
  for (let i = 1; i <= 40; i += 1) {
    index.set(`C${String(i)}`, i);
  }
  return index;
})();

function buildReplayCorpus(): string[][] {
  const decks: string[][] = [];
  for (let d = 0; d < 20; d += 1) {
    const deck: string[] = d < 10 ? ["C1", "C2"] : ["C3", "C4"];
    let filler = 5 + (d % 5);
    while (deck.length < 16) {
      const name = `C${String(filler)}`;
      if (!deck.includes(name)) {
        deck.push(name);
      }
      filler += 1;
      if (filler > 40) {
        filler = 5;
      }
    }
    decks.push(deck);
  }
  return decks;
}

function makeReplayFitModel(): FitModel {
  return buildFitModel(buildReplayCorpus(), REPLAY_NAME_INDEX);
}

/** Card database covering the replay corpus cards (numbers 1..40). */
function makeReplayCardDatabase(): Map<number, CardData> {
  const cards = new Map<number, CardData>();
  for (const cardNumber of REPLAY_NAME_INDEX.values()) {
    cards.set(cardNumber, makeCard(cardNumber, { name: `C${String(cardNumber)}` }));
  }
  return cards;
}

/**
 * A replay draft state already entered at `site-1` and showing `currentOffer`.
 * `packSequence[0]` (pick 1) is the four-card offer the player picks from;
 * `packSequence[1]` (pick 2) is a five-card pack the engine must rank against
 * the post-pick deck.
 */
function makeReplayDraftState(): ReplayDraftState {
  return {
    mode: "replay",
    recordId: "test-record",
    // pick 1 offer = whole 4-card pack; pick 2 = 5-card pack to rank.
    packSequence: [
      [1, 3, 30, 31],
      [2, 4, 30, 31, 32],
    ],
    signatureCardNumbers: [],
    currentOffer: [1, 3, 30, 31],
    activeSiteId: "site-1",
    pickNumber: 1,
    sitePicksCompleted: 0,
  };
}

/** Minimal replay record fixture: a single record so selection is index 0. */
function makeReplayRecord(): DraftRecord {
  const corpus = buildReplayCorpus();
  return {
    id: "record-0",
    draftId: "draft-0",
    sourceFile: "draft-0-records.json",
    mainboard: corpus[0],
    // 30 packs, each a 4-card pack of real corpus cards.
    packs: Array.from({ length: 30 }, (_, i) => {
      const base = (i % 9) + 5; // rotate through filler cards C5..C13
      return [
        `C${String(base)}`,
        `C${String(base + 1)}`,
        `C${String(base + 2)}`,
        `C${String(base + 3)}`,
      ];
    }),
    picks: Array.from({ length: 30 }, () => []),
  };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("quest state actions", () => {
  it("derives the next deck entry id from the high-water deck id", () => {
    expect(
      nextDeckEntryId([
        {
          entryId: "deck-2",
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: "starter-99",
          cardNumber: 202,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: "deck-15",
          cardNumber: 303,
          transfiguration: null,
          isBane: true,
        },
      ]),
    ).toBe("deck-16");
  });

  it("changes quest essence without replacing the deck", () => {
    const prev = createDefaultState();
    const next = changeQuestEssence(prev, 25);

    expect(next.essence).toBe(275);
    expect(prev.essence).toBe(250);
    expect(next.deck).toBe(prev.deck);
  });

  it("adds a card with the next stable deck id", () => {
    const prev: QuestState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "deck-7",
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
      ],
    };

    const next = addCardToQuestState(prev, 202, false);

    expect(next.deck).toEqual([
      prev.deck[0],
      {
        entryId: "deck-8",
        cardNumber: 202,
        transfiguration: null,
        isBane: false,
      },
    ]);
  });

  it("picks a draft card in one state transition", () => {
    const cardDatabase = new Map<number, CardData>(
      [101, 102, 103, 104, 201, 202, 203, 204].map((cardNumber) => [
        cardNumber,
        makeCard(cardNumber),
      ]),
    );
    const prev: QuestState = {
      ...createDefaultState(),
      draftState: {
        mode: "pool",
        draftPoolCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        remainingCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        currentOffer: [101, 102, 103, 104],
        activeSiteId: "site-1",
        pickNumber: 1,
        sitePicksCompleted: 0,
      },
    };

    const next = pickDraftCardInQuestState({
      prev,
      siteId: "site-1",
      cardNumber: 101,
      cardDatabase,
    });

    expect(next.deck).toEqual([
      {
        entryId: "deck-1",
        cardNumber: 101,
        transfiguration: null,
        isBane: false,
      },
    ]);
    expect(next.draftState?.pickNumber).toBe(2);
    expect(next.draftState?.sitePicksCompleted).toBe(1);
    expect(next.draftState?.currentOffer).not.toEqual([101, 102, 103, 104]);
    expect(next.draftState?.currentOffer).toHaveLength(4);
    expect(prev.draftState?.pickNumber).toBe(1);
    expect(prev.deck).toEqual([]);
    expect(console.log).not.toHaveBeenCalled();
  });

  it("commits only a prepared draft pick that matches the expected offer", () => {
    const cardDatabase = new Map<number, CardData>(
      [101, 102, 103, 104, 201, 202, 203, 204].map((cardNumber) => [
        cardNumber,
        makeCard(cardNumber),
      ]),
    );
    const prev: QuestState = {
      ...createDefaultState(),
      draftState: {
        mode: "pool",
        draftPoolCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        remainingCopiesByCard: {
          "201": 1,
          "202": 1,
          "203": 1,
          "204": 1,
        },
        currentOffer: [101, 102, 103, 104],
        activeSiteId: "site-1",
        pickNumber: 1,
        sitePicksCompleted: 0,
      },
    };
    const prepared = prepareDraftCardPickInQuestState({
      prev,
      siteId: "site-1",
      cardNumber: 101,
      cardDatabase,
    });
    const stale: QuestState = {
      ...prev,
      draftState: {
        ...prev.draftState!,
        currentOffer: [102, 103, 104, 201],
      },
    };

    expect(
      commitPreparedDraftCardPickInQuestState({ prev, prepared })?.deck,
    ).toEqual(prepared.next.deck);
    expect(
      commitPreparedDraftCardPickInQuestState({ prev: stale, prepared }),
    ).toBeNull();
    expect(console.log).not.toHaveBeenCalled();
  });

  it("starts a quest from a Dreamcaller in one state transition", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const dreamcaller = makeDreamcaller();
    const questContent = makeQuestContent(dreamcaller);
    const prev = createDefaultState();

    const next = startQuestFromDreamcaller({
      prev,
      dreamcaller,
      questContent,
      seedOverride: "quest-seed-1",
    });
    const firstAvailableNode = Object.values(next.atlas.nodes).find(
      (node) => node.status === "available",
    );

    expect(next.dreamcaller).toEqual(toQuestDreamcaller(dreamcaller));
    expect(next.dreamcaller?.startingEssence).toBe(275);
    expect(next.essence).toBe(dreamcaller.startingEssence);
    expect(prev.essence).toBe(250);
    // The package is built from the run pool context at quest start; assert a
    // non-empty draft pool was produced rather than checking exact card numbers.
    expect(next.resolvedPackage).not.toBeNull();
    expect(next.resolvedPackage?.draftPoolSize).toBeGreaterThan(0);
    expect(Object.keys(next.resolvedPackage?.draftPoolCopiesByCard ?? {}).length)
      .toBeGreaterThan(0);
    // The state seed matches the seed the pool was built from.
    expect(next.seed).toBe("quest-seed-1");
    expect(next.remainingDreamsignPool).toEqual(
      next.resolvedPackage?.dreamsignPoolIds,
    );
    expect(next.remainingDreamsignPool).not.toBe(
      next.resolvedPackage?.dreamsignPoolIds,
    );
    expect(next.deck.map((entry) => entry.cardNumber)).toEqual(
      STARTER_CARD_NUMBERS,
    );
    expect(next.deck.map((entry) => entry.entryId)).toEqual(
      STARTER_CARD_NUMBERS.map((_, index) => `deck-${String(index + 1)}`),
    );
    const nextPoolState = next.draftState as PoolDraftState | null;
    expect(nextPoolState?.draftPoolCopiesByCard).toEqual(
      next.resolvedPackage?.draftPoolCopiesByCard,
    );
    expect(nextPoolState?.remainingCopiesByCard).toEqual(
      next.resolvedPackage?.draftPoolCopiesByCard,
    );
    expect(next.draftState?.currentOffer).toEqual([]);
    expect(next.draftState?.pickNumber).toBe(1);
    expect(next.draftState?.sitePicksCompleted).toBe(0);
    expect(firstAvailableNode).toBeDefined();
    expect(next.currentDreamscape).toBe(firstAvailableNode?.id);
    expect(next.visitedSites).toEqual([]);
    expect(next.screen).toEqual({ type: "dreamscape" });
    expect(next.activeSiteId).toBeNull();
    // The starter-deck reveal popup is gated entirely by the
    // `hasSeenStartingDeckPopup` flag. A fresh quest start leaves the flag
    // at the default `false` so the popup opens once when the dreamcaller
    // is first picked.
    expect(next.hasSeenStartingDeckPopup).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("sets the quest screen and active site together", () => {
    const prev = createDefaultState();
    const siteScreen = setQuestScreen(prev, { type: "site", siteId: "site-1" });
    const atlasScreen = setQuestScreen(siteScreen, { type: "atlas" });

    expect(siteScreen.screen).toEqual({ type: "site", siteId: "site-1" });
    expect(siteScreen.activeSiteId).toBe("site-1");
    expect(atlasScreen.screen).toEqual({ type: "atlas" });
    expect(atlasScreen.activeSiteId).toBeNull();
  });

  it("updates the quest atlas by reference", () => {
    const prev = createDefaultState();
    const atlas = makeAtlas();
    const next = updateQuestAtlas(prev, atlas);

    expect(next.atlas).toBe(atlas);
    expect(prev.atlas).toEqual({ nodes: {}, edges: [], startingNodeId: "" });
  });

  it("completes a site while preserving unrelated site runtime", () => {
    const runtime = {
      kind: "essence" as const,
      amount: 25,
      accepted: false,
    };
    const prev: QuestState = {
      ...createDefaultState(),
      atlas: makeAtlas(),
      siteRuntime: {
        "site-2": runtime,
      },
    };

    const next = completeQuestSite(prev, "site-1");

    expect(next.visitedSites).toEqual(["site-1"]);
    expect(next.atlas.nodes["dreamscape-1"].sites[0]).toEqual({
      id: "site-1",
      type: "Draft",
      isEnhanced: false,
      isVisited: true,
    });
    expect(next.siteRuntime["site-2"]).toBe(runtime);
  });
});

describe("quest state actions (replay draft)", () => {
  it("starts a replay quest with a replay draft state", () => {
    const dreamcaller = makeDreamcaller();
    const questContent: QuestContent = {
      ...makeQuestContent(dreamcaller),
      draftMode: "replay",
      draftRecords: [makeReplayRecord()],
      fitModel: makeReplayFitModel(),
    };
    const prev = createDefaultState();

    const next = startQuestFromDreamcaller({
      prev,
      dreamcaller,
      questContent,
      seedOverride: "replay-seed-1",
    });

    expect(next.draftState?.mode).toBe("replay");
    const replayState = next.draftState as ReplayDraftState;
    expect(replayState.recordId).toBe("record-0");
    expect(replayState.packSequence.length).toBe(30);
    expect(replayState.currentOffer).toEqual([]);
    expect(replayState.pickNumber).toBe(1);
    // The resolved package is still built normally in replay mode so shops,
    // signatures, and the dreamsign pool keep working.
    expect(next.resolvedPackage).not.toBeNull();
    expect(next.resolvedPackage?.draftPoolSize).toBeGreaterThan(0);
    expect(next.remainingDreamsignPool).toEqual(
      next.resolvedPackage?.dreamsignPoolIds,
    );
  });

  it("falls back to a pool draft state when no records are present", () => {
    const dreamcaller = makeDreamcaller();
    const questContent: QuestContent = {
      ...makeQuestContent(dreamcaller),
      draftMode: "replay",
      draftRecords: [],
      fitModel: undefined,
    };
    const prev = createDefaultState();

    const next = startQuestFromDreamcaller({
      prev,
      dreamcaller,
      questContent,
      seedOverride: "replay-seed-2",
    });

    expect(next.draftState?.mode).toBe("pool");
  });

  it("appends the pick and ranks the next offer against the updated deck", () => {
    const cardDatabase = makeReplayCardDatabase();
    const fitModel = makeReplayFitModel();

    const prevPickC1: QuestState = {
      ...createDefaultState(),
      draftState: makeReplayDraftState(),
    };
    // Picking C1 (number 1): the next pack [2,4,30,31,32] must rank C2 first,
    // because C1's corpus partner is C2 and the engine sees the post-pick deck.
    const afterC1 = pickDraftCardInQuestState({
      prev: prevPickC1,
      siteId: "site-1",
      cardNumber: 1,
      cardDatabase,
      fitModel,
    });
    expect(afterC1.deck.map((entry) => entry.cardNumber)).toEqual([1]);
    expect(afterC1.draftState?.pickNumber).toBe(2);
    const offerAfterC1 = afterC1.draftState?.currentOffer ?? [];
    expect(offerAfterC1[0]).toBe(2);

    const prevPickC3: QuestState = {
      ...createDefaultState(),
      draftState: makeReplayDraftState(),
    };
    // Picking C3 (number 3) from the SAME pick-1 offer: the same next pack must
    // now rank C4 first, proving the ranking reflects the just-picked card.
    const afterC3 = pickDraftCardInQuestState({
      prev: prevPickC3,
      siteId: "site-1",
      cardNumber: 3,
      cardDatabase,
      fitModel,
    });
    expect(afterC3.deck.map((entry) => entry.cardNumber)).toEqual([3]);
    const offerAfterC3 = afterC3.draftState?.currentOffer ?? [];
    expect(offerAfterC3[0]).toBe(4);
    // The two next-offers differ only because the deck the engine saw differed.
    expect(offerAfterC1).not.toEqual(offerAfterC3);
    expect(console.log).not.toHaveBeenCalled();
  });

  it("commits a prepared replay pick and rejects a diverged one", () => {
    const cardDatabase = makeReplayCardDatabase();
    const fitModel = makeReplayFitModel();
    const prev: QuestState = {
      ...createDefaultState(),
      draftState: makeReplayDraftState(),
    };

    const prepared = prepareDraftCardPickInQuestState({
      prev,
      siteId: "site-1",
      cardNumber: 1,
      cardDatabase,
      fitModel,
    });
    // The prepared next offer is computed against the deck WITH C1, so it leads
    // with C2 just like the direct-pick path.
    expect(
      (prepared.next.draftState?.currentOffer ?? [])[0],
    ).toBe(2);

    // Happy path: state unchanged since prepare -> commit writes prepared.next.
    const committed = commitPreparedDraftCardPickInQuestState({ prev, prepared });
    expect(committed?.deck).toEqual(prepared.next.deck);
    expect(committed?.draftState?.currentOffer).toEqual(
      prepared.next.draftState?.currentOffer,
    );

    // Conflict on a diverged currentOffer.
    const staleOffer: QuestState = {
      ...prev,
      draftState: { ...makeReplayDraftState(), currentOffer: [3, 1, 30, 31] },
    };
    expect(
      commitPreparedDraftCardPickInQuestState({ prev: staleOffer, prepared }),
    ).toBeNull();

    // Conflict on a diverged pickNumber.
    const stalePick: QuestState = {
      ...prev,
      draftState: { ...makeReplayDraftState(), pickNumber: 2 },
    };
    expect(
      commitPreparedDraftCardPickInQuestState({ prev: stalePick, prepared }),
    ).toBeNull();

    // Conflict on a diverged deck.
    const staleDeck: QuestState = {
      ...prev,
      deck: [
        { entryId: "deck-1", cardNumber: 99, transfiguration: null, isBane: false },
      ],
    };
    expect(
      commitPreparedDraftCardPickInQuestState({ prev: staleDeck, prepared }),
    ).toBeNull();
    expect(console.log).not.toHaveBeenCalled();
  });

  it("leaves pool-mode pick output unchanged by the append-first reorder", () => {
    // Same setup as the pool pick test, but asserts the reorder did not alter
    // the observable result: deck gets the card, pick advances, and a fresh
    // pool offer of four cards is produced.
    const cardDatabase = new Map<number, CardData>(
      [101, 102, 103, 104, 201, 202, 203, 204].map((cardNumber) => [
        cardNumber,
        makeCard(cardNumber),
      ]),
    );
    const prev: QuestState = {
      ...createDefaultState(),
      draftState: {
        mode: "pool",
        draftPoolCopiesByCard: { "201": 1, "202": 1, "203": 1, "204": 1 },
        remainingCopiesByCard: { "201": 1, "202": 1, "203": 1, "204": 1 },
        currentOffer: [101, 102, 103, 104],
        activeSiteId: "site-1",
        pickNumber: 1,
        sitePicksCompleted: 0,
      },
    };

    // fitModel is supplied but must be ignored for a pool state.
    const next = pickDraftCardInQuestState({
      prev,
      siteId: "site-1",
      cardNumber: 101,
      cardDatabase,
      fitModel: makeReplayFitModel(),
    });

    expect(next.deck).toEqual([
      { entryId: "deck-1", cardNumber: 101, transfiguration: null, isBane: false },
    ]);
    expect(next.draftState?.pickNumber).toBe(2);
    expect(next.draftState?.sitePicksCompleted).toBe(1);
    expect(next.draftState?.currentOffer).toHaveLength(4);
    expect(console.log).not.toHaveBeenCalled();
  });
});
