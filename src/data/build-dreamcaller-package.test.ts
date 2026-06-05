import { describe, expect, it } from "vitest";

import { buildPoolData } from "../draft/pool/pool-data.ts";
import type { PoolCard } from "../draft/pool/types.ts";
import type { DreamcallerContent } from "../types/content";
import { STARTER_CARD_NUMBERS } from "./starter-cards";
import {
  buildDreamcallerPackage,
  buildDreamcallerProvenance,
  type RunPoolContext,
} from "./quest-content";

// Two card names that the name index maps to starter card numbers. These names
// also appear in a decklist below, so a correct builder must still keep them out
// of both the draft pool and the starter decklist numbers.
const STARTER_NAME_A = "Starter Alpha";
const STARTER_NAME_B = "Starter Beta";

function makeContext(): RunPoolContext {
  const names: string[] = [];
  for (let i = 0; i < 38; i += 1) {
    names.push(`Card ${String(i)}`);
  }
  names.push(STARTER_NAME_A);
  names.push(STARTER_NAME_B);

  const nameIndex = new Map<string, number>();
  // Regular cards get numbers 1..38.
  names.slice(0, 38).forEach((name, idx) => {
    nameIndex.set(name, idx + 1);
  });
  // The two starter-mapped names point at real starter numbers.
  nameIndex.set(STARTER_NAME_A, 510);
  nameIndex.set(STARTER_NAME_B, 511);

  const cards: PoolCard[] = names.map((name) => ({ name }));

  // Several ~20-card decklists (idf corpus requires 16-34 cards per deck).
  const decklists: string[][] = [
    [...names.slice(0, 18), STARTER_NAME_A, STARTER_NAME_B],
    names.slice(0, 20),
    names.slice(10, 30),
    names.slice(18, 38),
  ];

  const poolData = buildPoolData(cards, decklists);

  return {
    poolData,
    nameIndex,
    allDreamsignPoolIds: ["ds1", "ds2", "ds3"],
  };
}

function makeDreamcaller(
  overrides: Partial<DreamcallerContent> = {},
): DreamcallerContent {
  return {
    id: "dc-test",
    name: "Test Dreamcaller",
    title: "The Tester",
    renderedText: "",
    imageNumber: "0",
    startingEssence: 250,
    // Point clearly at the first deck (which includes the starter names).
    signatureCards: ["Card 0", "Card 1", "Card 2"],
    ...overrides,
  };
}

describe("buildDreamcallerPackage", () => {
  it("never lets starter cards into the draft pool", () => {
    const ctx = makeContext();
    const pkg = buildDreamcallerPackage(makeDreamcaller(), ctx, "seed-abc");
    for (const n of STARTER_CARD_NUMBERS) {
      expect(pkg.draftPoolCopiesByCard[String(n)]).toBeUndefined();
    }
    expect(pkg.draftPoolCopiesByCard["510"]).toBeUndefined();
    expect(pkg.draftPoolCopiesByCard["511"]).toBeUndefined();
  });

  it("caps copies at 2", () => {
    const ctx = makeContext();
    const pkg = buildDreamcallerPackage(makeDreamcaller(), ctx, "seed-abc");
    for (const count of Object.values(pkg.draftPoolCopiesByCard)) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it("is deterministic for the same inputs", () => {
    const ctx = makeContext();
    const a = buildDreamcallerPackage(makeDreamcaller(), ctx, "seed-abc");
    const b = buildDreamcallerPackage(makeDreamcaller(), ctx, "seed-abc");
    expect(a.draftPoolCopiesByCard).toEqual(b.draftPoolCopiesByCard);
    expect(a.starterDecklistCardNumbers).toEqual(b.starterDecklistCardNumbers);
  });

  it("yields a pool even when the Dreamcaller has no signature cards", () => {
    const ctx = makeContext();
    const withEmpty = buildDreamcallerPackage(
      makeDreamcaller({ signatureCards: [] }),
      ctx,
      "seed-abc",
    );
    expect(Object.keys(withEmpty.draftPoolCopiesByCard).length).toBeGreaterThan(
      0,
    );

    const withUndefined = buildDreamcallerPackage(
      makeDreamcaller({ signatureCards: undefined }),
      makeContext(),
      "seed-xyz",
    );
    expect(
      Object.keys(withUndefined.draftPoolCopiesByCard).length,
    ).toBeGreaterThan(0);
  });

  it("produces a resolvable starter decklist that excludes starters", () => {
    const ctx = makeContext();
    const pkg = buildDreamcallerPackage(makeDreamcaller(), ctx, "seed-abc");
    const numbers = pkg.starterDecklistCardNumbers ?? [];
    expect(numbers.length).toBeGreaterThan(0);
    const indexValues = new Set(ctx.nameIndex.values());
    const starterSet = new Set(STARTER_CARD_NUMBERS);
    for (const n of numbers) {
      expect(indexValues.has(n)).toBe(true);
      expect(starterSet.has(n)).toBe(false);
    }
    // Deduped: no repeats.
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("passes through dreamsign ids", () => {
    const ctx = makeContext();
    const pkg = buildDreamcallerPackage(makeDreamcaller(), ctx, "seed-abc");
    expect(pkg.dreamsignPoolIds).toEqual(["ds1", "ds2", "ds3"]);
  });
});

describe("buildDreamcallerProvenance", () => {
  it("describes the exact same pool as buildDreamcallerPackage", () => {
    const ctx = makeContext();
    const pkg = buildDreamcallerPackage(makeDreamcaller(), ctx, "seed-abc");
    const prov = buildDreamcallerProvenance(makeDreamcaller(), ctx, "seed-abc");

    expect(prov).not.toBeNull();
    const provenance = prov as NonNullable<typeof prov>;

    // Same set of pooled (non-starter) cards, with matching copy counts.
    expect(new Set(Object.keys(provenance.cardProvenanceByNumber))).toEqual(
      new Set(Object.keys(pkg.draftPoolCopiesByCard)),
    );
    for (const [number, entry] of Object.entries(
      provenance.cardProvenanceByNumber,
    )) {
      expect(entry.copies).toBe(pkg.draftPoolCopiesByCard[number]);
    }
  });

  it("excludes starter cards from per-card provenance", () => {
    const ctx = makeContext();
    const prov = buildDreamcallerProvenance(makeDreamcaller(), ctx, "seed-abc");
    const provenance = prov as NonNullable<typeof prov>;
    for (const n of STARTER_CARD_NUMBERS) {
      expect(provenance.cardProvenanceByNumber[String(n)]).toBeUndefined();
    }
    expect(provenance.cardProvenanceByNumber["510"]).toBeUndefined();
    expect(provenance.cardProvenanceByNumber["511"]).toBeUndefined();
  });

  it("reports the signature, anchors, and a starter-seeded growth chain", () => {
    const ctx = makeContext();
    const prov = buildDreamcallerProvenance(makeDreamcaller(), ctx, "seed-abc");
    const provenance = prov as NonNullable<typeof prov>;

    expect(provenance.signatureCardNames).toEqual(["Card 0", "Card 1", "Card 2"]);
    expect(provenance.signatureWeightedNames.length).toBeGreaterThan(0);
    expect(provenance.anchors.length).toBeGreaterThan(0);
    expect(provenance.starterCardCount).toBeGreaterThan(0);

    // The first source deck is always the starter itself: rank 0, similarity 1.
    expect(provenance.sourceDecks.length).toBeGreaterThan(0);
    expect(provenance.sourceDecks[0].rank).toBe(0);
    expect(provenance.sourceDecks[0].similarityToStarter).toBe(1);

    // Every card traces to a real source deck, with the starter at rank 0.
    const entries = Object.values(provenance.cardProvenanceByNumber);
    expect(entries.some((e) => e.inStarterDeck && e.sourceRank === 0)).toBe(true);
    for (const entry of entries) {
      expect(entry.sourceRank).toBeGreaterThanOrEqual(0);
      expect(entry.sourceRank).toBeLessThan(provenance.sourceDecks.length);
      expect(entry.inStarterDeck).toBe(entry.sourceRank === 0);
    }
  });

  it("is deterministic for the same inputs", () => {
    const a = buildDreamcallerProvenance(makeDreamcaller(), makeContext(), "seed-abc");
    const b = buildDreamcallerProvenance(makeDreamcaller(), makeContext(), "seed-abc");
    expect(a).toEqual(b);
  });
});
