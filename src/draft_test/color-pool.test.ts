// @vitest-environment node
//
// Parity between the browser color-pool generator (`color-pool.ts`) and the
// Node generator (`scripts/generate-color-pool.mjs`). Both implement the same
// algorithm over the same `cards_v2.toml` metadata; this proves they produce
// byte-identical pools for every seed, so the standalone draft harness and any
// offline tooling never diverge.
import { describe, expect, it } from "vitest";
import {
  buildPoolData,
  loadCards,
  runSeed,
} from "../../scripts/generate-color-pool.mjs";
import {
  buildPoolData as buildBrowserPoolData,
  generatePoolFromData,
} from "./color-pool";

const cards = loadCards();
const nodePoolData = buildPoolData(cards);
const browserPoolData = buildBrowserPoolData(cards);

// Expand a browser pool's count map into the Node generator's line format:
// names sorted, a 2-of duplicated.
function browserLines(counts: Map<string, number>): string[] {
  const lines: string[] = [];
  for (const [name, count] of [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    for (let i = 0; i < Math.min(2, count); i++) lines.push(name);
  }
  return lines;
}

describe("browser/Node color-pool parity", () => {
  it("produces identical identity, themes, and cards for every seed", () => {
    for (let seed = 0; seed < 2000; seed++) {
      const node = runSeed(seed, nodePoolData);
      const browser = generatePoolFromData(browserPoolData, seed);
      expect(browser.identity, `identity seed=${seed}`).toBe(node.identity);
      expect(browser.themes, `themes seed=${seed}`).toEqual(node.themes);
      expect(browser.size, `size seed=${seed}`).toBe(node.size);
      expect(browserLines(browser.counts), `cards seed=${seed}`).toEqual(
        node.lines,
      );
    }
  });
});
