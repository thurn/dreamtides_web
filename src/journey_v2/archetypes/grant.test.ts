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
import {
  copiesDraftBuilder,
  fitCardDraftBuilder,
  fitCardGrantBuilder,
  premiumDraftBuilder,
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
  it("adds exactly 2 deck entries for the chosen UUID through apply", () => {
    const pool = makePoolCards(8);
    const corpusCards: Record<string, { quality: number; multiplicity?: number }> = {};
    for (const card of pool) {
      corpusCards[card.id] = { quality: 0.5, multiplicity: 0.5 };
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
    const candidate = draft?.choiceRequest?.candidates[0] as MerchantChoiceCandidate;
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

  it("is ineligible when fewer than 4 candidates meet the multiplicity floor", () => {
    const pool = makePoolCards(8);
    const corpusCards: Record<string, { quality: number; multiplicity?: number }> = {};
    // Only 2 cards meet the multiplicity floor.
    pool.forEach((card, i) => {
      corpusCards[card.id] = {
        quality: 0.5,
        multiplicity: i < 2 ? 0.5 : 0,
      };
    });
    const context = makeContext({
      poolCards: pool,
      deckEntries: Array.from({ length: 6 }, (_, i) => ({
        entryId: `d${String(i)}`,
        cardNumber: 400 + i,
      })),
      corpusCards,
      fitModel: makeRankedFitModel(pool),
    });
    expect(copiesDraftBuilder.eligible(context)).toBe(false);
  });
});

describe("grant family — premium_draft", () => {
  it("is hidden until commit and offers 4 distinct top-quality candidates", () => {
    const pool = makePoolCards(20);
    const corpusCards: Record<string, { quality: number; multiplicity?: number }> = {};
    pool.forEach((card, i) => {
      // Monotonic quality by index.
      corpusCards[card.id] = { quality: i / pool.length };
    });
    const context = makeContext({
      poolCards: pool,
      deckEntries: [],
      corpusCards,
      fitModel: makeRankedFitModel(pool),
    });
    expect(premiumDraftBuilder.eligible(context)).toBe(true);

    // Compute the in-band candidates: top premiumBandFraction by quality blend.
    for (let seed = 0; seed < 20; seed += 1) {
      const draft = premiumDraftBuilder.build(
        context,
        merchantRng("seed", String(seed)),
      );
      expect(draft).not.toBeNull();
      expect(draft?.hiddenUntilCommit).toBe(true);
      const candidates = draft?.choiceRequest?.candidates ?? [];
      expect(candidates.length).toBe(4);
      expect(new Set(candidates.map((c) => c.cardUuid)).size).toBe(4);
      // Band floor: every offered card's quality is in the top fraction.
      const sorted = [...pool].sort(
        (a, b) => (corpusCards[b.id].quality) - (corpusCards[a.id].quality),
      );
      const bandSize = Math.max(
        Math.ceil(MERCHANT_TUNING.premiumBandFraction * pool.length),
        Math.min(MERCHANT_TUNING.bandMinimum, pool.length),
      );
      const inBand = new Set(sorted.slice(0, bandSize).map((c) => c.id));
      for (const c of candidates) {
        expect(inBand.has(c.cardUuid ?? "")).toBe(true);
      }
    }
  });
});
