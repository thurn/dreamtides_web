// @vitest-environment node
//
// The `idf_human` pool variant runs the `idf3` algorithm unchanged, but grows
// its pool from the real human Cube Cobra draft records
// (`docs/human_drafts_anon`, bundled to `public/human-decklists-data.json`)
// instead of the synthetic corpus `idf3` reads. These tests pin that contract:
// it is byte-for-byte `idf3` run over the human corpus, reproducible from a seed,
// varied across seeds, and a graceful fallback to `default` when no human
// decklists are bundled.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCards } from "../../scripts/generate-color-pool.mjs";
import { buildPoolData, generatePoolFromData, poolToLines } from "../draft/pool";

const cards = loadCards();
const synthDecklists = JSON.parse(
  readFileSync(join(process.cwd(), "public", "decklists-data.json"), "utf8"),
) as string[][];
const humanDecklists = JSON.parse(
  readFileSync(
    join(process.cwd(), "public", "human-decklists-data.json"),
    "utf8",
  ),
) as string[][];

// idf_human reads `humanDecklists`; pass the synthetic corpus as the ordinary
// `decklists` so any accidental fall-through to that corpus would change the
// result and fail the equivalence test below.
const poolData = buildPoolData(cards, synthDecklists, undefined, humanDecklists);

// A signature that ignores copy order, so "same pool" means the same multiset.
function signature(counts: Map<string, number>): string {
  return poolToLines(counts).join("\n");
}

describe("idf_human pool variant", () => {
  it("produces a pool near the target size, capped at 2 copies", () => {
    for (let seed = 0; seed < 100; seed++) {
      const pool = generatePoolFromData(poolData, seed, undefined, "idf_human");
      // Same target/window as `idf3` (target 100, window 90-110); the human decks
      // run a little larger than the synthetic corpus, so one deck can jump
      // further across the boundary — allow a wider margin.
      expect(pool.size, `size seed=${String(seed)}`).toBeGreaterThanOrEqual(80);
      expect(pool.size, `size seed=${String(seed)}`).toBeLessThanOrEqual(120);
      for (const [card, copies] of pool.counts) {
        expect(copies, `${card} seed=${String(seed)}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("is reproducible from a seed", () => {
    for (let seed = 0; seed < 50; seed++) {
      const a = generatePoolFromData(poolData, seed, undefined, "idf_human");
      const b = generatePoolFromData(poolData, seed, undefined, "idf_human");
      expect(signature(a.counts), `seed=${String(seed)}`).toBe(
        signature(b.counts),
      );
    }
  });

  it("changes the pool when the seed changes", () => {
    const first = generatePoolFromData(poolData, 0, undefined, "idf_human");
    const second = generatePoolFromData(poolData, 1, undefined, "idf_human");
    expect(signature(first.counts)).not.toBe(signature(second.counts));
  });

  it("matches idf3 run over the human corpus exactly", () => {
    // idf_human is idf3 with `decklists` swapped for the human corpus, so it must
    // equal idf3 over a PoolData whose `decklists` is the human corpus.
    const humanAsDecklists = buildPoolData(cards, humanDecklists);
    for (let seed = 0; seed < 30; seed++) {
      const human = generatePoolFromData(
        poolData,
        seed,
        undefined,
        "idf_human",
      );
      const idf3 = generatePoolFromData(
        humanAsDecklists,
        seed,
        undefined,
        "idf3",
      );
      expect(signature(human.counts), `seed=${String(seed)}`).toBe(
        signature(idf3.counts),
      );
    }
  });

  it("draws from the human corpus, not the synthetic one", () => {
    // Same seed, same PoolData: the only difference is which corpus each variant
    // reads, so the pools must differ.
    const human = generatePoolFromData(poolData, 0, undefined, "idf_human");
    const idf3 = generatePoolFromData(poolData, 0, undefined, "idf3");
    expect(signature(human.counts)).not.toBe(signature(idf3.counts));
  });

  it("throws when no human decklists are bundled (no silent fallback)", () => {
    const noHuman = buildPoolData(cards, synthDecklists);
    expect(() => generatePoolFromData(noHuman, 3, undefined, "idf_human")).toThrow(
      /cannot build a pool/,
    );
  });
});
