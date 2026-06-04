import { describe, expect, it } from "vitest";

import { buildPoolData } from "../draft/pool/pool-data.ts";
import type { PoolCard } from "../draft/pool/types.ts";
import type { DreamcallerContent } from "../types/content";
import { STARTER_CARD_NUMBERS } from "./starter-cards";
import { buildDreamcallerPackage, type RunPoolContext } from "./quest-content";

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
