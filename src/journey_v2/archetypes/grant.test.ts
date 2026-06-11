import { describe, expect, it } from "vitest";
import type { FitModel } from "../../draft/replay/fit-model";
import { applyMerchantPayloadToState } from "../encounter/resolveMerchantOffer";
import { merchantRng } from "../signals/rng";
import { MERCHANT_TUNING } from "../tuning";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestFitModel,
  makeMerchantTestQuestState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type { CardData } from "../../types/cards";
import type { MerchantContext, MerchantChoiceCandidate } from "../types";
import { buildCategoryUniverse } from "./categories";
import {
  cardBundleBuilder,
  categoryDraftKnownBuilder,
  copiesDraftBuilder,
  fitCardDraftBuilder,
  fitCardGrantBuilder,
  strongCardBuilder,
  transfiguredDraftBuilder,
} from "./grant";

// A simple deterministic UUID generator for fixtures.
function uuid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

/**
 * Builds a fixture pool of `poolSize` non-starter cards (cardNumber 100+) plus
 * a few starter cards, with controllable quality/multiplicity per card.
 */
function makePoolCards(poolSize: number): CardData[] {
  const cards: CardData[] = [];
  for (let i = 0; i < poolSize; i += 1) {
    const n = 100 + i;
    cards.push(
      makeMerchantTestCard({
        id: uuid(n),
        cardNumber: n,
        name: `Pool ${String(n)}`,
        energyCost: 2,
        spark: 2,
      }),
    );
  }
  return cards;
}

/**
 * A fit model that returns a deterministic, monotonic fit/cooccur/prior keyed
 * by a per-name table. Names map to numbers via `nameIndex`. We synthesize the
 * model fields the merchant fit signal reads.
 */
function makeRankedFitModel(cards: readonly CardData[]): FitModel {
  const model = makeMerchantTestFitModel();
  const numberToName = new Map<number, string>();
  const nameIndex = new Map<string, number>();
  const prior = new Map<string, number>();
  for (const card of cards) {
    numberToName.set(card.cardNumber, card.name);
    nameIndex.set(card.name, card.cardNumber);
    // Higher cardNumber -> higher prior so fit ranking is deterministic.
    prior.set(card.name, card.cardNumber / 100000);
  }
  return {
    ...model,
    numberToName,
    nameIndex,
    prior,
    tuning: { ...model.tuning, alpha: 0, beta: 0, gamma: 1 },
  };
}

function makeContext(input: {
  poolCards: readonly CardData[];
  deckEntries?: { entryId: string; cardNumber: number }[];
  corpusCards?: Record<string, { quality: number; multiplicity?: number }>;
  fitModel?: FitModel;
}): MerchantContext {
  const fitModel = input.fitModel;
  const questContent = makeMerchantTestContent({
    cards: input.poolCards,
    fitModel,
    merchantCorpus: makeMerchantTestCorpus({ cards: input.corpusCards ?? {} }),
  });
  const deck = (input.deckEntries ?? []).map((e) =>
    makeMerchantTestDeckEntry({ entryId: e.entryId, cardNumber: e.cardNumber }),
  );
  const questState = makeMerchantTestQuestState({ deck });
  return buildMerchantContext({
    questState,
    questContent,
    site: makeMerchantTestSite(),
  });
}

describe("grant family — fit_card_grant", () => {
  it("excludes owned cards from candidates over 20 seeds", () => {
    const pool = makePoolCards(10);
    const ownedNumber = pool[0].cardNumber;
    const deckEntries = Array.from({ length: 6 }, (_, i) => ({
      entryId: `deck-${String(i)}`,
      cardNumber: ownedNumber,
    }));
    const fitModel = makeRankedFitModel(pool);
    const context = makeContext({ poolCards: pool, deckEntries, fitModel });
    for (let seed = 0; seed < 20; seed += 1) {
      const draft = fitCardGrantBuilder.build(
        context,
        merchantRng("seed", String(seed)),
      );
      expect(draft).not.toBeNull();
      expect(draft?.targetKey).not.toBe(uuid(ownedNumber));
    }
  });

  it("is ineligible below minDeckForFit and eligible at it", () => {
    const pool = makePoolCards(10);
    const small = makeContext({
      poolCards: pool,
      deckEntries: Array.from({ length: 5 }, (_, i) => ({
        entryId: `d${String(i)}`,
        cardNumber: 100 + i,
      })),
      fitModel: makeRankedFitModel(pool),
    });
    expect(fitCardGrantBuilder.eligible(small)).toBe(false);

    const big = makeContext({
      poolCards: pool,
      deckEntries: Array.from({ length: MERCHANT_TUNING.minDeckForFit }, (_, i) => ({
        entryId: `d${String(i)}`,
        cardNumber: 100 + i,
      })),
      fitModel: makeRankedFitModel(pool),
    });
    expect(fitCardGrantBuilder.eligible(big)).toBe(true);
  });
});

describe("grant family — fit_card_draft", () => {
  it("offers 4 distinct unowned candidates above the band floor over 20 seeds", () => {
    const pool = makePoolCards(12);
    const fitModel = makeRankedFitModel(pool);
    const deckEntries = Array.from({ length: 6 }, (_, i) => ({
      entryId: `deck-${String(i)}`,
      cardNumber: 200 + i, // deck cards not in pool, so nothing is owned in pool
    }));
    const deckCards = deckEntries.map((e) =>
      makeMerchantTestCard({ id: uuid(e.cardNumber), cardNumber: e.cardNumber }),
    );
    const allCards = [...pool, ...deckCards];
    const context = makeContext({
      poolCards: allCards,
      deckEntries,
      fitModel: makeRankedFitModel(allCards),
    });

    for (let seed = 0; seed < 20; seed += 1) {
      const draft = fitCardDraftBuilder.build(
        context,
        merchantRng("seed", String(seed)),
      );
      expect(draft).not.toBeNull();
      const candidates = draft?.choiceRequest?.candidates ?? [];
      expect(candidates.length).toBe(4);
      const uuids = candidates.map((c) => c.cardUuid);
      expect(new Set(uuids).size).toBe(4);
    }
    void fitModel;
  });
});

describe("grant family — copies_draft", () => {
  it("offers 4 distinct unowned candidates and adds exactly 2 deck entries through apply", () => {
    const pool = makePoolCards(8);
    const corpusCards: Record<string, { quality: number }> = {};
    for (const card of pool) {
      corpusCards[card.id] = { quality: 0.5 };
    }
    const deckEntries = Array.from({ length: 6 }, (_, i) => ({
      entryId: `deck-${String(i)}`,
      cardNumber: 300 + i,
    }));
    const deckCards = deckEntries.map((e) =>
      makeMerchantTestCard({ id: uuid(e.cardNumber), cardNumber: e.cardNumber }),
    );
    const allCards = [...pool, ...deckCards];
    const context = makeContext({
      poolCards: allCards,
      deckEntries,
      corpusCards,
      fitModel: makeRankedFitModel(allCards),
    });

    const draft = copiesDraftBuilder.build(context, merchantRng("copies"));
    expect(draft).not.toBeNull();
    const candidates = draft?.choiceRequest?.candidates ?? [];
    expect(candidates.length).toBe(4);
    // All distinct, none owned (deck cards are 300+, pool is 100+).
    const uuids = candidates.map((c) => c.cardUuid);
    expect(new Set(uuids).size).toBe(4);
    for (const c of candidates) {
      expect(deckEntries.some((e) => uuid(e.cardNumber) === c.cardUuid)).toBe(false);
    }

    const candidate = candidates[0];
    expect(candidate).toBeDefined();
    const questContent = makeMerchantTestContent({ cards: allCards });
    const questState = makeMerchantTestQuestState({
      deck: deckEntries.map((e) =>
        makeMerchantTestDeckEntry({ entryId: e.entryId, cardNumber: e.cardNumber }),
      ),
    });
    const next = applyMerchantPayloadToState({
      state: questState,
      questContent,
      payload: candidate.applyPayload,
    });
    expect(next).not.toBeNull();
    const added = (next?.deck ?? []).filter(
      (entry) => entry.cardNumber === candidate.cardNumber,
    );
    expect(added.length).toBe(2);
  });

  it("is eligible cold-start (deck < minDeckForFit) when the pool band holds 4 cards", () => {
    // No multiplicity data and a small deck: copies_draft falls back to a
    // quality band so it is not dead early.
    const pool = makePoolCards(8);
    const corpusCards: Record<string, { quality: number }> = {};
    pool.forEach((card, i) => {
      corpusCards[card.id] = { quality: i / pool.length };
    });
    const context = makeContext({
      poolCards: pool,
      deckEntries: [],
      corpusCards,
      fitModel: makeRankedFitModel(pool),
    });
    expect(copiesDraftBuilder.eligible(context)).toBe(true);
    const draft = copiesDraftBuilder.build(context, merchantRng("copies-cold"));
    expect(draft?.choiceRequest?.candidates.length).toBe(4);
  });

  it("is ineligible when the unowned pool band is smaller than 4", () => {
    const pool = makePoolCards(3);
    const corpusCards: Record<string, { quality: number }> = {};
    for (const card of pool) corpusCards[card.id] = { quality: 0.5 };
    const context = makeContext({
      poolCards: pool,
      deckEntries: [],
      corpusCards,
      fitModel: makeRankedFitModel(pool),
    });
    expect(copiesDraftBuilder.eligible(context)).toBe(false);
  });
});

describe("grant family — category_draft_known", () => {
  it("never offers a card outside the sampled category over 30 seeds", () => {
    const threshold = MERCHANT_TUNING.subtypeMinPoolCards;
    const warriors: CardData[] = [];
    for (let i = 0; i < threshold; i += 1) {
      warriors.push(
        makeMerchantTestCard({
          id: uuid(100 + i),
          cardNumber: 100 + i,
          subtype: "Warrior",
        }),
      );
    }
    // A pile of Events so a different category also exists, none Warriors.
    const events: CardData[] = [];
    for (let i = 0; i < threshold; i += 1) {
      events.push(
        makeMerchantTestCard({
          id: uuid(300 + i),
          cardNumber: 300 + i,
          cardType: "Event",
          subtype: "Spell",
          spark: null,
        }),
      );
    }
    const allCards = [...warriors, ...events];
    const context = makeContext({
      poolCards: allCards,
      fitModel: makeRankedFitModel(allCards),
    });
    expect(categoryDraftKnownBuilder.eligible(context)).toBe(true);

    // Recover the membership of each category id to validate against the
    // actually-sampled category (the targetKey is `${categoryId}:uuids`).
    const universe = buildCategoryUniverse(context);
    const membersById = new Map(
      universe.map((c) => [c.id, new Set(c.memberUuids)]),
    );

    for (let seed = 0; seed < 30; seed += 1) {
      const draft = categoryDraftKnownBuilder.build(
        context,
        merchantRng("cat", String(seed)),
      );
      expect(draft).not.toBeNull();
      const candidates = draft?.choiceRequest?.candidates ?? [];
      expect(candidates.length).toBe(4);
      const targetKey = draft?.targetKey ?? "";
      const categoryId = targetKey.slice(0, targetKey.lastIndexOf(":"));
      const members = membersById.get(categoryId);
      expect(members).toBeDefined();
      for (const c of candidates) {
        expect(members?.has(c.cardUuid ?? "")).toBe(true);
      }
    }
  });
});

describe("grant family — card_bundle", () => {
  it("produces distinct, unowned cards whose pairwise coocNorm beats the pool mean", () => {
    // 12 pool cards. The first 6 form a tight cluster (high mutual coocNorm)
    // and strong prior, so the whole fit band (top 5) is cluster cards and the
    // seed always lands inside the cluster; the rest barely co-occur.
    const pool = makePoolCards(12);
    const clusterCards = pool.slice(0, 6);
    const clusterNames = new Set(clusterCards.map((c) => c.name));

    // Build a fit model with an explicit coocNorm matrix.
    const fitModel = makeRankedFitModel(pool);
    const coocNorm = new Map<string, Map<string, number>>();
    for (const a of pool) {
      const row = new Map<string, number>();
      for (const b of pool) {
        if (a.name === b.name) continue;
        const both = clusterNames.has(a.name) && clusterNames.has(b.name);
        row.set(b.name, both ? 0.9 : 0.01);
      }
      coocNorm.set(a.name, row);
    }
    // Give the cluster a strong fit prior so the seed lands in the cluster.
    const prior = new Map<string, number>();
    for (const card of pool) {
      prior.set(card.name, clusterNames.has(card.name) ? 1 : 0.01);
    }
    const model: FitModel = {
      ...fitModel,
      coocNorm,
      prior,
      tuning: { ...fitModel.tuning, alpha: 0, beta: 0, gamma: 1 },
    };

    const deckEntries = Array.from({ length: 6 }, (_, i) => ({
      entryId: `deck-${String(i)}`,
      cardNumber: 200 + i,
    }));
    const deckCards = deckEntries.map((e) =>
      makeMerchantTestCard({ id: uuid(e.cardNumber), cardNumber: e.cardNumber }),
    );
    const allCards = [...pool, ...deckCards];
    // Re-register the deck cards in the model so the deck does not corrupt fit.
    const fullModel: FitModel = {
      ...model,
      numberToName: new Map(allCards.map((c) => [c.cardNumber, c.name])),
      nameIndex: new Map(allCards.map((c) => [c.name, c.cardNumber])),
    };

    const context = makeContext({
      poolCards: allCards,
      deckEntries,
      fitModel: fullModel,
    });

    // Pool mean pairwise coocNorm.
    let total = 0;
    let pairs = 0;
    for (const a of pool) {
      for (const b of pool) {
        if (a.name === b.name) continue;
        total += coocNorm.get(a.name)?.get(b.name) ?? 0;
        pairs += 1;
      }
    }
    const poolMean = total / pairs;

    let coherentSeeds = 0;
    let evaluated = 0;
    for (let seed = 0; seed < 20; seed += 1) {
      const draft = cardBundleBuilder.build(
        context,
        merchantRng("bundle", String(seed)),
      );
      expect(draft).not.toBeNull();
      const objects = draft?.gameObjects ?? [];
      const uuids = objects
        .map((o) => (o.objectType === "catalogCard" ? o.cardUuid : ""))
        .filter((u) => u.length > 0);
      // Distinct and unowned.
      expect(new Set(uuids).size).toBe(uuids.length);
      for (const u of uuids) {
        expect(deckEntries.some((e) => uuid(e.cardNumber) === u)).toBe(false);
      }
      if (uuids.length < 2) continue;
      evaluated += 1;
      const names = uuids.map(
        (u) => allCards.find((c) => c.id === u)?.name ?? "",
      );
      let bSum = 0;
      let bPairs = 0;
      for (const x of names) {
        for (const y of names) {
          if (x === y) continue;
          bSum += coocNorm.get(x)?.get(y) ?? 0;
          bPairs += 1;
        }
      }
      if (bPairs > 0 && bSum / bPairs > poolMean) coherentSeeds += 1;
    }
    expect(evaluated).toBeGreaterThan(0);
    // The grow step pulls cluster partners, so bundles should be coherent.
    expect(coherentSeeds).toBe(evaluated);
  });
});

describe("grant family — transfigured_draft", () => {
  it("accept yields a deck entry with the transfiguration set", () => {
    // Characters with positive spark -> Scarlet eligible.
    const pool: CardData[] = [];
    for (let i = 0; i < 8; i += 1) {
      pool.push(
        makeMerchantTestCard({
          id: uuid(100 + i),
          cardNumber: 100 + i,
          cardType: "Character",
          spark: 2,
        }),
      );
    }
    const deckEntries = Array.from({ length: 6 }, (_, i) => ({
      entryId: `deck-${String(i)}`,
      cardNumber: 300 + i,
    }));
    const deckCards = deckEntries.map((e) =>
      makeMerchantTestCard({ id: uuid(e.cardNumber), cardNumber: e.cardNumber }),
    );
    const allCards = [...pool, ...deckCards];
    const context = makeContext({
      poolCards: allCards,
      deckEntries,
      fitModel: makeRankedFitModel(allCards),
    });
    expect(transfiguredDraftBuilder.eligible(context)).toBe(true);

    const draft = transfiguredDraftBuilder.build(context, merchantRng("tf"));
    expect(draft).not.toBeNull();
    const candidate = draft?.choiceRequest?.candidates[0] as MerchantChoiceCandidate;
    expect(candidate.applyPayload.kind).toBe("add_catalog_card");

    const questContent = makeMerchantTestContent({ cards: allCards });
    const questState = makeMerchantTestQuestState({
      deck: deckEntries.map((e) =>
        makeMerchantTestDeckEntry({ entryId: e.entryId, cardNumber: e.cardNumber }),
      ),
    });
    const next = applyMerchantPayloadToState({
      state: questState,
      questContent,
      payload: candidate.applyPayload,
    });
    expect(next).not.toBeNull();
    const added = (next?.deck ?? []).find(
      (entry) => entry.cardNumber === candidate.cardNumber,
    );
    expect(added).toBeDefined();
    expect(added?.transfiguration).not.toBeNull();
  });
});

describe("grant family — strong_card", () => {
  // A fit model whose play-rate prior (the only fit term that survives an empty
  // deck) spikes on ONE designated card and is zero elsewhere. At cold start the
  // fit signal is exactly this popularity, so the spiked card is what a
  // fit-blending strong_card would over-reward — the case the cold-start guard
  // exists to neutralize.
  function makeSpikedFitModel(
    cards: readonly CardData[],
    spikeCardNumber: number,
  ): FitModel {
    const model = makeMerchantTestFitModel();
    const numberToName = new Map<number, string>();
    const nameIndex = new Map<string, number>();
    const prior = new Map<string, number>();
    for (const card of cards) {
      numberToName.set(card.cardNumber, card.name);
      nameIndex.set(card.name, card.cardNumber);
      prior.set(card.name, card.cardNumber === spikeCardNumber ? 1 : 0);
    }
    return {
      ...model,
      numberToName,
      nameIndex,
      prior,
      tuning: { ...model.tuning, alpha: 0, beta: 0, gamma: 1 },
    };
  }

  function makeStrongPool(): { pool: CardData[]; corpus: Record<string, { quality: number }> } {
    // 40 cards so the 0.15 band (6 cards) is a true subset of the pool, and each
    // a distinct quality so the quality ranking is strict. Quality ascends with
    // index, so cardNumber 100 is the worst and 139 the best.
    const pool = makePoolCards(40);
    const corpus: Record<string, { quality: number }> = {};
    pool.forEach((card, i) => {
      corpus[card.id] = { quality: (i + 1) / pool.length };
    });
    return { pool, corpus };
  }

  it("is eligible cold-start with a non-empty unowned pool", () => {
    const { pool, corpus } = makeStrongPool();
    const context = makeContext({
      poolCards: pool,
      deckEntries: [],
      corpusCards: corpus,
      fitModel: makeSpikedFitModel(pool, 120),
    });
    expect(strongCardBuilder.eligible(context)).toBe(true);
    const offer = strongCardBuilder.build(context, merchantRng("strong-cold"));
    expect(offer).not.toBeNull();
  });

  it("never hands a cold-start deck a popular mid-quality card", () => {
    // cardNumber 120 sits at quality rank ~20 of 40 — nowhere near the top-6
    // quality band — but is the single most popular card. Blending fit in would
    // crack it into the band; the cold-start guard ranks on quality alone, so it
    // can never be offered until the deck is large enough for fit to be real.
    const { pool, corpus } = makeStrongPool();
    const context = makeContext({
      poolCards: pool,
      deckEntries: [],
      corpusCards: corpus,
      fitModel: makeSpikedFitModel(pool, 120),
    });
    const spikedUuid = pool.find((c) => c.cardNumber === 120)?.id;
    expect(spikedUuid).toBeDefined();

    for (let seed = 0; seed < 60; seed += 1) {
      const offer = strongCardBuilder.build(
        context,
        merchantRng("strong-cold-spike", String(seed)),
      );
      expect(offer).not.toBeNull();
      expect(offer?.targetKey).not.toBe(spikedUuid);
    }
  });

  it("cold-start only ever offers a top-quality card, never a low-quality one", () => {
    const { pool, corpus } = makeStrongPool();
    const context = makeContext({
      poolCards: pool,
      deckEntries: [],
      corpusCards: corpus,
      fitModel: makeSpikedFitModel(pool, 105),
    });
    // Bottom-half-quality cards must never be the band's pick at cold start,
    // even when one of them (cardNumber 105) is the most popular card.
    const lowQualityUuids = new Set(
      pool.slice(0, pool.length / 2).map((card) => card.id),
    );
    for (let seed = 0; seed < 40; seed += 1) {
      const offer = strongCardBuilder.build(
        context,
        merchantRng("strong-cold-quality", String(seed)),
      );
      expect(offer).not.toBeNull();
      if (offer === null) continue;
      expect(lowQualityUuids.has(offer.targetKey ?? "")).toBe(false);
    }
  });
});
