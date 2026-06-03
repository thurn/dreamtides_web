// @vitest-environment node
//
// The pool-construction algorithm lives in `color-pool.ts` and is the single
// source of truth: the Node generator (`scripts/generate-color-pool.mjs`)
// imports it rather than re-implementing it, so the standalone draft harness,
// the CLI, and the simulation tooling can never diverge. This test pins that
// contract — the Node `runSeed` wrapper must reproduce, byte-for-byte, the pool
// the shared generator produces, for both unconstrained and Dreamcaller-seeded
// pools.
import { describe, expect, it } from "vitest";
import {
  buildPoolData as buildNodePoolData,
  findDreamcaller,
  loadCards,
  loadDreamcallers,
  runSeed,
} from "../../scripts/generate-color-pool.mjs";
import { buildPoolData, generatePoolFromData, poolToLines } from "./color-pool";

const cards = loadCards();
const poolData = buildPoolData(cards);

describe("Node generator delegates to the shared color-pool algorithm", () => {
  it("reproduces the shared generator's pool for every unconstrained seed", () => {
    for (let seed = 0; seed < 2000; seed++) {
      const node = runSeed(seed, buildNodePoolData(cards));
      const shared = generatePoolFromData(poolData, seed);
      expect(node.identity, `identity seed=${String(seed)}`).toBe(
        shared.identity,
      );
      expect(node.themes, `themes seed=${String(seed)}`).toEqual(shared.themes);
      expect(node.size, `size seed=${String(seed)}`).toBe(shared.size);
      expect(node.lines, `cards seed=${String(seed)}`).toEqual(
        poolToLines(shared.counts),
      );
    }
  });

  it("reproduces the shared generator's pool when seeded by a Dreamcaller", () => {
    const dreamcaller = findDreamcaller(loadDreamcallers(), "Kell Tarn");
    expect(dreamcaller?.draftArchetypes).toBeDefined();
    const seedArchetypes = dreamcaller?.draftArchetypes;

    for (let seed = 0; seed < 500; seed++) {
      const node = runSeed(seed, poolData, seedArchetypes);
      const shared = generatePoolFromData(poolData, seed, seedArchetypes);
      expect(node.identity, `identity seed=${String(seed)}`).toBe(
        shared.identity,
      );
      expect(node.themes, `themes seed=${String(seed)}`).toEqual(shared.themes);
      expect(node.lines, `cards seed=${String(seed)}`).toEqual(
        poolToLines(shared.counts),
      );
    }
  });
});
