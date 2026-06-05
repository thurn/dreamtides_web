// @vitest-environment node
//
// The `diverse` pool variant. It flattens card and archetype usage relative to
// `default` while keeping core cards present and pool size in the 180-220 band.
// These tests pin its invariants and assert that, over many seeds, it spreads
// both cards and archetypes far more evenly than the default variant (see
// `docs/cards2/draft_pool_algorithms.md`).
import { describe, expect, it } from "vitest";
import { loadCards } from "../../scripts/generate-color-pool.mjs";
import { buildPoolData, generatePoolFromData } from "../draft/pool";

const cards = loadCards();
const poolData = buildPoolData(cards);
const coreNames = new Set(cards.filter((c) => c.core).map((c) => c.name));
const nonCore = cards.filter((c) => c.core !== true).map((c) => c.name);
const themeUniverse = [
  ...[...poolData.archLists.keys()].map((k) => `A:${k}`),
  ...[...poolData.draftLists.keys()]
    .filter((k) => k.includes("-"))
    .map((k) => `D:${k}`),
];

function cov(values: number[]): number {
  const mean = values.reduce((s, x) => s + x, 0) / values.length;
  if (mean === 0) return 0;
  const variance =
    values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** Inclusion rate per card and selection rate per theme over `seeds` pools. */
function aggregate(variant: "color_pool" | "diverse", seeds: number) {
  const inclusion = new Map<string, number>();
  const themeCount = new Map<string, number>();
  for (let seed = 0; seed < seeds; seed++) {
    const pool = generatePoolFromData(poolData, seed, undefined, variant);
    for (const name of pool.counts.keys()) {
      inclusion.set(name, (inclusion.get(name) ?? 0) + 1);
    }
    for (const t of pool.themes) themeCount.set(t, (themeCount.get(t) ?? 0) + 1);
  }
  return {
    cardRates: nonCore.map((n) => (inclusion.get(n) ?? 0) / seeds),
    themeRates: themeUniverse.map((t) => (themeCount.get(t) ?? 0) / seeds),
  };
}

describe("diverse pool variant", () => {
  it("keeps core present and stays in the size band", () => {
    for (let seed = 0; seed < 400; seed++) {
      const pool = generatePoolFromData(poolData, seed, undefined, "diverse");
      expect(pool.variant).toBe("diverse");
      expect(pool.size).toBeGreaterThanOrEqual(180);
      expect(pool.size).toBeLessThanOrEqual(220);
      for (const name of coreNames) expect(pool.counts.has(name)).toBe(true);
    }
  });

  it("spreads cards and archetypes more evenly than color_pool", () => {
    const seeds = 600;
    const base = aggregate("color_pool", seeds);
    const diverse = aggregate("diverse", seeds);

    // Lower coefficient of variation == flatter distribution.
    expect(cov(diverse.cardRates)).toBeLessThan(cov(base.cardRates));
    expect(cov(diverse.themeRates)).toBeLessThan(cov(base.themeRates));

    // Every archetype is selected at least sometimes, and no non-core card is
    // starved to near-zero, which the default variant does not guarantee.
    expect(diverse.themeRates.filter((r) => r === 0).length).toBe(0);
    expect(diverse.cardRates.filter((r) => r < 0.05).length).toBe(0);
  });

  it("still honors Dreamcaller seeding under the diverse variant", () => {
    const seedArchetypes = ["wb-aristocrats", "wb-weenie", "b-aristocrats"];
    for (let seed = 0; seed < 200; seed++) {
      const pool = generatePoolFromData(
        poolData,
        seed,
        seedArchetypes,
        "diverse",
      );
      // Identity is one of the seed archetypes' colors (wb / w / b).
      expect(["wb", "w", "b"]).toContain(pool.identity);
      for (const theme of pool.themes) {
        if (theme.startsWith("D:")) {
          expect(seedArchetypes).toContain(theme.slice(2));
        }
      }
    }
  });
});
