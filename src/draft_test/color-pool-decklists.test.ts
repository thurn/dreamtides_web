// @vitest-environment node
//
// The `decklists` pool variant builds a pool by snowballing real decklists
// (`docs/drafts_dt`, bundled to `public/decklists-data.json`) around a starter
// chosen for the Dreamcaller's rolled strategy, rather than synthesizing one
// from archetype themes. These tests pin its contract: bounded near the target
// size, capped at 2 copies, reproducible from a seed, varied across seeds, and
// a graceful fallback to `default` when no decklists are bundled.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCards } from "../../scripts/generate-color-pool.mjs";
import { buildPoolData, generatePoolFromData, poolToLines } from "./color-pool";

const cards = loadCards();
const decklists = JSON.parse(
  readFileSync(join(process.cwd(), "public", "decklists-data.json"), "utf8"),
) as string[][];
const poolData = buildPoolData(cards, decklists);

// A signature that ignores copy order, so "same pool" means the same multiset.
function signature(counts: Map<string, number>): string {
  return poolToLines(counts).join("\n");
}

describe("decklists pool variant", () => {
  it("bundles a non-trivial corpus of real decklists", () => {
    expect(decklists.length).toBeGreaterThan(500);
  });

  it("produces a pool near the target size, capped at 2 copies", () => {
    for (let seed = 0; seed < 200; seed++) {
      const pool = generatePoolFromData(poolData, seed, undefined, "decklists");
      // targetSize 150 +/- targetJitter 8.
      expect(pool.size, `size seed=${String(seed)}`).toBeGreaterThanOrEqual(120);
      expect(pool.size, `size seed=${String(seed)}`).toBeLessThanOrEqual(160);
      for (const [card, copies] of pool.counts) {
        expect(copies, `${card} seed=${String(seed)}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("is reproducible from a seed", () => {
    for (let seed = 0; seed < 50; seed++) {
      const a = generatePoolFromData(poolData, seed, undefined, "decklists");
      const b = generatePoolFromData(poolData, seed, undefined, "decklists");
      expect(signature(a.counts), `seed=${String(seed)}`).toBe(
        signature(b.counts),
      );
    }
  });

  it("yields different pools across seeds (run-to-run variety)", () => {
    const sigs = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      sigs.add(
        signature(
          generatePoolFromData(poolData, seed, undefined, "decklists").counts,
        ),
      );
    }
    // Effectively every seed should give a distinct pool.
    expect(sigs.size).toBeGreaterThan(35);
  });

  it("focuses the pool on the Dreamcaller's rolled strategy", () => {
    // A storm-only Dreamcaller list should surface storm cards from the real
    // decklists that carry them, and the pool's leading label reflects that.
    const stormArchetypes = ["ur-storm", "ub-storm"];
    const pool = generatePoolFromData(poolData, 7, stormArchetypes, "decklists");
    expect(pool.themes[0]).toMatch(/^D:(ur|ub)-storm$/);
  });

  it("falls back to the default algorithm when no decklists are bundled", () => {
    const noDecks = buildPoolData(cards);
    const fallback = generatePoolFromData(noDecks, 3, undefined, "decklists");
    const expected = generatePoolFromData(noDecks, 3, undefined, "default");
    expect(signature(fallback.counts)).toBe(signature(expected.counts));
  });
});
