// @vitest-environment node
//
// The pool-construction algorithm lives in `color-pool.ts` and is the single
// source of truth: the Node generator (`scripts/generate-color-pool.mjs`)
// imports it rather than re-implementing it, so the standalone draft harness,
// the CLI, and the simulation tooling can never diverge. This test pins the
// Dreamcaller-seeded contract for the Node `runSeed` wrapper.
import { describe, expect, it } from "vitest";
import {
  findDreamcaller,
  loadCards,
  loadDreamcallers,
  runSeed,
} from "../../scripts/generate-color-pool.mjs";
import { buildPoolData, generatePoolFromData, poolToLines } from "../draft/pool";

const cards = loadCards();
const poolData = buildPoolData(cards);

describe("Node generator delegates to the shared color-pool algorithm", () => {
  it("reproduces the shared generator's pool when seeded by a Dreamcaller", () => {
    const dreamcaller = findDreamcaller(loadDreamcallers(), "Kell Tarn");
    expect(dreamcaller?.draftArchetypes).toBeDefined();
    const seedArchetypes = dreamcaller?.draftArchetypes;

    for (let seed = 0; seed < 500; seed++) {
      const node = runSeed(seed, poolData, seedArchetypes, "color_pool");
      const shared = generatePoolFromData(
        poolData,
        seed,
        seedArchetypes,
        "color_pool",
      );
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
