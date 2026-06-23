import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildReplayDraftState,
  hashStringToSeed,
  loadQuestContent,
} from "./quest-content";
import type { CardData } from "../types/cards";
import type { DraftRecord } from "./cards-v2-database";
import type { DreamcallerContent } from "../types/content";
import { DEFAULT_STARTING_ESSENCE } from "../types/content";
import type { FitModel } from "../draft/replay/fit-model";
import {
  selectRecordIndex,
  selectReplayRecordIndex,
} from "../draft/replay/draft-records";

function makeCard(cardNumber: number): CardData {
  return {
    name: `Card ${String(cardNumber)}`,
    id: `card-${String(cardNumber)}`,
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

describe("loadQuestContent", () => {
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
    dreamcallers,
    dreamsigns,
    decklists,
    draftRecords = [],
    affinityCorpus = tinyCorpus,
  }: {
    cards: CardData[];
    dreamcallers: unknown[];
    dreamsigns: unknown[];
    decklists: string[][];
    draftRecords?: DraftRecord[];
    affinityCorpus?: unknown;
  }): void {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL) => {
        const path = String(input);
        if (path === "/cards_v2-data.json") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(cards) });
        }
        if (path === "/dreamcallers-v2-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(dreamcallers),
          });
        }
        if (path === "/dreamsign-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(dreamsigns),
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
        if (path === "/draft-records-data.json") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(draftRecords),
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
        if (path === "/atlas-config-data.json") {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                layerSpecs: [],
                connectionAverage: 2,
                bonusReveal: { min: 0, max: 2, mode: 1 },
                repeatDiscourageStrength: 2,
                knownDreamsign: {
                  maxPerAtlas: 2,
                  eligibleLayers: [3, 4, 5, 6],
                  placementProbability: 0.5,
                  earlyRevealBias: 1,
                },
              }),
          });
        }
        // Any other asset the loader requests is an optional, variant-specific
        // artifact (a tides bundle, the merchant corpus, dreamsign profiles,
        // etc.). The loaders all treat a non-ok response as "absent" and fall
        // back gracefully, so returning a 404 here keeps these tests green no
        // matter which pool variant is the default — they exercise the load
        // path itself, not any one variant's pool construction.
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve(null),
        });
      }),
    );
  }

  it("loads V2 cards, Dreamcallers, decklists and builds the run pool context", async () => {
    const cards = [makeCard(1), makeCard(2), makeCard(3)];
    const v2Dreamcaller = {
      id: "dreamcaller-1",
      name: "Test Dreamcaller",
      title: "Speaker of Tests",
      renderedText: "Test rules text.",
      imageNumber: "0001",
      startingEssence: 235,
      signatureCards: ["Card 1", "Card 2"],
    };

    stubFetch({
      cards,
      dreamcallers: [v2Dreamcaller],
      dreamsigns: [],
      decklists: [["Card 1", "Card 2", "Card 3"]],
    });

    const content = await loadQuestContent();

    expect(content.cardDatabase.size).toBe(cards.length);
    expect(content.dreamcallers).toHaveLength(1);
    // The Dreamcaller mapping must carry the V2 signature cards through.
    expect(content.dreamcallers[0].signatureCards).toEqual(["Card 1", "Card 2"]);
    expect(content.dreamcallers[0].startingEssence).toBe(235);

    // The pool context indexes every loaded card and carries the decklists.
    expect(content.poolContext).toBeDefined();
    const poolContext = content.poolContext!;
    for (const card of cards) {
      expect(poolContext.nameIndex.get(card.name)).toBe(card.cardNumber);
    }
    expect(poolContext.poolData.decklists).not.toHaveLength(0);
  });

  it("fetches the draft-record corpus for pick-data pool variants", async () => {
    // pickearly (like pickfit/pickpos/pickchoice) grows its pool from the draft
    // records; without them it would silently fall back to the random color
    // pool. The records must therefore be fetched even in pool mode.
    const cards = [makeCard(1), makeCard(2), makeCard(3)];
    const dreamcallers = [
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
      dreamcallers,
      dreamsigns: [],
      decklists: [["Card 1", "Card 2"]],
      draftRecords: [],
    });

    await loadQuestContent("pickearly");

    const fetchedPaths = vi.mocked(fetch).mock.calls.map((c) => c[0] as string);
    expect(fetchedPaths).toContain("/draft-records-data.json");
  });

  it("always fetches the draft-record corpus for the default pool variant", async () => {
    // Every run needs the record corpus regardless of pool variant: it builds the
    // shared fit model and supplies the pack structures coherent opponent decks
    // draft from. The no-argument load path (DEFAULT_POOL_VARIANT) fetches it.
    const cards = [makeCard(1), makeCard(2), makeCard(3)];
    const dreamcallers = [
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
      dreamcallers,
      dreamsigns: [],
      decklists: [["Card 1", "Card 2"]],
      draftRecords: [],
    });

    await loadQuestContent();

    const fetchedPaths = vi.mocked(fetch).mock.calls.map((c) => c[0] as string);
    expect(fetchedPaths).toContain("/draft-records-data.json");
  });

  it("fetches the draft-record corpus even for a pool variant that builds from decklists", async () => {
    // idf3 builds its pool from decklist similarity, not the draft records, but
    // the records are still fetched so opponent decks have a fit model and packs.
    const cards = [makeCard(1), makeCard(2), makeCard(3)];
    const dreamcallers = [
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
      dreamcallers,
      dreamsigns: [],
      decklists: [["Card 1", "Card 2"]],
    });

    await loadQuestContent("idf3");

    const fetchedPaths = vi.mocked(fetch).mock.calls.map((c) => c[0] as string);
    expect(fetchedPaths).toContain("/draft-records-data.json");
  });

  it("loads draft records and builds a fit model for v2 pool mode", async () => {
    const cards = makeCards(20);
    const dreamcallers = [
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
      dreamcallers,
      dreamsigns: [],
      decklists: [cards.slice(0, 4).map((card) => card.name)],
      draftRecords: [fixtureRecord],
    });

    const content = await loadQuestContent("idf3", "pool", undefined, "v2");

    expect(content.draftMode).toBe("pool");
    expect(content.draftRecords).toEqual([fixtureRecord]);
    expect(content.fitModel).toBeDefined();
    expect(content.fresh20PackSize).toBeUndefined();
  });

  it("fetches the committed embedding for the embedded variant", async () => {
    // The `embedded` variant grows its pool from `/affinity-corpus-data.json`.
    // The corpus is reconstructed and threaded onto poolData.affinityCorpus.
    const cards = [makeCard(1), makeCard(2)];
    const dreamcallers = [
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
      dreamcallers,
      dreamsigns: [],
      decklists: [["Card 1", "Card 2"]],
    });

    const content = await loadQuestContent("embedded");

    const fetchedPaths = vi.mocked(fetch).mock.calls.map((c) => c[0] as string);
    expect(fetchedPaths).toContain("/affinity-corpus-data.json");
    expect(content.poolContext!.poolData.affinityCorpus).toBeDefined();
    expect(content.poolContext!.poolData.affinityCorpus!.cards).toEqual([
      "card-1",
      "card-2",
    ]);
  });

  it("offers every Dreamcaller without a validation skip loop", async () => {
    const cards = [makeCard(1), makeCard(2)];
    const dreamcallers = [
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

    stubFetch({ cards, dreamcallers, dreamsigns: [], decklists: [["Card 1"]] });

    const content = await loadQuestContent();

    expect(content.dreamcallers.map((dc) => dc.id)).toEqual(["dc-a", "dc-b"]);
    // A zero startingEssence falls back to the default rather than being dropped.
    expect(content.dreamcallers[0].startingEssence).toBe(DEFAULT_STARTING_ESSENCE);
  });

  it("populates draftMode, draftRecords, and fitModel in replay mode", async () => {
    const cards = makeCards(20);
    const dreamcallers = [
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
      dreamcallers,
      dreamsigns: [],
      decklists: [cards.slice(0, 4).map((card) => card.name)],
      draftRecords: [fixtureRecord],
    });

    const content = await loadQuestContent("idf3", "replay");

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

/** Minimal DraftRecord fixture with two packs. */
function makeRecord(id: string, packCardNames: string[][]): DraftRecord {
  return {
    id,
    draftId: `draft-${id}`,
    sourceFile: `draft-${id}-records.json`,
    mainboard: packCardNames.flat(),
    mainboardIds: packCardNames.flat(),
    packs: packCardNames,
    picks: packCardNames.map(() => []),
    packIds: packCardNames,
    pickIds: packCardNames.map(() => []),
  };
}

/** Minimal DreamcallerContent fixture. */
function makeDreamcaller(signatureCards: string[]): DreamcallerContent {
  return {
    id: "dc-test",
    name: "Test Dreamcaller",
    title: "Speaker of Tests",
    renderedText: "",
    imageNumber: "0001",
    startingEssence: 250,
    signatureCards,
  };
}

describe("buildReplayDraftState", () => {
  const card1 = makeCard(101);
  const card2 = makeCard(102);
  const card3 = makeCard(103);
  const card4 = makeCard(104);

  // Build a name index from the fixture cards.
  const nameIndex = new Map<string, number>([
    [card1.name, card1.cardNumber],
    [card2.name, card2.cardNumber],
    [card3.name, card3.cardNumber],
    [card4.name, card4.cardNumber],
  ]);

  // Two fixture records with distinct ids.
  const recordA = makeRecord("rec-a", [[card1.name, card2.name], [card3.name]]);
  const recordB = makeRecord("rec-b", [[card2.name, card3.name], [card4.name]]);
  const records: DraftRecord[] = [recordA, recordB];

  it("throws when draftRecords is empty", () => {
    const dc = makeDreamcaller([]);
    expect(() => buildReplayDraftState(dc, nameIndex, "seed-1", [])).toThrow(
      "buildReplayDraftState requires at least one draft record",
    );
  });

  it("selects a record deterministically for a fixed seed", () => {
    const dc = makeDreamcaller([]);
    const state1 = buildReplayDraftState(dc, nameIndex, "seed-abc", records);
    const state2 = buildReplayDraftState(dc, nameIndex, "seed-abc", records);
    expect(state1.recordId).toBe(state2.recordId);
  });

  it("returns a mode:replay state with packSequence resolved from the chosen record", () => {
    const dc = makeDreamcaller([]);
    const state = buildReplayDraftState(dc, nameIndex, "quest-seed-1", records);
    expect(state.mode).toBe("replay");
    // recordId must be one of the fixture ids.
    expect(["rec-a", "rec-b"]).toContain(state.recordId);
    // packSequence must be resolved to card numbers.
    const chosenRecord = records.find((r) => r.id === state.recordId)!;
    expect(state.packSequence).toHaveLength(chosenRecord.packs.length);
    for (let i = 0; i < chosenRecord.packs.length; i += 1) {
      const expectedNumbers = chosenRecord.packs[i]
        .map((name) => nameIndex.get(name))
        .filter((n): n is number => n !== undefined);
      expect(state.packSequence[i]).toEqual(expectedNumbers);
    }
  });

  it("resolves the dreamcaller's signature cards to signatureCardNumbers", () => {
    // dc has Card 101 and Card 103 as signatures.
    const dc = makeDreamcaller([card1.name, card3.name]);
    const state = buildReplayDraftState(dc, nameIndex, "quest-seed-2", records);
    expect(state.signatureCardNumbers).toContain(card1.cardNumber);
    expect(state.signatureCardNumbers).toContain(card3.cardNumber);
  });

  it("drops signature names not present in the name index", () => {
    const dc = makeDreamcaller(["Unknown Card", card2.name]);
    const state = buildReplayDraftState(dc, nameIndex, "quest-seed-3", records);
    // Only card2's number survives; the unknown name is silently dropped.
    expect(state.signatureCardNumbers).toEqual([card2.cardNumber]);
  });

  it("produces different records for different seeds", () => {
    // With two records, different seeds should sometimes select different records.
    const dc = makeDreamcaller([]);
    const ids = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const state = buildReplayDraftState(dc, nameIndex, `seed-${String(i)}`, records);
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
      numberToName: new Map(),
      nameIndex: new Map(),
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
    const dc = makeDreamcaller([card1.name]);
    // No fitModel → uniform seeded draw.
    const state = buildReplayDraftState(dc, nameIndex, "quest-fm-0", records);
    const expectedSeed = hashStringToSeed("quest-fm-0:replay");
    const expectedIndex = selectRecordIndex(expectedSeed, records.length);
    expect(state.recordId).toBe(records[expectedIndex].id);
  });

  it("with a fitModel favoring a record's packs, the fitModel steers selection away from the uniform draw", () => {
    // Only recordA has card1 in its packs, so a positive IDF weight makes it the
    // single matched record. Placing it at index 1 makes the matched shortlist
    // order [recordA, recordB] differ from the uniform order [recordB, recordA]
    // for every seed, so the choice provably depends on the fitModel. The ranking
    // math itself is covered exhaustively in draft-records.test.ts.
    const fitModel = makeFitModelStub([[card1.name, 3.0]]);
    const dc = makeDreamcaller([card1.name]);
    const ordered = [recordB, recordA];
    const seed = "quest-fm-1";

    const matched = buildReplayDraftState(dc, nameIndex, seed, ordered, fitModel);
    const uniform = buildReplayDraftState(dc, nameIndex, seed, ordered);
    expect(matched.recordId).not.toBe(uniform.recordId);

    // buildReplayDraftState delegates to selectReplayRecordIndex with fitModel.idf.
    const expectedIndex = selectReplayRecordIndex(
      dc.signatureCards ?? [],
      ordered,
      fitModel.idf,
      hashStringToSeed(`${seed}:replay`),
    );
    expect(matched.recordId).toBe(ordered[expectedIndex].id);
  });

  it("with a fitModel whose idf has no weight for any signature, falls back to uniform", () => {
    // All idf weights are 0 for the signature cards.
    const fitModel = makeFitModelStub([[card1.name, 0], [card2.name, 0]]);
    const dc = makeDreamcaller([card1.name, card2.name]);
    const state1 = buildReplayDraftState(dc, nameIndex, "quest-fm-2", records, fitModel);
    const state2 = buildReplayDraftState(dc, nameIndex, "quest-fm-2", records);
    // Both should pick the same record (uniform fallback in both cases).
    expect(state1.recordId).toBe(state2.recordId);
  });
});
