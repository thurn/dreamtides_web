import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildReplayDraftState,
  hashStringToSeed,
  loadJourneyContent,
} from "./journey-content";
import type { CardData } from "../types/cards";
import type { DraftRecord, KnownGoodDecklist } from "./cards-v2-database";
import type { DreamAvatarContent } from "../types/content";
import { DEFAULT_STARTING_ESSENCE } from "../types/content";
import type { FitModel } from "../draft/replay/fit-model";
import {
  selectRecordIndex,
  selectReplayRecordIndex,
} from "../draft/replay/draft-records";
import { asCardId, asCardName } from "../types/card-identity";
import { MINIMAL_ATLAS_DATA } from "../__test-helpers__/atlas-fixtures";

function makeCard(cardNumber: number): CardData {
  return {
    name: asCardName(`Card ${String(cardNumber)}`),
    id: asCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function makeCards(count: number): CardData[] {
  return Array.from({ length: count }, (_value, index) => makeCard(index + 1));
}

function makeValidDraftRecord(id: string, mainboard: readonly string[]): DraftRecord {
  return {
    id,
    draftId: `draft-${id}`,
    sourceFile: `draft-${id}-records.json`,
    mainboard: [...mainboard],
    mainboardIds: [...mainboard],
    packs: [mainboard.slice(0, 4)],
    picks: [[mainboard[0]]],
    packIds: [mainboard.slice(0, 4)],
    pickIds: [[mainboard[0]]],
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("loadJourneyContent", () => {
  // A minimal valid affinity corpus (2 cards) so the `embedded` variant's
  // `/affinity-corpus-data.json` fetch deserializes without error.
  const tinyCorpus = {
    version: 2,
    kind: "matrix",
    cards: ["card-1", "card-2"],
    prior: [0.5, 0.5],
    affinity: [[0, [[1, 0.4]]]],
  };

  function stubFetch({
    cards,
    dreamAvatars,
    dreamsigns,
    decklists,
    decklistIds,
    draftRecords = [],
    knownGoodDecklists = [],
    merchantCorpus = {
      version: 1,
      source: "test",
      cards: {},
      clusters: [],
    },
    affinityCorpus = tinyCorpus,
    failingPaths = [],
  }: {
    cards: CardData[];
    dreamAvatars: unknown[];
    dreamsigns: unknown[];
    decklists: string[][];
    decklistIds?: string[][];
    draftRecords?: DraftRecord[];
    knownGoodDecklists?: KnownGoodDecklist[];
    merchantCorpus?: unknown;
    affinityCorpus?: unknown;
    failingPaths?: string[];
  }): void {
    const idByName = new Map(cards.map((card) => [String(card.name), card.id]));
    const resolvedDecklistIds =
      decklistIds ??
      decklists.map((deck) =>
        deck.map((name) => idByName.get(name) ?? name.toLowerCase()),
      );
    const failingPathSet = new Set(failingPaths);
    const explorationData = {
      customCards: [],
      customDreamsigns: [],
      encounters: Array.from({ length: 14 }, (_value, encounterIndex) => ({
        cardId: `exploration-source-${String(encounterIndex + 1)}`,
        prose: `Exploration fixture ${String(encounterIndex + 1)}.`,
        action: [0, 1].map((actionIndex) => ({
          id: `exploration-${String(encounterIndex + 1)}-${String(actionIndex + 1)}`,
          label: `Choice ${String(actionIndex + 1)}`,
          effectText: "Gain the fixture card.",
          effectKind: "gain-card",
          cardId: String(cards[0]?.id ?? "fixture-card"),
        })),
      })),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL) => {
        const path = String(input);
        if (failingPathSet.has(path)) {
          return Promise.resolve({
            ok: false,
            status: 503,
            statusText: "Test Failure",
            json: () => Promise.resolve(null),
          });
        }
        if (path === "/cards_v2-data.json") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(cards) });
        }
        if (path === "/dream-avatars-v2-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(dreamAvatars),
          });
        }
        if (path === "/dreamsign-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(dreamsigns),
          });
        }
        if (path === "/exploration-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(explorationData),
          });
        }
        if (path === "/dreamwell-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          });
        }
        if (path === "/decklists-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(decklists),
          });
        }
        if (path === "/decklist-ids-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(resolvedDecklistIds),
          });
        }
        if (path === "/draft-records-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(draftRecords),
          });
        }
        if (path === "/known-good-decklists-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(knownGoodDecklists),
          });
        }
        if (path === "/merchant-corpus-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(merchantCorpus),
          });
        }
        if (path === "/affinity-corpus-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(affinityCorpus),
          });
        }
        if (path === "/dreamscapes-data.json") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        if (path === "/affiliations-data.json") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        if (path === "/dream-guides-data.json") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        if (path === "/apollyon-incarnations-data.json") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
        }
        if (path === "/atlas-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(MINIMAL_ATLAS_DATA),
          });
        }
        // Any other asset the loader requests is an optional, variant-specific
        // artifact (a tides bundle, dreamsign profiles, etc.). Returning a 404
        // here keeps these tests focused on the shared load path.
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve(null),
        });
      }),
    );
  }

  it("loads V2 cards, DreamAvatars, decklists and builds the run pool context", async () => {
    const cards = [makeCard(1), makeCard(2), makeCard(3)];
    const v2DreamAvatar = {
      id: "dream-avatar-1",
      name: "Test DreamAvatar",
      title: "Speaker of Tests",
      renderedText: "Test rules text.",
      imageNumber: "0001",
      startingEssence: 235,
      signatureCards: ["Card 1", "Card 2"],
    };

    stubFetch({
      cards,
      dreamAvatars: [v2DreamAvatar],
      dreamsigns: [],
      decklists: [["Card 1", "Card 2", "Card 3"]],
    });

    const content = await loadJourneyContent();

    expect(content.cardDatabase.size).toBe(cards.length);
    expect(content.dreamAvatars).toHaveLength(1);
    // The DreamAvatar mapping must carry the V2 signature cards through.
    expect(content.dreamAvatars[0].signatureCards).toEqual(["Card 1", "Card 2"]);
    expect(content.dreamAvatars[0].startingEssence).toBe(235);

    // The pool context indexes every loaded card by id and carries the decklists.
    expect(content.poolContext).toBeDefined();
    const poolContext = content.poolContext!;
    for (const card of cards) {
      expect(poolContext.idIndex.get(card.id.toLowerCase())).toBe(
        card.cardNumber,
      );
    }
    expect(poolContext.poolData.decklists).not.toHaveLength(0);
  });

  it.each([
    ["/decklist-ids-data.json", "Failed to load decklist ids"],
    ["/draft-records-data.json", "Failed to load draft records"],
    ["/known-good-decklists-data.json", "Failed to load known-good decklists"],
    ["/merchant-corpus-data.json", "Failed to load merchant corpus"],
  ])("rejects when fold-relevant content fetch %s fails", async (path, message) => {
    const cards = [makeCard(1), makeCard(2), makeCard(3)];
    const dreamAvatars = [
      {
        id: "dc-a",
        name: "Alpha",
        title: "A",
        renderedText: "",
        imageNumber: "0001",
        startingEssence: 250,
        signatureCards: ["Card 1"],
      },
    ];
    stubFetch({
      cards,
      dreamAvatars,
      dreamsigns: [],
      decklists: [["Card 1", "Card 2"]],
      failingPaths: [path],
    });

    await expect(loadJourneyContent()).rejects.toThrow(message);
  });

  it("fetches the draft-record corpus for pick-data pool variants", async () => {
    // pickearly (like pickfit/pickpos/pickchoice) grows its pool from the draft
    // records; without them it would silently fall back to the random color
    // pool. The records must therefore be fetched even in pool mode.
    const cards = [makeCard(1), makeCard(2), makeCard(3)];
    const dreamAvatars = [
      {
        id: "dc-a",
        name: "Alpha",
        title: "A",
        renderedText: "",
        imageNumber: "0001",
        startingEssence: 250,
        signatureCards: ["Card 1"],
      },
    ];
    stubFetch({
      cards,
      dreamAvatars,
      dreamsigns: [],
      decklists: [["Card 1", "Card 2"]],
      draftRecords: [],
    });

    await loadJourneyContent("pickearly");

    const fetchedPaths = vi.mocked(fetch).mock.calls.map((c) => c[0] as string);
    expect(fetchedPaths).toContain("/draft-records-data.json");
  });

  it("always fetches the draft-record corpus for the default pool variant", async () => {
    // Every run needs the record corpus regardless of pool variant: it builds the
    // shared fit model and supplies the pack structures coherent opponent decks
    // draft from. The no-argument load path (DEFAULT_POOL_VARIANT) fetches it.
    const cards = [makeCard(1), makeCard(2), makeCard(3)];
    const dreamAvatars = [
      {
        id: "dc-a",
        name: "Alpha",
        title: "A",
        renderedText: "",
        imageNumber: "0001",
        startingEssence: 250,
        signatureCards: ["Card 1"],
      },
    ];
    stubFetch({
      cards,
      dreamAvatars,
      dreamsigns: [],
      decklists: [["Card 1", "Card 2"]],
      draftRecords: [],
    });

    await loadJourneyContent();

    const fetchedPaths = vi.mocked(fetch).mock.calls.map((c) => c[0] as string);
    expect(fetchedPaths).toContain("/draft-records-data.json");
  });

  it("fetches the draft-record corpus even for a pool variant that builds from decklists", async () => {
    // idf3 builds its pool from decklist similarity, not the draft records, but
    // the records are still fetched so opponent decks have a fit model and packs.
    const cards = [makeCard(1), makeCard(2), makeCard(3)];
    const dreamAvatars = [
      {
        id: "dc-a",
        name: "Alpha",
        title: "A",
        renderedText: "",
        imageNumber: "0001",
        startingEssence: 250,
        signatureCards: ["Card 1"],
      },
    ];
    stubFetch({
      cards,
      dreamAvatars,
      dreamsigns: [],
      decklists: [["Card 1", "Card 2"]],
    });

    await loadJourneyContent("idf3");

    const fetchedPaths = vi.mocked(fetch).mock.calls.map((c) => c[0] as string);
    expect(fetchedPaths).toContain("/draft-records-data.json");
  });

  it("loads draft records and builds a fit model for v2 pool mode", async () => {
    const cards = makeCards(20);
    const dreamAvatars = [
      {
        id: "dc-a",
        name: "Alpha",
        title: "A",
        renderedText: "",
        imageNumber: "0001",
        startingEssence: 250,
        signatureCards: ["Card 1"],
      },
    ];
    const fixtureRecord = makeValidDraftRecord(
      "rec-1",
      cards.map((card) => card.name),
    );

    stubFetch({
      cards,
      dreamAvatars,
      dreamsigns: [],
      decklists: [cards.slice(0, 4).map((card) => card.name)],
      draftRecords: [fixtureRecord],
    });

    const content = await loadJourneyContent("idf3", "pool");

    expect(content.draftMode).toBe("pool");
    expect(content.draftRecords).toEqual([fixtureRecord]);
    expect(content.fitModel).toBeDefined();
    expect(content.fresh20PackSize).toBeUndefined();
  });

  it("fetches the committed embedding for the embedded variant", async () => {
    // The `embedded` variant grows its pool from `/affinity-corpus-data.json`.
    // The corpus is reconstructed and threaded onto poolData.affinityCorpus.
    const cards = [makeCard(1), makeCard(2)];
    const dreamAvatars = [
      {
        id: "dc-a",
        name: "Alpha",
        title: "A",
        renderedText: "",
        imageNumber: "0001",
        startingEssence: 250,
        signatureCards: ["Card 1"],
      },
    ];
    stubFetch({
      cards,
      dreamAvatars,
      dreamsigns: [],
      decklists: [["Card 1", "Card 2"]],
    });

    const content = await loadJourneyContent("embedded");

    const fetchedPaths = vi.mocked(fetch).mock.calls.map((c) => c[0] as string);
    expect(fetchedPaths).toContain("/affinity-corpus-data.json");
    expect(content.poolContext!.poolData.affinityCorpus).toBeDefined();
    expect(content.poolContext!.poolData.affinityCorpus!.cards).toEqual([
      "card-1",
      "card-2",
    ]);
  });

  it("offers every DreamAvatar without a validation skip loop", async () => {
    const cards = [makeCard(1), makeCard(2)];
    const dreamAvatars = [
      {
        id: "dc-a",
        name: "Alpha",
        title: "A",
        renderedText: "",
        imageNumber: "0001",
        startingEssence: 0,
        signatureCards: ["Card 1"],
      },
      {
        id: "dc-b",
        name: "Beta",
        title: "B",
        renderedText: "",
        imageNumber: "0002",
        startingEssence: 250,
        signatureCards: [],
      },
    ];

    stubFetch({ cards, dreamAvatars, dreamsigns: [], decklists: [["Card 1"]] });

    const content = await loadJourneyContent();

    expect(content.dreamAvatars.map((dc) => dc.id)).toEqual(["dc-a", "dc-b"]);
    // A zero startingEssence falls back to the default rather than being dropped.
    expect(content.dreamAvatars[0].startingEssence).toBe(DEFAULT_STARTING_ESSENCE);
  });

  it("populates draftMode, draftRecords, and fitModel in replay mode", async () => {
    const cards = makeCards(20);
    const dreamAvatars = [
      {
        id: "dc-a",
        name: "Alpha",
        title: "A",
        renderedText: "",
        imageNumber: "0001",
        startingEssence: 250,
        signatureCards: ["Card 1"],
      },
    ];
    const fixtureRecord = makeValidDraftRecord(
      "rec-1",
      cards.map((card) => card.name),
    );

    stubFetch({
      cards,
      dreamAvatars,
      dreamsigns: [],
      decklists: [cards.slice(0, 4).map((card) => card.name)],
      draftRecords: [fixtureRecord],
    });

    const content = await loadJourneyContent("idf3", "replay");

    expect(content.draftMode).toBe("replay");
    // draftRecords must be populated (even if the corpus is small).
    expect(content.draftRecords).toBeDefined();
    expect(content.draftRecords).toHaveLength(1);
    expect(content.draftRecords![0].id).toBe("rec-1");
    expect(content.fitModel).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// buildReplayDraftState
// ---------------------------------------------------------------------------

/** Minimal DraftRecord fixture with two packs, keyed by card id. */
function makeRecord(id: string, packCardIds: string[][]): DraftRecord {
  return {
    id,
    draftId: `draft-${id}`,
    sourceFile: `draft-${id}-records.json`,
    mainboard: packCardIds.flat(),
    mainboardIds: packCardIds.flat(),
    packs: packCardIds,
    picks: packCardIds.map(() => []),
    packIds: packCardIds,
    pickIds: packCardIds.map(() => []),
  };
}

/** Minimal DreamAvatarContent fixture; signatures are keyed by card id. */
function makeDreamAvatar(signatureCardIds: string[]): DreamAvatarContent {
  return {
    id: "dc-test",
    name: "Test DreamAvatar",
    title: "Speaker of Tests",
    renderedText: "",
    imageNumber: "0001",
    startingEssence: 250,
    signatureCardIds,
  };
}

describe("buildReplayDraftState", () => {
  const card1 = makeCard(101);
  const card2 = makeCard(102);
  const card3 = makeCard(103);
  const card4 = makeCard(104);

  // Build a card-id index from the fixture cards.
  const idIndex = new Map<string, number>([
    [card1.id, card1.cardNumber],
    [card2.id, card2.cardNumber],
    [card3.id, card3.cardNumber],
    [card4.id, card4.cardNumber],
  ]);

  // Two fixture records with distinct ids.
  const recordA = makeRecord("rec-a", [[card1.id, card2.id], [card3.id]]);
  const recordB = makeRecord("rec-b", [[card2.id, card3.id], [card4.id]]);
  const records: DraftRecord[] = [recordA, recordB];

  it("throws when draftRecords is empty", () => {
    const dc = makeDreamAvatar([]);
    expect(() => buildReplayDraftState(dc, idIndex, "seed-1", [])).toThrow(
      "buildReplayDraftState requires at least one draft record",
    );
  });

  it("selects a record deterministically for a fixed seed", () => {
    const dc = makeDreamAvatar([]);
    const state1 = buildReplayDraftState(dc, idIndex, "seed-abc", records);
    const state2 = buildReplayDraftState(dc, idIndex, "seed-abc", records);
    expect(state1.recordId).toBe(state2.recordId);
  });

  it("returns a mode:replay state with packSequence resolved from the chosen record", () => {
    const dc = makeDreamAvatar([]);
    const state = buildReplayDraftState(dc, idIndex, "journey-seed-1", records);
    expect(state.mode).toBe("replay");
    // recordId must be one of the fixture ids.
    expect(["rec-a", "rec-b"]).toContain(state.recordId);
    // packSequence must be resolved to card numbers.
    const chosenRecord = records.find((r) => r.id === state.recordId)!;
    expect(state.packSequence).toHaveLength(chosenRecord.packIds.length);
    for (let i = 0; i < chosenRecord.packIds.length; i += 1) {
      const expectedNumbers = chosenRecord.packIds[i]
        .map((cardId) => idIndex.get(cardId))
        .filter((n): n is number => n !== undefined);
      expect(state.packSequence[i]).toEqual(expectedNumbers);
    }
  });

  it("resolves the dreamAvatar's signature cards to signatureCardNumbers", () => {
    // dc has card 101 and card 103 as signatures.
    const dc = makeDreamAvatar([card1.id, card3.id]);
    const state = buildReplayDraftState(dc, idIndex, "journey-seed-2", records);
    expect(state.signatureCardNumbers).toContain(card1.cardNumber);
    expect(state.signatureCardNumbers).toContain(card3.cardNumber);
  });

  it("drops signature ids not present in the id index", () => {
    const dc = makeDreamAvatar(["unknown-card", card2.id]);
    const state = buildReplayDraftState(dc, idIndex, "journey-seed-3", records);
    // Only card2's number survives; the unknown id is silently dropped.
    expect(state.signatureCardNumbers).toEqual([card2.cardNumber]);
  });

  it("produces different records for different seeds", () => {
    // With two records, different seeds should sometimes select different records.
    const dc = makeDreamAvatar([]);
    const ids = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const state = buildReplayDraftState(dc, idIndex, `seed-${String(i)}`, records);
      ids.add(state.recordId);
    }
    // Both records must appear across the 20 seeds (probability of failure ≈ 2^-19).
    expect(ids.size).toBe(2);
  });

  // -------------------------------------------------------------------------
  // fitModel integration
  // -------------------------------------------------------------------------

  /**
   * Build a minimal FitModel stub with only the idf field populated.
   * The other fields are unused by buildReplayDraftState (only the idf map
   * flows through to selectReplayRecordIndex).
   */
  function makeFitModelStub(idfEntries: [string, number][]): FitModel {
    return {
      idf: new Map(idfEntries),
      decks: [],
      prior: new Map(),
      coocNorm: new Map(),
      numberToId: new Map(),
      idIndex: new Map(),
      tuning: {
        alpha: 1,
        beta: 0.9,
        gamma: 0.25,
        K: 50,
        idfPower: 1,
        minDf: 2,
        maxDfFrac: 0.6,
        minDeckSize: 16,
        maxDeckSize: 34,
      },
    };
  }

  it("without a fitModel the selection equals the uniform fallback", () => {
    const dc = makeDreamAvatar([card1.id]);
    // No fitModel → uniform seeded draw.
    const state = buildReplayDraftState(dc, idIndex, "journey-fm-0", records);
    const expectedSeed = hashStringToSeed("journey-fm-0:replay");
    const expectedIndex = selectRecordIndex(expectedSeed, records.length);
    expect(state.recordId).toBe(records[expectedIndex].id);
  });

  it("with a fitModel favoring a record's packs, the fitModel steers selection away from the uniform draw", () => {
    // Only recordA has card1 in its packs, so a positive IDF weight makes it the
    // single matched record. Placing it at index 1 makes the matched shortlist
    // order [recordA, recordB] differ from the uniform order [recordB, recordA]
    // for every seed, so the choice provably depends on the fitModel. The ranking
    // math itself is covered exhaustively in draft-records.test.ts.
    const fitModel = makeFitModelStub([[card1.id, 3.0]]);
    const dc = makeDreamAvatar([card1.id]);
    const ordered = [recordB, recordA];
    const seed = "journey-fm-1";

    const matched = buildReplayDraftState(dc, idIndex, seed, ordered, fitModel);
    const uniform = buildReplayDraftState(dc, idIndex, seed, ordered);
    expect(matched.recordId).not.toBe(uniform.recordId);

    // buildReplayDraftState delegates to selectReplayRecordIndex with fitModel.idf.
    const expectedIndex = selectReplayRecordIndex(
      dc.signatureCardIds ?? [],
      ordered,
      fitModel.idf,
      hashStringToSeed(`${seed}:replay`),
    );
    expect(matched.recordId).toBe(ordered[expectedIndex].id);
  });

  it("with a fitModel whose idf has no weight for any signature, falls back to uniform", () => {
    // All idf weights are 0 for the signature cards.
    const fitModel = makeFitModelStub([[card1.id, 0], [card2.id, 0]]);
    const dc = makeDreamAvatar([card1.id, card2.id]);
    const state1 = buildReplayDraftState(dc, idIndex, "journey-fm-2", records, fitModel);
    const state2 = buildReplayDraftState(dc, idIndex, "journey-fm-2", records);
    // Both should pick the same record (uniform fallback in both cases).
    expect(state1.recordId).toBe(state2.recordId);
  });
});
