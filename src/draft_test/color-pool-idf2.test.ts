// @vitest-environment node
//
// The `idf2` pool variant is `idf` with a diversity-biased starter draw: same
// corpus (`docs/drafts_dt`, bundled to `public/decklists-data.json`), same
// IDF-weighted cosine ranking, same best-first whole-deck union, but the starter
// decklist is drawn weighted by the inverse of its near-twin count instead of
// uniformly, so over-represented archetypes start fewer pools. Like `idf` it
// reads nothing else — no archetypes, tides, colors, dreamcallers, or core
// staples — so these tests pin that contract: bounded near the target size,
// capped at 2 copies, reproducible from a seed, varied across seeds, blind to the
// archetype/theme arguments, a graceful fallback to `default` when no decklists
// are bundled, and — the point of the variant — a starter distribution that
// genuinely differs from `idf`'s uniform draw.
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

describe("idf2 pool variant", () => {
  it("produces a pool near the target size, capped at 2 copies", () => {
    for (let seed = 0; seed < 200; seed++) {
      const pool = generatePoolFromData(poolData, seed, undefined, "idf2");
      // Same target/window as `idf` (targetSize 100, window 90-110); a single
      // deck can jump a little across the boundary, so allow a small margin.
      expect(pool.size, `size seed=${String(seed)}`).toBeGreaterThanOrEqual(85);
      expect(pool.size, `size seed=${String(seed)}`).toBeLessThanOrEqual(115);
      for (const [card, copies] of pool.counts) {
        expect(copies, `${card} seed=${String(seed)}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("reports no color identity (consumes no color metadata)", () => {
    for (let seed = 0; seed < 50; seed++) {
      const pool = generatePoolFromData(poolData, seed, undefined, "idf2");
      expect(pool.identity, `seed=${String(seed)}`).toBe("");
    }
  });

  it("is reproducible from a seed", () => {
    for (let seed = 0; seed < 50; seed++) {
      const a = generatePoolFromData(poolData, seed, undefined, "idf2");
      const b = generatePoolFromData(poolData, seed, undefined, "idf2");
      expect(signature(a.counts), `seed=${String(seed)}`).toBe(
        signature(b.counts),
      );
    }
  });

  it("yields different pools across seeds (run-to-run variety)", () => {
    const sigs = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      sigs.add(
        signature(generatePoolFromData(poolData, seed, undefined, "idf2").counts),
      );
    }
    expect(sigs.size).toBeGreaterThan(35);
  });

  it("ignores the archetype and theme arguments entirely", () => {
    const archetypes = ["br-aristocrats", "ur-storm", "wbg-midrange"];
    const theme = ["abandon", "storm"];
    for (let seed = 0; seed < 50; seed++) {
      const plain = generatePoolFromData(poolData, seed, undefined, "idf2");
      const seeded = generatePoolFromData(
        poolData,
        seed,
        archetypes,
        "idf2",
        theme,
      );
      expect(signature(seeded.counts), `seed=${String(seed)}`).toBe(
        signature(plain.counts),
      );
    }
  });

  it("falls back to the default algorithm when no decklists are bundled", () => {
    const noDecks = buildPoolData(cards);
    const fallback = generatePoolFromData(noDecks, 3, undefined, "idf2");
    const expected = generatePoolFromData(noDecks, 3, undefined, "default");
    expect(signature(fallback.counts)).toBe(signature(expected.counts));
  });

  it("draws a starter distribution that differs from idf's uniform draw", () => {
    // The whole point of idf2: the diversity bias must actually change which
    // decks anchor pools. Over a fixed seed range the multiset of generated
    // pools should not match idf's, even though every other step is shared.
    let differing = 0;
    for (let seed = 0; seed < 100; seed++) {
      const idf = generatePoolFromData(poolData, seed, undefined, "idf");
      const idf2 = generatePoolFromData(poolData, seed, undefined, "idf2");
      if (signature(idf.counts) !== signature(idf2.counts)) differing += 1;
    }
    // Most seeds land on a different starter under the weighted draw.
    expect(differing).toBeGreaterThan(50);
  });
});
