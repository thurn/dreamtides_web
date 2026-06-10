import { beforeEach, describe, expect, it } from "vitest";

import { buildPoolData } from "../draft/pool/pool-data.ts";
import type { PoolCard } from "../draft/pool/types.ts";
import type { DreamcallerContent } from "../types/content";
import { getLogEntries, resetLog } from "../logging";
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
    // These tests exercise idf3 package building and its provenance summary
    // (which is only produced for idf3), so pin the variant rather than
    // inheriting the records-driven default.
    poolVariant: "idf3",
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

describe("buildDreamcallerPackage draft_pool_constructed logging", () => {
  beforeEach(() => {
    resetLog();
  });

  function constructedEvent(): Record<string, unknown> {
    const events = getLogEntries().filter(
      (e) => e.event === "draft_pool_constructed",
    );
    expect(events).toHaveLength(1);
    return events[0] as Record<string, unknown>;
  }

  it("records the algorithm, seed, and size for every variant", () => {
    const ctx = makeContext();
    buildDreamcallerPackage(makeDreamcaller(), ctx, "seed-abc");
    const event = constructedEvent();
    expect(event.dreamcallerId).toBe("dc-test");
    // The context has no poolVariant, so it falls back to the default (idf3).
    expect(event.algo).toBe("idf3");
    expect(typeof event.seed).toBe("number");
    expect(event.poolSize).toBeGreaterThan(0);
    expect(event.distinctCardCount).toBeGreaterThan(0);
  });

  it("captures the seed card, partners, and top cards for affinity-grown pools", () => {
    const ctx: RunPoolContext = { ...makeContext(), poolVariant: "seed" };
    buildDreamcallerPackage(makeDreamcaller(), ctx, "seed-abc");
    const event = constructedEvent();

    expect(event.algo).toBe("seed");
    expect(typeof event.seedCardName).toBe("string");
    expect(typeof event.seedAffinityWeight).toBe("number");
    expect(Array.isArray(event.topPartners)).toBe(true);

    const topCards = event.topCards as Array<Record<string, number | string>>;
    expect(Array.isArray(topCards)).toBe(true);
    expect(topCards.length).toBeGreaterThan(0);
    expect(topCards.length).toBeLessThanOrEqual(20);
    // Sorted by blended admission score, highest first.
    for (let i = 1; i < topCards.length; i += 1) {
      expect(topCards[i - 1].blendedScore).toBeGreaterThanOrEqual(
        topCards[i].blendedScore as number,
      );
    }
    for (const card of topCards) {
      expect(typeof card.name).toBe("string");
      expect(typeof card.addOrder).toBe("number");
      expect(card.copies).toBeGreaterThanOrEqual(1);
    }
  });

  it("records the tide decks the pool was dealt from for tide variants", () => {
    // A synthetic tides2 artifact: three disjoint tides, a Dreamcaller pool with
    // one lead, and an ally ring so the fill has somewhere to go. cardNameById is
    // left unset, so the tide cards' own names are used directly.
    const tides2Decks = {
      version: 1 as const,
      favoredTidesByDreamcaller: {},
      tides: Array.from({ length: 3 }, (_, t) => ({
        id: `tide-${String(t + 1)}`,
        name: `Tide ${String(t + 1)}`,
        cards: Array.from({ length: 40 }, (_, i) => ({
          id: `tide-${String(t + 1)}-card-${String(i)}`,
          name: `Tide ${String(t + 1)} Card ${String(i)}`,
          copies: 2,
        })),
      })),
    };
    const tides2Relationships = {
      version: 1 as const,
      alliesByTide: {
        "tide-1": ["tide-2", "tide-3"],
        "tide-2": ["tide-3", "tide-1"],
        "tide-3": ["tide-1", "tide-2"],
      },
      tidePoolByDreamcaller: { "dc-test": ["tide-1"] },
    };
    const ctx: RunPoolContext = {
      ...makeContext(),
      poolVariant: "tides2",
      poolData: { ...makeContext().poolData, tides2Decks, tides2Relationships },
    };
    buildDreamcallerPackage(makeDreamcaller(), ctx, "seed-abc");
    const event = constructedEvent();

    expect(event.algo).toBe("tides2");
    const tideDeckIds = event.tideDeckIds as string[];
    expect(Array.isArray(tideDeckIds)).toBe(true);
    expect(tideDeckIds.length).toBeGreaterThan(0);
    // The algo label is stripped; every entry is a real tide id from the pool.
    expect(tideDeckIds).not.toContain("tides2");
    for (const id of tideDeckIds) {
      expect(id).toMatch(/^tide-\d+$/);
    }
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
