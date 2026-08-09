import { describe, expect, it } from "vitest";
import { fitLooByEntry } from "../signals/fit";
import { merchantRng } from "../signals/rng";
import { buildMerchantContext } from "../context/buildMerchantContext";
import {
  makeMerchantTestCard,
  makeMerchantTestContent,
  makeMerchantTestCorpus,
  makeMerchantTestDeckEntry,
  makeMerchantTestJourneyState,
  makeMerchantTestSite,
} from "../testing/fixtures";
import type { CardData } from "../../types/cards";
import type { DeckEntry } from "../../types/journey";
import type { FitModel } from "../../draft/fit-model";
import type { MerchantContext } from "../types";
import { purgeBuilder } from "./remove";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardId } from "../../types/card-identity";
import { NIGHTMARE_CARD_ID, NIGHTMARE_CARD_NAME } from "../../data/nightmare";

function uuid(n: number): CardId {
  const hex = n.toString(16).padStart(12, "0");
  return asCardId(`00000000-0000-4000-8000-${hex}`);
}

/**
 * Builds a merchant context from explicit card + deck-entry fixtures.
 */
function makeContext(input: {
  cards: readonly CardData[];
  deckEntries: readonly DeckEntry[];
  corpusCards?: Record<
    string,
    { quality: number; multiplicity?: number; df?: number }
  >;
  fitModel?: FitModel;
  poolCards?: readonly CardData[];
}): MerchantContext {
  // Pool cards are all cards passed; the context filters by isGrantCandidate.
  const allCards = [...input.cards, ...(input.poolCards ?? [])];
  const journeyContent = makeMerchantTestContent({
    cards: allCards,
    fitModel: input.fitModel,
    merchantCorpus: makeMerchantTestCorpus({ cards: input.corpusCards ?? {} }),
  });
  const journeyState = makeMerchantTestJourneyState({ deck: [...input.deckEntries] });
  return buildMerchantContext({
    journeyState,
    journeyContent,
    site: makeMerchantTestSite(),
  });
}

// ---------------------------------------------------------------------------
// Bug-class: purge never selects Nightmare
// ---------------------------------------------------------------------------

describe("purge — Nightmare exclusion", () => {
  it("never selects a Nightmare entry as the purge target", () => {
    // Deck of 8: one ordinary starter + Nightmare + 6 non-starters.
    // The ordinary starter is the normal purge target; Nightmare is excluded.

    const ordinaryStarterCard = makeMerchantTestCard({
      id: uuid(1),
      cardNumber: 1,
      isStarter: true,
    });
    const nightmareCard = makeMerchantTestCard({
      id: NIGHTMARE_CARD_ID,
      name: asCardName(NIGHTMARE_CARD_NAME),
      cardNumber: 10002,
      cardType: "Event",
      subtype: "Special",
    });
    const nonStarterCards = Array.from({ length: 6 }, (_, i) =>
      makeMerchantTestCard({ id: uuid(10 + i), cardNumber: 10 + i }),
    );

    const ordinaryStarterEntry = makeMerchantTestDeckEntry({
      entryId: "ordinary-starter",
      cardNumber: 1,
      isBane: false,
    });
    const nightmareEntry = makeMerchantTestDeckEntry({
      entryId: "nightmare-entry",
      cardNumber: 10002,
      isBane: true,
    });
    const nonStarterEntries = nonStarterCards.map((c, i) =>
      makeMerchantTestDeckEntry({ entryId: `e${String(i)}`, cardNumber: c.cardNumber }),
    );

    // Corpus for all cards
    const corpusCards: Record<string, { quality: number; df: number }> = {};
    corpusCards[uuid(1)] = { quality: 0.5, df: 10 };
    corpusCards[NIGHTMARE_CARD_ID] = { quality: 0.5, df: 10 };
    nonStarterCards.forEach((c) => {
      corpusCards[c.id] = { quality: 0.5, df: 10 };
    });

    const context = makeContext({
      cards: [ordinaryStarterCard, nightmareCard, ...nonStarterCards],
      deckEntries: [ordinaryStarterEntry, nightmareEntry, ...nonStarterEntries],
      corpusCards,
    });

    expect(purgeBuilder.eligible(context)).toBe(true);

    // Over multiple seeds, confirm Nightmare is never selected.
    for (let seed = 0; seed < 30; seed += 1) {
      const rng = merchantRng("purge-nightmare-test", String(seed));
      const offer = purgeBuilder.build(context, rng);
      if (offer !== null && offer.applyPayload !== undefined) {
        if (offer.applyPayload.kind === "remove_deck_entry") {
          expect(offer.applyPayload.entryId).not.toBe("nightmare-entry");
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Bug-class: purge never selects a no-corpus-signal non-starter
// ---------------------------------------------------------------------------

describe("purge — no-corpus-signal non-starter exclusion", () => {
  it("never selects a non-starter entry whose card has no corpus signal", () => {
    // A non-starter with NO corpus signal: should never be a purge candidate.
    // We need 8 deck cards; one non-starter has no signal, rest do.
    const noSignalCard = makeMerchantTestCard({
      id: uuid(200),
      cardNumber: 200,
      isStarter: false,
    });

    // Other 7 cards: starters (always in candidate set)
    const starterCards = Array.from({ length: 7 }, (_, i) =>
      makeMerchantTestCard({
        id: uuid(201 + i),
        cardNumber: 201 + i,
        isStarter: true,
      }),
    );

    const noSignalEntry = makeMerchantTestDeckEntry({
      entryId: "no-signal-entry",
      cardNumber: 200,
    });
    const starterEntries = starterCards.map((c, i) =>
      makeMerchantTestDeckEntry({ entryId: `se${String(i)}`, cardNumber: c.cardNumber }),
    );

    // Corpus: only the starters have corpus signal; no-signal card is absent
    const corpusCards: Record<string, { quality: number; df: number }> = {};
    starterCards.forEach((c) => {
      corpusCards[c.id] = { quality: 0.5, df: 10 };
    });
    // noSignalCard is intentionally absent from corpusCards

    const context = makeContext({
      cards: [noSignalCard, ...starterCards],
      deckEntries: [noSignalEntry, ...starterEntries],
      corpusCards,
    });

    expect(purgeBuilder.eligible(context)).toBe(true);

    for (let seed = 0; seed < 30; seed += 1) {
      const rng = merchantRng("purge-nosignal-test", String(seed));
      const offer = purgeBuilder.build(context, rng);
      if (offer !== null && offer.applyPayload !== undefined) {
        if (offer.applyPayload.kind === "remove_deck_entry") {
          expect(offer.applyPayload.entryId).not.toBe("no-signal-entry");
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Bug-class: purge target selection stays inside the prepared band
// ---------------------------------------------------------------------------

describe("purge — deterministic band selection", () => {
  it("yields >= 2 distinct targets on a deck with 1 starter + 3 bottom-band misfits", () => {
    // Deck: 8 cards total
    // 1 starter (always a candidate)
    // 3 bottom-band non-starters with low LOO scores (candidates via purgeMisfitFraction)
    // 4 non-starters with high LOO scores (not candidates)
    //
    // We use a tiny FitModel with explicit co-occurrence so the LOO scores
    // are fully controlled.

    const starterCard = makeMerchantTestCard({
      id: uuid(300),
      cardNumber: 300,
      isStarter: true,
    });

    // 3 misfits: low co-occurrence with the rest of the deck
    const misfitCards = [
      makeMerchantTestCard({ id: uuid(301), cardNumber: 301 }),
      makeMerchantTestCard({ id: uuid(302), cardNumber: 302 }),
      makeMerchantTestCard({ id: uuid(303), cardNumber: 303 }),
    ];

    // 4 good fit cards
    const goodCards = [
      makeMerchantTestCard({ id: uuid(304), cardNumber: 304 }),
      makeMerchantTestCard({ id: uuid(305), cardNumber: 305 }),
      makeMerchantTestCard({ id: uuid(306), cardNumber: 306 }),
      makeMerchantTestCard({ id: uuid(307), cardNumber: 307 }),
    ];

    const allCards = [starterCard, ...misfitCards, ...goodCards];
    const deckEntries = [
      makeMerchantTestDeckEntry({ entryId: "starter-e", cardNumber: 300 }),
      makeMerchantTestDeckEntry({ entryId: "misfit-e1", cardNumber: 301 }),
      makeMerchantTestDeckEntry({ entryId: "misfit-e2", cardNumber: 302 }),
      makeMerchantTestDeckEntry({ entryId: "misfit-e3", cardNumber: 303 }),
      makeMerchantTestDeckEntry({ entryId: "good-e1", cardNumber: 304 }),
      makeMerchantTestDeckEntry({ entryId: "good-e2", cardNumber: 305 }),
      makeMerchantTestDeckEntry({ entryId: "good-e3", cardNumber: 306 }),
      makeMerchantTestDeckEntry({ entryId: "good-e4", cardNumber: 307 }),
    ];

    // Build a FitModel where misfits have near-zero co-occurrence with others,
    // good cards have high co-occurrence with each other.
    // Card names (for the model) = uuid strings
    const allNames = allCards.map((c) => c.id);
    const idf = new Map<string, number>(allNames.map((n) => [n, 1]));
    const prior = new Map<string, number>(allNames.map((n) => [n, 0.5]));

    // Build coocNorm: misfits co-occur ~0 with good cards; good cards ~0.9 with each other
    const coocNorm = new Map<string, Map<string, number>>();
    for (const a of allNames) {
      const row = new Map<string, number>();
      for (const b of allNames) {
        if (a === b) {
          row.set(b, 0);
          continue;
        }
        const aIsGood = goodCards.some((c) => c.id === a);
        const bIsGood = goodCards.some((c) => c.id === b);
        if (aIsGood && bIsGood) {
          row.set(b, 0.9);
        } else {
          row.set(b, 0.01); // misfits barely co-occur with anything
        }
      }
      coocNorm.set(a, row);
    }

    // numberToId: cardNumber -> lowercased card id (the model's key space).
    const numberToId = new Map<number, string>(
      allCards.map((c) => [c.cardNumber, c.id]),
    );
    const idIndex = new Map<string, number>(
      allCards.map((c) => [c.id, c.cardNumber]),
    );

    const fitModel: FitModel = {
      decks: [],
      idf,
      prior,
      coocNorm,
      numberToId,
      idIndex,
      tuning: {
        alpha: 1,
        beta: 1,
        gamma: 1,
        K: 1,
        idfPower: 1,
        minDf: 1,
        maxDfFrac: 1,
        minDeckSize: 1,
        maxDeckSize: 99,
      },
    };

    // Corpus: all cards have signal
    const corpusCards: Record<string, { quality: number; df: number }> = {};
    allCards.forEach((c) => {
      corpusCards[c.id] = { quality: 0.5, df: 10 };
    });

    const context = makeContext({
      cards: allCards,
      deckEntries,
      corpusCards,
      fitModel,
    });

    // Verify that misfits actually have lower LOO scores
    const looScores = fitLooByEntry(context.deckCards, fitModel);
    const misfitLoos = ["misfit-e1", "misfit-e2", "misfit-e3"].map(
      (id) => looScores.get(id) ?? 0,
    );
    const goodLoos = ["good-e1", "good-e2", "good-e3", "good-e4"].map(
      (id) => looScores.get(id) ?? 0,
    );
    const maxMisfit = Math.max(...misfitLoos);
    const minGood = Math.min(...goodLoos);
    expect(maxMisfit).toBeLessThan(minGood);

    expect(purgeBuilder.eligible(context)).toBe(true);

    const first = purgeBuilder.build(context, merchantRng("first"));
    const replay = purgeBuilder.build(context, merchantRng("unrelated"));
    expect(first).not.toBeNull();
    expect(replay?.targetKey).toBe(first?.targetKey);
    expect(first?.selectionTrace?.band.size).toBeGreaterThanOrEqual(2);
    expect(first?.selectionTrace?.band.candidates.some((candidate) =>
      candidate.selected && candidate.key === first.targetKey)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bug-class: purge eligibility gate
// ---------------------------------------------------------------------------

describe("purge — eligibility", () => {
  it("is ineligible when deck size < minDeckForPurge (8)", () => {
    // 7 starters (< 8), all with corpus signal
    const cards = Array.from({ length: 7 }, (_, i) =>
      makeMerchantTestCard({
        id: uuid(400 + i),
        cardNumber: 400 + i,
        isStarter: true,
      }),
    );
    const entries = cards.map((c, i) =>
      makeMerchantTestDeckEntry({ entryId: `e${String(i)}`, cardNumber: c.cardNumber }),
    );
    const corpusCards: Record<string, { quality: number; df: number }> = {};
    cards.forEach((c) => {
      corpusCards[c.id] = { quality: 0.5, df: 10 };
    });
    const context = makeContext({ cards, deckEntries: entries, corpusCards });
    expect(purgeBuilder.eligible(context)).toBe(false);
  });

  it("is ineligible when no candidates exist (all non-starter, no-signal)", () => {
    // 8 non-starters, none with corpus signal => fitLooByEntry returns empty map
    // => no bottom fraction entries => no starters => 0 candidates
    const cards = Array.from({ length: 8 }, (_, i) =>
      makeMerchantTestCard({ id: uuid(500 + i), cardNumber: 500 + i }),
    );
    const entries = cards.map((c, i) =>
      makeMerchantTestDeckEntry({ entryId: `e${String(i)}`, cardNumber: c.cardNumber }),
    );
    // Empty corpus — no cards have signal
    const context = makeContext({ cards, deckEntries: entries, corpusCards: {} });
    expect(purgeBuilder.eligible(context)).toBe(false);
  });

  it("is eligible at deck size == 8 with at least one starter", () => {
    const starterCard = makeMerchantTestCard({
      id: uuid(600),
      cardNumber: 600,
      isStarter: true,
    });
    const otherCards = Array.from({ length: 7 }, (_, i) =>
      makeMerchantTestCard({ id: uuid(601 + i), cardNumber: 601 + i }),
    );
    const entries = [
      makeMerchantTestDeckEntry({ entryId: "s0", cardNumber: 600 }),
      ...otherCards.map((c, i) =>
        makeMerchantTestDeckEntry({ entryId: `o${String(i)}`, cardNumber: c.cardNumber }),
      ),
    ];
    const corpusCards: Record<string, { quality: number; df: number }> = {};
    corpusCards[uuid(600)] = { quality: 0.5, df: 10 };
    otherCards.forEach((c) => {
      corpusCards[c.id] = { quality: 0.5, df: 10 };
    });
    const context = makeContext({
      cards: [starterCard, ...otherCards],
      deckEntries: entries,
      corpusCards,
    });
    expect(purgeBuilder.eligible(context)).toBe(true);
  });
});
