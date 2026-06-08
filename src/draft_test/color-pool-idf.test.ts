// @vitest-environment node
//
// The `idf` pool variant is the simplest decklist-based pool: pick one real
// decklist (`docs/drafts_dt`, bundled to `public/decklists-data.json`) at
// random, rank the rest by IDF-weighted cosine similarity to it, and union whole
// decklists best-first until the size lands closest to the target. It reads
// nothing else — no archetypes, tides, colors, dreamcallers, or core staples —
// so these tests pin that contract: bounded near the target size, capped at 2
// copies, reproducible from a seed, varied across seeds, blind to the
// archetype/theme arguments, and a graceful fallback to `default` when no
// decklists are bundled.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCards } from "../../scripts/generate-color-pool.mjs";
import { buildPoolData, generatePoolFromData, poolToLines } from "../draft/pool";

const cards = loadCards();
const decklists = JSON.parse(
  readFileSync(join(process.cwd(), "public", "decklists-data.json"), "utf8"),
) as string[][];
const poolData = buildPoolData(cards, decklists);

// A signature that ignores copy order, so "same pool" means the same multiset.
function signature(counts: Map<string, number>): string {
  return poolToLines(counts).join("\n");
}

describe("idf pool variant", () => {
  it("produces a pool near the target size, capped at 2 copies", () => {
    for (let seed = 0; seed < 200; seed++) {
      const pool = generatePoolFromData(poolData, seed, undefined, "idf");
      // targetSize 100, window 90-110; the closest whole-deck boundary can sit
      // a little outside the window when a single deck jumps across it (observed
      // range across 1000 seeds is 88-111).
      expect(pool.size, `size seed=${String(seed)}`).toBeGreaterThanOrEqual(85);
      expect(pool.size, `size seed=${String(seed)}`).toBeLessThanOrEqual(115);
      for (const [card, copies] of pool.counts) {
        expect(copies, `${card} seed=${String(seed)}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("reports no color identity (consumes no color metadata)", () => {
    for (let seed = 0; seed < 50; seed++) {
      const pool = generatePoolFromData(poolData, seed, undefined, "idf");
      expect(pool.identity, `seed=${String(seed)}`).toBe("");
    }
  });

  it("is reproducible from a seed", () => {
    for (let seed = 0; seed < 50; seed++) {
      const a = generatePoolFromData(poolData, seed, undefined, "idf");
      const b = generatePoolFromData(poolData, seed, undefined, "idf");
      expect(signature(a.counts), `seed=${String(seed)}`).toBe(
        signature(b.counts),
      );
    }
  });

  it("changes the pool when the seed changes", () => {
    const first = generatePoolFromData(poolData, 0, undefined, "idf");
    const second = generatePoolFromData(poolData, 1, undefined, "idf");

    expect(signature(first.counts)).not.toBe(signature(second.counts));
  });

  it("ignores the archetype and theme arguments entirely", () => {
    // Passing a Dreamcaller's draft archetypes and theme must not change the
    // pool: the variant is built only from the random decklist + IDF unions.
    const archetypes = ["br-aristocrats", "ur-storm", "wbg-midrange"];
    const theme = ["abandon", "storm"];
    for (let seed = 0; seed < 50; seed++) {
      const plain = generatePoolFromData(poolData, seed, undefined, "idf");
      const seeded = generatePoolFromData(
        poolData,
        seed,
        archetypes,
        "idf",
        theme,
      );
      expect(signature(seeded.counts), `seed=${String(seed)}`).toBe(
        signature(plain.counts),
      );
    }
  });

  it("throws when no decklists are bundled (no silent fallback)", () => {
    const noDecks = buildPoolData(cards);
    expect(() => generatePoolFromData(noDecks, 3, undefined, "idf")).toThrow(
      /cannot build a pool/,
    );
  });
});
