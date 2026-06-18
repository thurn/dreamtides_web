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
  runMidpointCompletionLevel,
} from "./opponent-deck";
import { createBattleRngStreams, deriveBattleSeed } from "../random";
import { buildNameIndex } from "../../data/cards-v2-database";
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
 * Each is large enough (>= 16 cards) to enter the idf3 corpus, so a steered /
 * affiliated build is statistically distinguishable.
 */
const ALPHA_RANGE = Array.from({ length: 42 }, (_, i) => 1000 + i);
const BETA_RANGE = Array.from({ length: 42 }, (_, i) => 1100 + i);

function nameOf(db: ReadonlyMap<number, CardData>, cardNumber: number): string {
  const card = db.get(cardNumber);
  if (card === undefined) {
    throw new Error(`missing test card #${String(cardNumber)}`);
  }
  return card.name;
}

/**
 * Builds a {@link RunPoolContext} (idf3 corpus) over the battle test database
 * with two disjoint decklists, mirroring the player's pool path. The signature
 * cards passed to the opponent build steer it toward one decklist.
 */
function makePoolContext(): {
  poolContext: RunPoolContext;
  alphaNames: string[];
  betaNames: string[];
} {
  const db = makeBattleTestCardDatabase();
  const nameIndex = buildNameIndex(db);
  const alphaNames = ALPHA_RANGE.slice(0, 20).map((n) => nameOf(db, n));
  const betaNames = BETA_RANGE.slice(0, 20).map((n) => nameOf(db, n));
  const poolCards: PoolCard[] = Array.from(db.values()).map((card) => ({
    name: card.name,
  }));
  const poolData = buildPoolData(poolCards, [alphaNames, betaNames]);
  const poolContext: RunPoolContext = {
    poolData,
    nameIndex,
    allDreamsignPoolIds: [],
    poolVariant: "idf3",
  };
  return { poolContext, alphaNames, betaNames };
}

/**
 * A pool context whose `seed` variant produces a `counts`-based candidate pool
 * spanning both decklists (and no curated `starterDeck`), mirroring the
 * production tides4 path where the simulated pool *is* the candidate set. This
 * leaves room for the affiliation bias to differentially over-represent the
 * affiliated cards, which a single-decklist anchor (idf3) would not.
 */
function makeMixedPoolContext(): RunPoolContext {
  const { poolContext } = makePoolContext();
  return { ...poolContext, poolVariant: "seed" };
}

/**
 * A single-Dreamcaller set steered by the given signature cards, so the opponent
 * descriptor and deck are deterministic.
 */
function makeDreamcallers(
  signatureCards: readonly string[],
): DreamcallerContent[] {
  return [
    {
      id: "opp-dc",
      name: "Opponent Sentinel",
      title: "Rival",
      renderedText: "",
      imageNumber: "001",
      startingEssence: 250,
      signatureCards: [...signatureCards],
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
  const alphaSignatureUuids = ALPHA_RANGE.slice(0, 12).map((n) => {
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

/** Base input wired with a populated (7-layer) atlas so the midpoint resolves. */
function makeInput(
  overrides: Partial<CreateBattleInitInput> = {},
): CreateBattleInitInput {
  const { poolContext, alphaNames } = makePoolContext();
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
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeDreamcallers(alphaNames),
    poolContext,
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

  it("scales the distinct card count monotonically with run progress", () => {
    const layerCount = 7;
    let previous = -Infinity;
    for (let level = 0; level < layerCount; level += 1) {
      const count = opponentDistinctCardCount(level, layerCount);
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
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

  it("leans the deck toward the dreamscape affiliation (over-represents affiliated cards vs an unbiased build)", () => {
    const db = makeBattleTestCardDatabase();
    const poolContext = makeMixedPoolContext();
    const { dreamscapes, affiliations, affiliatedNode } =
      makeAffiliationContent(db);

    const alphaNumbers = new Set(
      ALPHA_RANGE.map((n) => poolContext.nameIndex.get(nameOf(db, n))),
    );

    // The Dreamcaller carries no signature, so the simulated pool is not itself
    // steered toward the affiliation's cards — the only thing pulling the deck
    // toward alpha is the affiliation bias under test.
    const neutralDreamcallers = makeDreamcallers([]);

    // Aggregate over several battle seeds so the comparison is statistical, not
    // a single-draw coincidence.
    let biasedAlpha = 0;
    let unbiasedAlpha = 0;
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

      const biased = createBattleInit({
        ...makeInput(),
        cardDatabase: db,
        poolContext,
        dreamcallers: neutralDreamcallers,
        dreamscapes,
        affiliations,
        seedOverride,
        state: battleState,
      });
      const unbiased = createBattleInit({
        ...makeInput(),
        cardDatabase: db,
        poolContext,
        dreamcallers: neutralDreamcallers,
        // No dreamscapes/affiliations resolves to a neutral, unbiased build.
        seedOverride,
        state: battleState,
      });

      biasedAlpha += biased.enemyDeckDefinition.filter((c) =>
        alphaNumbers.has(c.cardNumber),
      ).length;
      unbiasedAlpha += unbiased.enemyDeckDefinition.filter((c) =>
        alphaNumbers.has(c.cardNumber),
      ).length;
    }

    expect(biasedAlpha).toBeGreaterThan(unbiasedAlpha);
  });

  it("logs opponent_deck_constructed with reconstruction fields", () => {
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
  });
});
