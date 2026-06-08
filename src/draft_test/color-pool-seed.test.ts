// @vitest-environment node
//
// The `seed` pool variant draws ONE card uniformly at random from the corpus and
// grows a pool around it by IDF-weighted co-occurrence affinity — to the seed and
// to the cards already chosen — capping copies at 2 and stopping at the target
// size (`SEED.targetSize`). It reads nothing but the bundled decklists. These
// tests pin that contract: near the target size, capped at 2, reproducible from a
// seed, varied across seeds, blind to the archetype/theme/signature arguments,
// graceful fallback to `default` when no decklists are bundled, and a coherent
// per-card provenance describing the seed and its growth.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCards } from "../../scripts/generate-color-pool.mjs";
import { buildPoolData, generatePoolFromData, poolToLines } from "../draft/pool";
import { SEED } from "../draft/pool/variant-seed";

const cards = loadCards();
const decklists = JSON.parse(
  readFileSync(join(process.cwd(), "public", "decklists-data.json"), "utf8"),
) as string[][];
const poolData = buildPoolData(cards, decklists);

// A signature that ignores copy order, so "same pool" means the same multiset.
function signature(counts: Map<string, number>): string {
  return poolToLines(counts).join("\n");
}

describe("seed pool variant", () => {
  it("produces a pool at the target size, capped at 2 copies", () => {
    for (let seed = 0; seed < 100; seed++) {
      const pool = generatePoolFromData(poolData, seed, undefined, "seed");
      // The grower adds one copy at a time and stops exactly at the target, so a
      // healthy corpus lands the pool right on SEED.targetSize. It can only fall
      // short if the entire corpus is smaller than the target (not the case here).
      expect(pool.size, `size seed=${String(seed)}`).toBe(SEED.targetSize);
      for (const [card, copies] of pool.counts) {
        expect(copies, `${card} seed=${String(seed)}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("reports no color identity (consumes no color metadata)", () => {
    for (let seed = 0; seed < 30; seed++) {
      const pool = generatePoolFromData(poolData, seed, undefined, "seed");
      expect(pool.identity, `seed=${String(seed)}`).toBe("");
    }
  });

  it("is reproducible from a seed", () => {
    for (let seed = 0; seed < 30; seed++) {
      const a = generatePoolFromData(poolData, seed, undefined, "seed");
      const b = generatePoolFromData(poolData, seed, undefined, "seed");
      expect(signature(a.counts), `seed=${String(seed)}`).toBe(
        signature(b.counts),
      );
    }
  });

  it("changes the pool when the seed changes", () => {
    const first = generatePoolFromData(poolData, 0, undefined, "seed");
    const second = generatePoolFromData(poolData, 1, undefined, "seed");
    expect(signature(first.counts)).not.toBe(signature(second.counts));
  });

  it("ignores the archetype, theme, and signature arguments entirely", () => {
    const archetypes = ["br-aristocrats", "ur-storm", "wbg-midrange"];
    const theme = ["abandon", "storm"];
    const signatureCards = ["Some Signature Card", "Another One"];
    for (let seed = 0; seed < 30; seed++) {
      const plain = generatePoolFromData(poolData, seed, undefined, "seed");
      const steered = generatePoolFromData(
        poolData,
        seed,
        archetypes,
        "seed",
        theme,
        300,
        signatureCards,
      );
      expect(signature(steered.counts), `seed=${String(seed)}`).toBe(
        signature(plain.counts),
      );
    }
  });

  it("pins its own target size, ignoring the requested targetSize", () => {
    // The quest passes a global pool target (e.g. 200), which the seed variant
    // deliberately overrides with SEED.targetSize.
    const pool = generatePoolFromData(poolData, 7, undefined, "seed", undefined, 200);
    expect(pool.size).toBe(SEED.targetSize);
  });

  it("throws when no decklists are bundled (no silent fallback)", () => {
    const noDecks = buildPoolData(cards);
    expect(() => generatePoolFromData(noDecks, 3, undefined, "seed")).toThrow(
      /cannot build a pool/,
    );
  });

  describe("provenance", () => {
    it("names the seed card and records coherent growth detail", () => {
      for (let seed = 0; seed < 30; seed++) {
        const pool = generatePoolFromData(poolData, seed, undefined, "seed");
        const prov = pool.seedProvenance;
        expect(prov, `seed=${String(seed)}`).toBeDefined();
        if (prov === undefined) continue;

        // The seed card is in the pool, marked as the seed, at growth order 0.
        const seedEntry = prov.cardProvenanceByName[prov.seedCardName];
        expect(seedEntry, `seed=${String(seed)}`).toBeDefined();
        expect(seedEntry.isSeed).toBe(true);
        expect(seedEntry.addOrder).toBe(0);
        expect(pool.counts.has(prov.seedCardName)).toBe(true);

        // The blend weight is the configured constant.
        expect(prov.seedAffinityWeight).toBe(SEED.seedAffinityWeight);
        expect(prov.targetSize).toBe(SEED.targetSize);

        // Totals match the actual pool.
        let total = 0;
        let doubled = 0;
        for (const copies of pool.counts.values()) {
          total += copies;
          if (copies >= 2) doubled += 1;
        }
        expect(prov.totalCopies).toBe(total);
        expect(prov.distinctCardCount).toBe(pool.counts.size);
        expect(prov.doubledCardCount).toBe(doubled);

        // Exactly one seed; the seed is not also a "partner"; partners are real
        // pool cards distinct from the seed.
        const seedCount = Object.values(prov.cardProvenanceByName).filter(
          (e) => e.isSeed,
        ).length;
        expect(seedCount).toBe(1);
        for (const partner of prov.topPartnerCardNames) {
          expect(partner).not.toBe(prov.seedCardName);
          expect(pool.counts.has(partner)).toBe(true);
        }

        // Every non-seed entry has a strictly positive growth order and bounded
        // normalised affinities.
        for (const [name, entry] of Object.entries(prov.cardProvenanceByName)) {
          if (entry.isSeed) continue;
          expect(entry.addOrder, name).toBeGreaterThan(0);
          expect(entry.seedAffinity, name).toBeGreaterThanOrEqual(0);
          expect(entry.seedAffinity, name).toBeLessThanOrEqual(1);
          expect(entry.poolAffinity, name).toBeGreaterThanOrEqual(0);
          expect(entry.poolAffinity, name).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
