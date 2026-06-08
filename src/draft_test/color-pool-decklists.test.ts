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

  it("changes the pool when the seed changes", () => {
    const first = generatePoolFromData(poolData, 0, undefined, "decklists");
    const second = generatePoolFromData(poolData, 1, undefined, "decklists");

    expect(signature(first.counts)).not.toBe(signature(second.counts));
  });

  it("focuses the pool on the Dreamcaller's rolled strategy", () => {
    // A storm-only Dreamcaller list should surface storm cards from the real
    // decklists that carry them, and the pool's leading label reflects that.
    const stormArchetypes = ["ur-storm", "ub-storm"];
    const pool = generatePoolFromData(poolData, 7, stormArchetypes, "decklists");
    expect(pool.themes[0]).toMatch(/^D:(ur|ub)-storm$/);
  });

  it("biases the pool toward the Dreamcaller's theme archetypes", () => {
    // Kragg is an abandon Dreamcaller. With the abandon theme applied, his
    // pools should carry markedly more Abandon-tide cards than without it.
    const tidesOf = new Map<string, readonly string[]>();
    for (const c of cards as { name: string; tides?: readonly string[] }[]) {
      if (c.tides?.length) tidesOf.set(c.name, c.tides);
    }
    const KRAGG = [
      "b-aristocrats", "bg-midrange", "br-aristocrats", "ug-cheaty-ramp",
      "ug-sneak", "wb-aristocrats", "wbg-midrange", "wbrg-aristocrats",
      "wubg-value", "wubrg-value",
    ];
    const abandonCopies = (theme: string[] | undefined): number => {
      let total = 0;
      const pool = generatePoolFromData(poolData, 0, KRAGG, "decklists", theme);
      for (const [card, copies] of pool.counts) {
        if (tidesOf.get(card)?.includes("Abandon")) total += copies;
      }
      return total;
    };
    const themed = abandonCopies(["abandon"]);
    const unthemed = abandonCopies(undefined);
    expect(themed).toBeGreaterThan(unthemed);
  });

  it("throws when no decklists are bundled (no silent fallback)", () => {
    const noDecks = buildPoolData(cards);
    expect(() => generatePoolFromData(noDecks, 3, undefined, "decklists")).toThrow(
      /cannot build a pool/,
    );
  });
});
