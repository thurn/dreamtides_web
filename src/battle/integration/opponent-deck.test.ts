import { afterEach, describe, expect, it } from "vitest";
import {
  makeBattleTestCardDatabase,
  makeBattleTestState,
} from "../test-support";
import { createBattleInit } from "./create-battle-init";
import type { CreateBattleInitInput } from "./create-battle-init";
import {
  buildOpponentDreamsigns,
  opponentCarriesDreamsign,
  opponentDistinctCardCount,
  opponentDraftTemperature,
  opponentPickBudget,
  opponentRemovalCount,
  runMidpointCompletionLevel,
} from "./opponent-deck";
import { createBattleRngStreams, deriveBattleSeed } from "../random";
import { buildNameIndex } from "../../data/cards-v2-database";
import type { DraftRecord } from "../../data/cards-v2-database";
import { buildFitModel, type FitModel } from "../../draft/replay/fit-model";
import { buildPoolData } from "../../draft/pool/pool-data";
import { getLogEntries, resetLog } from "../../logging";
import type { RunPoolContext } from "../../data/quest-content";
import type {
  AffiliationContent,
  DreamcallerContent,
  DreamscapeContent,
  DreamsignTemplate,
} from "../../types/content";
import type { CardData } from "../../types/cards";
import type { PoolCard } from "../../draft/pool/types";

const MIN_BATTLE_DECK_SIZE = 25;

/**
 * The battle test card database carries two disjoint decklist ranges:
 *  - Alpha pool: card numbers 1000..1041
 *  - Beta pool: card numbers 1100..1141
 * The synthetic corpus below builds coherent "alpha" and "beta" decks from these
 * so the coherent draft has a real fit signal to follow.
 */
const ALPHA_RANGE = Array.from({ length: 42 }, (_, i) => 1000 + i);
const BETA_RANGE = Array.from({ length: 42 }, (_, i) => 1100 + i);

// The distinct cards each faction's decks and packs are built from. Wide enough
// to let a late-run opponent reach the maximum distinct deck size.
const ALPHA_CARDS = ALPHA_RANGE.slice(0, 24);
const BETA_CARDS = BETA_RANGE.slice(0, 24);

function nameOf(db: ReadonlyMap<number, CardData>, cardNumber: number): string {
  const card = db.get(cardNumber);
  if (card === undefined) {
    throw new Error(`missing test card #${String(cardNumber)}`);
  }
  return card.name;
}

/**
 * A synthetic corpus over the battle test database: 18-card alpha and beta decks
 * (so the fit model learns each faction's cards co-occur) plus mixed packs (so a
 * draft can pick from both factions). Returns the fit model and the records,
 * mirroring how production builds the fit model from all record mainboards and
 * draws packs from the records' real pack structures.
 */
function makeCorpus(db: Map<number, CardData>): {
  fitModel: FitModel;
  draftRecords: DraftRecord[];
} {
  const nameIndex = buildNameIndex(db);
  const alpha = ALPHA_CARDS.map((n) => nameOf(db, n));
  const beta = BETA_CARDS.map((n) => nameOf(db, n));

  const records: DraftRecord[] = [];
  const makeFactionRecords = (
    faction: string,
    cards: readonly string[],
    other: readonly string[],
  ): void => {
    for (let r = 0; r < 24; r += 1) {
      // 18-card mainboard, a rotating window over the faction's cards so card
      // document-frequencies vary like a real corpus.
      const start = r % 6;
      const mainboard = cards.slice(start, start + 18);
      // 30 mixed packs (mostly this faction, some of the other) so the draft has
      // real choices to discriminate among.
      const packs: string[][] = [];
      for (let p = 0; p < 30; p += 1) {
        const pack: string[] = [];
        for (let k = 0; k < 6; k += 1) {
          pack.push(cards[(p * 3 + k) % cards.length]);
        }
        for (let k = 0; k < 4; k += 1) {
          pack.push(other[(p * 2 + k) % other.length]);
        }
        packs.push(pack);
      }
      records.push({
        id: `${faction}-${String(r)}`,
        draftId: `${faction}-${String(r)}`,
        sourceFile: "test",
        mainboard,
        mainboardIds: mainboard,
        packs,
        picks: [],
        // The fit model and pack source key on the record's id arrays; this
        // synthetic corpus uses card names as the id token, so the id arrays
        // mirror the name arrays.
        packIds: packs,
        pickIds: [],
      });
    }
  };
  makeFactionRecords("alpha", alpha, beta);
  makeFactionRecords("beta", beta, alpha);

  const fitModel = buildFitModel(
    records.map((r) => r.mainboardIds),
    nameIndex,
  );
  return { fitModel, draftRecords: records };
}

/**
 * Builds a {@link RunPoolContext} over the battle test database carrying the same
 * decklist corpus, so affiliation probe affinities resolve.
 */
function makePoolContext(db: Map<number, CardData>): RunPoolContext {
  const nameIndex = buildNameIndex(db);
  const alpha = ALPHA_CARDS.map((n) => nameOf(db, n));
  const beta = BETA_CARDS.map((n) => nameOf(db, n));
  const idOf = (n: number): string => {
    const card = db.get(n);
    if (card === undefined) throw new Error(`missing test card #${String(n)}`);
    return card.id.toLowerCase();
  };
  const alphaIds = ALPHA_CARDS.map(idOf);
  const betaIds = BETA_CARDS.map(idOf);
  const poolCards: PoolCard[] = Array.from(db.values()).map((card) => ({
    name: card.name,
    id: card.id,
  }));
  // The IDF pool engine and affiliation reweighting score on the id-keyed corpus,
  // so feed the decklists as card-id arrays (the affiliation signatures are UUIDs).
  const poolData = buildPoolData(poolCards, [alpha, beta], undefined, [
    alphaIds,
    betaIds,
  ]);
  return {
    poolData,
    nameIndex,
    allDreamsignPoolIds: [],
    poolVariant: "idf3",
  };
}

/**
 * A single-Dreamcaller set steered by the given signature cards, so the opponent
 * descriptor and deck are deterministic. Mirrors the runtime bundle: the steering
 * cards are kept as display names in `signatureCards`, and the id-aligned
 * `signatureCardIds` (resolved from `db` when supplied) is what the opponent
 * builder actually seeds on. When `db` is omitted the ids are empty, so the
 * draft is steered only by corpus coherence (and any affiliation).
 */
function makeDreamcallers(
  signatureCards: readonly string[],
  db?: ReadonlyMap<number, CardData>,
): DreamcallerContent[] {
  const idByName = new Map(
    db === undefined ? [] : [...db.values()].map((card) => [card.name, card.id]),
  );
  return [
    {
      id: "opp-dc",
      name: "Opponent Sentinel",
      title: "Rival",
      renderedText: "",
      imageNumber: "001",
      startingEssence: 250,
      signatureCards: [...signatureCards],
      signatureCardIds: signatureCards
        .map((name) => idByName.get(name))
        .filter((id): id is string => id !== undefined),
    },
  ];
}

function makeDreamsignTemplates(count: number): DreamsignTemplate[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sign-${String(i)}`,
    name: `Dreamsign ${String(i)}`,
    effectDescription: `Effect ${String(i)}`,
  }));
}

/**
 * Test dreamscapes + affiliations: one dreamscape `affiliated_scape` backed by an
 * affiliation whose signature cards are the alpha decklist, so an affiliated
 * build should over-represent alpha cards relative to an unbiased build.
 */
function makeAffiliationContent(db: ReadonlyMap<number, CardData>): {
  dreamscapes: DreamscapeContent[];
  affiliations: AffiliationContent[];
  affiliatedNode: ReturnType<typeof makeBattleTestState>["atlas"]["nodes"][string];
} {
  const alphaSignatureUuids = ALPHA_CARDS.slice(0, 12).map((n) => {
    const card = db.get(n);
    if (card === undefined) throw new Error(`missing #${String(n)}`);
    return card.id;
  });
  const affiliations: AffiliationContent[] = [
    {
      id: "alpha_affiliation",
      name: "Alpha Affiliation",
      signatureCards: alphaSignatureUuids,
      weightStrength: 4,
      opponentBiasStrength: 8,
    },
  ];
  const dreamscapes: DreamscapeContent[] = [
    {
      id: "affiliated_scape",
      name: "Affiliated Scape",
      aesthetic: "",
      guideId: null,
      signatureSite: "Battle",
      affiliationId: "alpha_affiliation",
      siteIcon: "",
      isStarter: false,
      dreamcallerIds: [],
    },
  ];
  const baseState = makeBattleTestState();
  const baseNode = baseState.atlas.nodes["dreamscape-2"];
  const affiliatedNode = {
    ...baseNode,
    id: "affiliated-node",
    dreamscapeId: "affiliated_scape",
  };
  return { dreamscapes, affiliations, affiliatedNode };
}

/** Base input wired with a populated (7-layer) atlas and the synthetic corpus,
 * so opponent construction runs the coherent draft (not the fallback). */
function makeInput(
  overrides: Partial<CreateBattleInitInput> = {},
): CreateBattleInitInput {
  const db = makeBattleTestCardDatabase();
  const { fitModel, draftRecords } = makeCorpus(db);
  const alpha = ALPHA_CARDS.map((n) => nameOf(db, n));
  const baseState = makeBattleTestState();
  // Give the atlas a 7-layer shape so run length resolves from the atlas.
  const state = {
    ...baseState,
    atlas: {
      ...baseState.atlas,
      layers: Array.from({ length: 7 }, (_, i) => [`layer-${String(i)}`]),
    },
  };
  return {
    battleEntryKey: "site-1::0::dreamscape-2",
    site: baseState.atlas.nodes["dreamscape-2"].sites[0],
    state,
    cardDatabase: db,
    dreamcallers: makeDreamcallers(alpha, db),
    poolContext: makePoolContext(db),
    fitModel,
    draftRecords,
    ...overrides,
  };
}

afterEach(() => {
  resetLog();
});

describe("opponent deck pure helpers", () => {
  it("derives the midpoint from the run length (7-layer run midpoint = 3)", () => {
    expect(runMidpointCompletionLevel(7)).toBe(3);
    // Midpoint tracks the layer count rather than a hardcoded number.
    expect(runMidpointCompletionLevel(5)).toBe(2);
    expect(runMidpointCompletionLevel(9)).toBe(4);
  });

  it("only carries a dreamsign at/after the midpoint", () => {
    const layerCount = 7;
    const midpoint = runMidpointCompletionLevel(layerCount);
    for (let level = 0; level < layerCount; level += 1) {
      expect(opponentCarriesDreamsign(level, layerCount)).toBe(level >= midpoint);
    }
  });

  it("scales the distinct count, pick budget, and removals monotonically up, and temperature down", () => {
    const layerCount = 7;
    let prevDistinct = -Infinity;
    let prevBudget = -Infinity;
    let prevRemovals = -Infinity;
    let prevTemp = Infinity;
    for (let level = 0; level < layerCount; level += 1) {
      const distinct = opponentDistinctCardCount(level, layerCount);
      const budget = opponentPickBudget(level, layerCount);
      const removals = opponentRemovalCount(level, layerCount);
      const temp = opponentDraftTemperature(level, layerCount);
      expect(distinct).toBeGreaterThanOrEqual(prevDistinct);
      expect(budget).toBeGreaterThanOrEqual(prevBudget);
      expect(removals).toBeGreaterThanOrEqual(prevRemovals);
      expect(temp).toBeLessThanOrEqual(prevTemp);
      // The pick budget over-drafts: distinct target plus removals.
      expect(budget).toBe(distinct + removals);
      prevDistinct = distinct;
      prevBudget = budget;
      prevRemovals = removals;
      prevTemp = temp;
    }
    // A later battle's deck is strictly wider than the earliest battle's.
    expect(opponentDistinctCardCount(layerCount - 1, layerCount)).toBeGreaterThan(
      opponentDistinctCardCount(0, layerCount),
    );
  });
});

describe("buildOpponentDreamsigns", () => {
  it("returns no dreamsign before the midpoint and exactly one from the midpoint on", () => {
    const layerCount = 7;
    const templates = makeDreamsignTemplates(5);
    const seed = deriveBattleSeed("dreamsign-seed");
    for (let level = 0; level < layerCount; level += 1) {
      const rng = createBattleRngStreams(seed).enemyDescriptor;
      const signs = buildOpponentDreamsigns(level, layerCount, templates, rng);
      if (level < runMidpointCompletionLevel(layerCount)) {
        expect(signs).toHaveLength(0);
      } else {
        expect(signs).toHaveLength(1);
      }
    }
  });
});

describe("createBattleInit opponent invariants", () => {
  it("a later-layer opponent deck is at least as large as an early-layer deck", () => {
    const early = createBattleInit(
      makeInput({ state: { ...makeInput().state, completionLevel: 0 } }),
    );
    const late = createBattleInit(
      makeInput({ state: { ...makeInput().state, completionLevel: 6 } }),
    );
    const earlyDistinct = new Set(
      early.enemyDeckDefinition.map((c) => c.cardNumber),
    ).size;
    const lateDistinct = new Set(
      late.enemyDeckDefinition.map((c) => c.cardNumber),
    ).size;
    expect(lateDistinct).toBeGreaterThan(earlyDistinct);
    expect(late.enemyDeckDefinition.length).toBeGreaterThanOrEqual(
      early.enemyDeckDefinition.length,
    );
    expect(late.enemyDeckDefinition.length).toBeGreaterThanOrEqual(
      MIN_BATTLE_DECK_SIZE,
    );
  });

  it("never runs duplicate cards: the enemy deck is a singleton set at every completion level", () => {
    const layerCount = 7;
    for (let level = 0; level < layerCount; level += 1) {
      const init = createBattleInit(
        makeInput({ state: { ...makeInput().state, completionLevel: level } }),
      );
      const numbers = init.enemyDeckDefinition.map((c) => c.cardNumber);
      // No card number appears twice: distinct count equals total deck length.
      expect(new Set(numbers).size).toBe(numbers.length);
    }
  });

  it("drafts a coherent deck: an alpha-seeded opponent fields mostly alpha cards", () => {
    const db = makeBattleTestCardDatabase();
    const alphaNumbers = new Set(ALPHA_CARDS);
    const init = createBattleInit(
      makeInput({
        cardDatabase: db,
        state: { ...makeInput().state, completionLevel: 6 },
      }),
    );
    const distinct = new Set(init.enemyDeckDefinition.map((c) => c.cardNumber));
    const alphaCount = [...distinct].filter((n) => alphaNumbers.has(n)).length;
    // A coherence-driven, alpha-seeded draft should be dominated by alpha cards,
    // not a 50/50 grab bag across both factions.
    expect(alphaCount).toBeGreaterThan(distinct.size / 2);
  });

  it("is deterministic in the seed and changes with the seed", () => {
    const base = makeInput({ state: { ...makeInput().state, completionLevel: 4 } });
    const a1 = createBattleInit({ ...base, seedOverride: 123 });
    const a2 = createBattleInit({ ...base, seedOverride: 123 });
    const b = createBattleInit({ ...base, seedOverride: 999 });
    const numbers = (init: ReturnType<typeof createBattleInit>): number[] =>
      init.enemyDeckDefinition.map((c) => c.cardNumber);
    expect(numbers(a1)).toEqual(numbers(a2));
    expect(numbers(a1)).not.toEqual(numbers(b));
  });

  it("falls back to a sampled deck when no fit model / corpus is available", () => {
    const init = createBattleInit(
      makeInput({ fitModel: undefined, draftRecords: [] }),
    );
    expect(init.enemyDeckDefinition.length).toBeGreaterThanOrEqual(
      MIN_BATTLE_DECK_SIZE,
    );
    const entry = getLogEntries().find(
      (e) => e.event === "opponent_deck_constructed",
    );
    expect(entry?.builtFromSimulation).toBe(false);
  });

  it("carries no dreamsign before the midpoint and exactly one from the midpoint on", () => {
    const layerCount = 7;
    const midpoint = runMidpointCompletionLevel(layerCount);
    const templates = makeDreamsignTemplates(5);
    for (let level = 0; level < layerCount; level += 1) {
      const init = createBattleInit(
        makeInput({
          state: { ...makeInput().state, completionLevel: level },
          dreamsignTemplates: templates,
        }),
      );
      if (level < midpoint) {
        expect(init.enemyDescriptor.dreamsigns).toHaveLength(0);
      } else {
        expect(init.enemyDescriptor.dreamsigns).toHaveLength(1);
      }
    }
  });

  it("leans the deck toward the dreamscape affiliation (over-represents affiliated cards vs a neutral build)", () => {
    const db = makeBattleTestCardDatabase();
    const { fitModel, draftRecords } = makeCorpus(db);
    const poolContext = makePoolContext(db);
    const { dreamscapes, affiliations, affiliatedNode } =
      makeAffiliationContent(db);

    const alphaNumbers = new Set(ALPHA_CARDS);

    // The Dreamcaller carries no signature, so only the affiliation pulls the
    // deck toward alpha.
    const neutralDreamcallers = makeDreamcallers([]);

    // Aggregate over several battle seeds so the comparison is statistical, not
    // a single-draw coincidence.
    let biasedAlpha = 0;
    let neutralAlpha = 0;
    for (const seedOverride of [1, 7, 13, 21, 42, 99]) {
      const baseState = makeBattleTestState();
      const atlas = {
        ...baseState.atlas,
        nodes: {
          ...baseState.atlas.nodes,
          "affiliated-node": affiliatedNode,
        },
        layers: Array.from({ length: 7 }, (_, i) => [`layer-${String(i)}`]),
      };
      const battleState = {
        ...baseState,
        atlas,
        completionLevel: 4,
        currentDreamscape: "affiliated-node",
      };

      const common = {
        battleEntryKey: "site-1::0::affiliated-node",
        site: baseState.atlas.nodes["dreamscape-2"].sites[0],
        cardDatabase: db,
        dreamcallers: neutralDreamcallers,
        poolContext,
        fitModel,
        draftRecords,
        seedOverride,
        state: battleState,
      };

      const biased = createBattleInit({ ...common, dreamscapes, affiliations });
      // No dreamscapes/affiliations resolves to a neutral, unbiased build.
      const neutral = createBattleInit({ ...common });

      biasedAlpha += new Set(
        biased.enemyDeckDefinition
          .map((c) => c.cardNumber)
          .filter((n) => alphaNumbers.has(n)),
      ).size;
      neutralAlpha += new Set(
        neutral.enemyDeckDefinition
          .map((c) => c.cardNumber)
          .filter((n) => alphaNumbers.has(n)),
      ).size;
    }

    expect(biasedAlpha).toBeGreaterThan(neutralAlpha);
  });

  it("logs opponent_deck_constructed with the coherent-draft reconstruction trace", () => {
    resetLog();
    createBattleInit(
      makeInput({
        state: { ...makeInput().state, completionLevel: 4 },
        dreamsignTemplates: makeDreamsignTemplates(3),
      }),
    );
    const entry = getLogEntries().find(
      (e) => e.event === "opponent_deck_constructed",
    );
    expect(entry).toBeDefined();
    expect(entry?.builtFromSimulation).toBe(true);
    expect(entry?.completionLevel).toBe(4);
    expect(entry?.carriesDreamsign).toBe(true);
    expect(Array.isArray(entry?.dreamsignIds)).toBe(true);
    expect((entry?.dreamsignIds as unknown[]).length).toBe(1);
    expect(typeof entry?.poolSeed).toBe("number");
    // Coherent-draft reconstruction fields.
    expect(typeof entry?.pickBudget).toBe("number");
    expect(typeof entry?.removalCount).toBe("number");
    expect(typeof entry?.coherenceScore).toBe("number");
    expect(typeof entry?.winningDraftIndex).toBe("number");
    expect(Array.isArray(entry?.candidateSummaries)).toBe(true);
    expect((entry?.candidateSummaries as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(entry?.pickTrace)).toBe(true);
    expect((entry?.pickTrace as unknown[]).length).toBeGreaterThan(0);
  });
});
