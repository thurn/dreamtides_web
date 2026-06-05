// @vitest-environment node
//
// The optional `targetSize` argument to `generatePoolFromData` lets the
// `draft_test` harness pin the draft pool to a chosen number of copies via the
// `?size=` URL parameter, applied to whichever `?algo=` variant is active. These
// tests pin that contract for every variant. `default` lands on the target
// exactly (its [180, 220] band collapses onto it); `diverse` lands at the target
// or just above (it never drops a card below a 1-of, so a small target can leave
// a thin floor of overshoot); and the decklist-based variants (`decklists`,
// `merged`, `idf`, `idf2`) honor the target as the ceiling their fill stops at,
// landing within their own jitter/tolerance of it (`merged` may stop well short
// when a rolled archetype's lists run dry, which is its normal behavior).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCards } from "../../scripts/generate-color-pool.mjs";
import {
  buildPoolData,
  generatePoolFromData,
  type PoolVariant,
} from "../draft/pool";

const cards = loadCards();
const decklists = JSON.parse(
  readFileSync(join(process.cwd(), "public", "decklists-data.json"), "utf8"),
) as string[][];
const mergedLists = JSON.parse(
  readFileSync(
    join(process.cwd(), "public", "merged-archetype-lists-data.json"),
    "utf8",
  ),
) as Record<string, string[]>;
const poolData = buildPoolData(cards, decklists, mergedLists);

const TARGET = 160;

// How far each variant may land from `TARGET` once it honors it. `below` is how
// far short it may stop, `above` how far it may overshoot. The decklist variants
// stop within their jitter/tolerance; `merged` may fall well short when an
// archetype's lists run dry, so its floor is loose while its ceiling is tight.
const BANDS: readonly { variant: PoolVariant; below: number; above: number }[] =
  [
    { variant: "color_pool", below: 0, above: 0 },
    { variant: "diverse", below: 0, above: 16 },
    { variant: "decklists", below: 12, above: 12 },
    { variant: "merged", below: TARGET, above: 12 },
    { variant: "idf", below: 16, above: 16 },
    { variant: "idf2", below: 16, above: 16 },
  ];

describe("targetSize pins the draft pool size for every variant", () => {
  for (const { variant, below, above } of BANDS) {
    it(
      `keeps ${variant} within its band of the requested size`,
      () => {
        for (let seed = 0; seed < 150; seed++) {
          const pool = generatePoolFromData(
            poolData,
            seed,
            undefined,
            variant,
            undefined,
            TARGET,
          );
          const label = `${variant} seed=${String(seed)} size=${String(pool.size)}`;
          expect(pool.size, label).toBeGreaterThanOrEqual(TARGET - below);
          expect(pool.size, label).toBeLessThanOrEqual(TARGET + above);
        }
      },
      20000,
    );
  }

  it("lands color_pool on the exact requested size, well outside its default band", () => {
    // The unconstrained `color_pool` pool sits in [180, 220]; an override drives it
    // to any requested size exactly, proving the parameter takes effect.
    for (const target of [80, 120, 200]) {
      for (let seed = 0; seed < 50; seed++) {
        const pool = generatePoolFromData(
          poolData,
          seed,
          undefined,
          "color_pool",
          undefined,
          target,
        );
        expect(pool.size, `target=${String(target)} seed=${String(seed)}`).toBe(
          target,
        );
      }
    }
  });
});
