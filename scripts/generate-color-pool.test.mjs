// @vitest-environment node
//
// Equivalence of the TOML-sourced color-pool generator with the pre-migration,
// file-sourced generator.
//
// Before the migration the generator read 174 curated card lists from
// `docs/archetype_lists/` and `docs/drafts_adapted/`. Those lists are captured
// verbatim (with their original line order) in
// `__fixtures__/pool-lists-golden.json`. This suite reconstructs the historical
// generator inputs from that fixture and the current inputs from
// `cards_v2.toml`, then proves:
//
//   1. Membership identity — every list reconstructed from the TOML equals the
//      pre-migration list exactly (the migration moved data, it did not change
//      which cards belong to which list).
//   2. Per-seed shape identity — for every seed the color identity, pool size,
//      and selected themes are byte-identical between the two input sources.
//   3. Distributional equivalence — color-identity distribution, full 509-card
//      coverage, and per-card inclusion frequency match. The lists' original
//      line order was intentionally arbitrary/random, so the only divergence is
//      which equally-eligible cards land as 1-of vs 2-of, which is bounded here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPoolData, loadCards, runSeed } from "./generate-color-pool.mjs";

const fixture = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/pool-lists-golden.json", import.meta.url),
    "utf8",
  ),
);

// Re-key maps in the historical directory order: the code-unit sort of the
// `<name>.txt` filenames ('-' < '.', so "b-weenie" precedes "b").
function byFilename(a, b) {
  const fa = `${a}.txt`;
  const fb = `${b}.txt`;
  return fa < fb ? -1 : fa > fb ? 1 : 0;
}
function orderedMap(entries) {
  const out = new Map();
  for (const [key, members] of [...entries].sort((x, y) =>
    byFilename(x[0], y[0]),
  )) {
    out.set(key, new Set(members));
  }
  return out;
}

// Pre-migration generator inputs, rebuilt from the captured lists.
const oldPoolData = {
  core: new Set(fixture.core),
  archLists: orderedMap(Object.entries(fixture.archetypes)),
  draftLists: orderedMap(Object.entries(fixture.drafts)),
};

// Current generator inputs, rebuilt from cards_v2.toml metadata.
const newPoolData = buildPoolData(loadCards());

const SEEDS = 2000;

describe("color pool list membership", () => {
  it("core reconstructs from the TOML exactly", () => {
    expect([...newPoolData.core].sort()).toEqual([...oldPoolData.core].sort());
  });

  it("every mechanic-archetype list reconstructs from tides exactly", () => {
    for (const [name, oldSet] of oldPoolData.archLists) {
      const newSet = newPoolData.archLists.get(name);
      expect(newSet, `archetype list missing: ${name}`).toBeDefined();
      expect(
        [...newSet].sort(),
        `archetype list differs: ${name}`,
      ).toEqual([...oldSet].sort());
    }
    expect([...newPoolData.archLists.keys()].sort()).toEqual(
      [...oldPoolData.archLists.keys()].sort(),
    );
  });

  it("every draft list (colors + slices) reconstructs from the TOML exactly", () => {
    for (const [name, oldSet] of oldPoolData.draftLists) {
      const newSet = newPoolData.draftLists.get(name);
      expect(newSet, `draft list missing: ${name}`).toBeDefined();
      expect([...newSet].sort(), `draft list differs: ${name}`).toEqual(
        [...oldSet].sort(),
      );
    }
    expect([...newPoolData.draftLists.keys()].sort()).toEqual(
      [...oldPoolData.draftLists.keys()].sort(),
    );
  });
});

describe("color pool per-seed shape equivalence", () => {
  it("color identity, size, and themes match for every seed", () => {
    let idMismatch = 0;
    let sizeMismatch = 0;
    let themeMismatch = 0;
    for (let seed = 0; seed < SEEDS; seed++) {
      const oldRun = runSeed(seed, oldPoolData);
      const newRun = runSeed(seed, newPoolData);
      if (oldRun.identity !== newRun.identity) idMismatch++;
      if (oldRun.size !== newRun.size) sizeMismatch++;
      if (oldRun.themes.join(",") !== newRun.themes.join(",")) themeMismatch++;
    }
    expect(idMismatch).toBe(0);
    expect(sizeMismatch).toBe(0);
    expect(themeMismatch).toBe(0);
  });
});

describe("color pool distributional equivalence", () => {
  it("identity distribution, coverage, and inclusion frequency match", () => {
    const oldId = new Map();
    const newId = new Map();
    const oldFreq = new Map();
    const newFreq = new Map();
    const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
    for (let seed = 0; seed < SEEDS; seed++) {
      const oldRun = runSeed(seed, oldPoolData);
      const newRun = runSeed(seed, newPoolData);
      bump(oldId, oldRun.identity);
      bump(newId, newRun.identity);
      for (const name of new Set(oldRun.lines)) bump(oldFreq, name);
      for (const name of new Set(newRun.lines)) bump(newFreq, name);
    }

    // Color-identity distribution is determined before any card-order-sensitive
    // step, so it is exactly identical.
    expect([...newId.entries()].sort()).toEqual([...oldId.entries()].sort());

    // Both sources reach the same full set of cards.
    expect(newFreq.size).toBe(oldFreq.size);
    expect([...newFreq.keys()].sort()).toEqual([...oldFreq.keys()].sort());

    // Per-card inclusion frequency differs only by the arbitrary 1-of/2-of and
    // filler tie-breaks; keep that well under 5% of runs.
    let maxDelta = 0;
    for (const name of new Set([...oldFreq.keys(), ...newFreq.keys()])) {
      const delta = Math.abs((oldFreq.get(name) ?? 0) - (newFreq.get(name) ?? 0));
      if (delta > maxDelta) maxDelta = delta;
    }
    expect(maxDelta / SEEDS).toBeLessThan(0.05);
  });
});
