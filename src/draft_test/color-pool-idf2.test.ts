// @vitest-environment node
//
// The `idf2` pool variant is `idf` with a diversity-biased starter draw: same
// corpus (each seat's mainboard in `docs/draft_records_adapted`, bundled to
// `public/decklists-data.json`), same
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

describe("idf2 pool variant", () => {
  it("produces a pool near the target size, capped at 2 copies", () => {
    for (let seed = 0; seed < 200; seed++) {
      const pool = generatePoolFromData(poolData, seed, undefined, "idf2");
      // Same target/window as `idf` (targetSize 100, window 90-110); a single
      // deck can jump a little across the boundary, so allow a small margin
      // (observed range across 1000 seeds is 86-116).
      expect(pool.size, `size seed=${String(seed)}`).toBeGreaterThanOrEqual(84);
      expect(pool.size, `size seed=${String(seed)}`).toBeLessThanOrEqual(118);
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

  it("changes the pool when the seed changes", () => {
    const first = generatePoolFromData(poolData, 0, undefined, "idf2");
    const second = generatePoolFromData(poolData, 1, undefined, "idf2");

    expect(signature(first.counts)).not.toBe(signature(second.counts));
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

  it("throws when no decklists are bundled (no silent fallback)", () => {
    const noDecks = buildPoolData(cards);
    expect(() => generatePoolFromData(noDecks, 3, undefined, "idf2")).toThrow(
      /cannot build a pool/,
    );
  });

  it("draws a starter distribution that differs from idf's uniform draw", () => {
    // The whole point of idf2: the diversity bias must actually change which
    // deck anchors the pool, even though every other step is shared with idf.
    // Any individual seed can coincide (both draws can land on the same deck),
    // so we scan a range and require the bias to change the result for at least
    // one seed. This pins the contract without depending on which deck a single
    // hard-coded seed happens to pick as the underlying card pool shifts.
    let anyDifferent = false;
    for (let seed = 0; seed < 50; seed++) {
      const idf = generatePoolFromData(poolData, seed, undefined, "idf");
      const idf2 = generatePoolFromData(poolData, seed, undefined, "idf2");
      if (signature(idf.counts) !== signature(idf2.counts)) {
        anyDifferent = true;
        break;
      }
    }
    expect(
      anyDifferent,
      "idf2's diversity-biased draw produced the same pool as idf for every seed 0-49",
    ).toBe(true);
  });
});
