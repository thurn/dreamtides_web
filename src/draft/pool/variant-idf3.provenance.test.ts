// idf3 emits full per-card provenance alongside the pool: the signature probe,
// the anchor decks it located, the drawn starter, and — for every pooled card —
// the nearest source deck it descends from. The "Why Cards" debug surface reads
// this to explain why each offered card is in the pool.

import { describe, expect, it } from "vitest";

import { buildPoolData } from "./pool-data.ts";
import { makeRng } from "./rng.ts";
import type { PoolCard } from "./types.ts";
import { generateIdf3 } from "./variant-idf3.ts";

// Disjoint hand-authored decklists (no card name is shared across decks), so the
// only deck similar to the signature is the one literally holding it. Each deck
// has 20 distinct cards, inside the corpus's 16-34 band.
function deck(prefix: string, n = 20): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${String(i)}`);
}

const DECKLISTS: readonly (readonly string[])[] = [
  deck("a"),
  deck("b"),
  deck("c"),
  deck("d"),
  deck("e"),
];

const SIGNATURE_CARDS = ["c-0", "c-1", "c-2"]; // only in deck index 2

function minimalCards(
  decklists: readonly (readonly string[])[],
  extra: readonly string[],
): PoolCard[] {
  const names = new Set<string>(extra);
  for (const list of decklists) for (const name of list) names.add(name);
  return [...names].map((name) => ({ name }));
}

describe("generateIdf3 provenance", () => {
  it("records the signature probe, anchors, starter, and per-card sources", () => {
    const cards = minimalCards(DECKLISTS, SIGNATURE_CARDS);
    const poolData = buildPoolData(cards, DECKLISTS);
    const result = generateIdf3(makeRng(12345), poolData, SIGNATURE_CARDS, 30);

    const prov = result.idf3Provenance;
    expect(prov).toBeDefined();
    const provenance = prov as NonNullable<typeof prov>;

    // The signature cards are distinctive (each in a single deck), so all carry
    // IDF weight and none are dropped.
    expect(provenance.signatureCardNames).toEqual(SIGNATURE_CARDS);
    expect(new Set(provenance.signatureWeightedNames)).toEqual(
      new Set(SIGNATURE_CARDS),
    );
    expect(provenance.signatureDroppedNames).toEqual([]);

    // The signature lives only in deck 2, so that deck is the sole anchor and
    // the drawn starter, and its cards are the distinctive ones reported.
    expect(provenance.anchors.length).toBe(1);
    expect(provenance.anchors[0].similarityToSignature).toBeGreaterThan(0);
    expect(provenance.starterCardCount).toBe(20);
    expect(provenance.starterDistinctiveCardNames.length).toBeGreaterThan(0);

    // The starter is the first source deck: rank 0, similarity 1 to itself.
    expect(provenance.sourceDecks[0].rank).toBe(0);
    expect(provenance.sourceDecks[0].similarityToStarter).toBe(1);

    // Every card of the drawn starter deck traces back to rank 0.
    const starterCardName = (result.starterDeck ?? [])[0];
    expect(starterCardName).toBeDefined();
    const starterEntry = provenance.cardProvenanceByName[starterCardName];
    expect(starterEntry).toBeDefined();
    expect(starterEntry.inStarterDeck).toBe(true);
    expect(starterEntry.sourceRank).toBe(0);

    // Any pooled signature card is flagged as a signature.
    for (const sig of SIGNATURE_CARDS) {
      const entry = provenance.cardProvenanceByName[sig];
      if (entry !== undefined) expect(entry.isSignature).toBe(true);
    }
  });

  it("attributes grown-in cards to a non-starter neighbour deck", () => {
    const cards = minimalCards(DECKLISTS, SIGNATURE_CARDS);
    const poolData = buildPoolData(cards, DECKLISTS);
    const result = generateIdf3(makeRng(12345), poolData, SIGNATURE_CARDS, 30);
    const provenance = result.idf3Provenance as NonNullable<
      typeof result.idf3Provenance
    >;

    // Growth folds in at least one neighbour deck to approach the target size,
    // so some pooled card descends from a deck past the starter.
    const grown = Object.values(provenance.cardProvenanceByName).filter(
      (entry) => !entry.inStarterDeck,
    );
    expect(grown.length).toBeGreaterThan(0);
    for (const entry of grown) {
      expect(entry.sourceRank).toBeGreaterThan(0);
      expect(entry.isSignature).toBe(false);
    }

    // contributedCardCount sums to the number of provenance entries: every
    // pooled card is attributed to exactly one source deck.
    const totalContributed = provenance.sourceDecks.reduce(
      (sum, d) => sum + d.contributedCardCount,
      0,
    );
    expect(totalContributed).toBe(
      Object.keys(provenance.cardProvenanceByName).length,
    );
  });

  it("omits provenance when the corpus has no decklists (default fallback)", () => {
    const cards = minimalCards(DECKLISTS, SIGNATURE_CARDS);
    const poolData = buildPoolData(cards, []);
    const result = generateIdf3(makeRng(12345), poolData, SIGNATURE_CARDS, 30);
    expect(result.idf3Provenance).toBeUndefined();
  });
});
