// @vitest-environment node
//
// Dreamcaller-seeded pool construction. When a Dreamcaller supplies
// `draftArchetypes`, the generator seeds from one of those archetypes: the
// color identity is that archetype's colors, and the color+archetype themes it
// draws from are restricted to the Dreamcaller's listed archetypes (on-color
// mechanic-tide archetypes still join the walk). Omitting the list reproduces
// the unconstrained random pool.
import { describe, expect, it } from "vitest";
import { loadCards } from "../../scripts/generate-color-pool.mjs";
import { buildPoolData, generatePoolFromData } from "../draft/pool";

const poolData = buildPoolData(loadCards());

// A focused, two-color Dreamcaller archetype list (Wb aristocrats family).
const SEED_ARCHETYPES = [
  "w-weenie",
  "wb-aristocrats",
  "wb-weenie",
  "b-aristocrats",
  "b-weenie",
];

/** Leading run of w/u/b/r/g color letters in a list name, "" if none. */
function colorPrefix(name: string): string {
  const head = name.split("-")[0];
  const isColors =
    head.length > 0 && [...head].every((c) => "wubrg".includes(c));
  return isColors ? head : "";
}

describe("Dreamcaller-seeded color pool", () => {
  it("seeds identity and color-archetype themes from the Dreamcaller list", () => {
    const allowed = new Set(SEED_ARCHETYPES);
    const seenIdentities = new Set<string>();

    for (let seed = 0; seed < 300; seed++) {
      const pool = generatePoolFromData(
        poolData,
        seed,
        SEED_ARCHETYPES,
        "color_pool",
      );
      seenIdentities.add(pool.identity);

      // The identity is the colors of one of the listed archetypes.
      const seedColorSets = SEED_ARCHETYPES.map(colorPrefix);
      expect(
        seedColorSets,
        `identity seed=${String(seed)} must match a listed archetype`,
      ).toContain(pool.identity);

      for (const theme of pool.themes) {
        if (!theme.startsWith("D:")) continue;
        const archetype = theme.slice(2);
        // Color+archetype themes are confined to the Dreamcaller's list.
        expect(
          allowed.has(archetype),
          `theme ${theme} (seed=${String(seed)}) must be a listed archetype`,
        ).toBe(true);
        // ...and on-color for the chosen identity.
        const prefix = colorPrefix(archetype);
        for (const color of prefix) {
          expect(pool.identity).toContain(color);
        }
      }

      // The pool still respects the size band.
      expect(pool.size).toBeGreaterThanOrEqual(180);
      expect(pool.size).toBeLessThanOrEqual(220);
    }

    // Fixed seeds cover each listed identity family.
    expect(seenIdentities).toEqual(new Set(["b", "w", "wb"]));
  });

  it("matches the unconstrained pool when no archetypes are supplied", () => {
    for (let seed = 0; seed < 50; seed++) {
      const withUndefined = generatePoolFromData(
        poolData,
        seed,
        undefined,
        "color_pool",
      );
      const withEmpty = generatePoolFromData(poolData, seed, [], "color_pool");
      expect(withEmpty.identity).toBe(withUndefined.identity);
      expect(withEmpty.themes).toEqual(withUndefined.themes);
      expect(withEmpty.size).toBe(withUndefined.size);
    }
  });
});
