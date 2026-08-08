// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import {
  compileGambleData,
  compileTideAlignmentsData,
  compileTransfigurationData,
} from "./data-driven-catalogs.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const parsed = (file) => parse(readFileSync(resolve(ROOT, "data", file), "utf8"));

describe("data-driven catalog runtime generation", () => {
  it("emits deterministic gameplay hashes and stable Gamble identities", () => {
    const source = parsed("gamble.toml");
    const first = compileGambleData(source);
    expect(compileGambleData(source)).toEqual(first);
    expect(first.games.map((game) => game.id)).toEqual([
      "gravok-three-gate-wager", "tidemark-ladder-climb", "starway-stairs", "four-suit-reprise", "blackjack",
    ]);
    expect(first.foldHash).toBe(first.contentHash);
  });

  it("normalizes closed Transfiguration variants without form switches", () => {
    const result = compileTransfigurationData(parsed("transfiguration.toml"));
    expect(result.forms.map((form) => form.id)).toHaveLength(9);
    expect(result.forms[0].eligibility.kind).toBe("positiveEnergyCost");
    expect(result.forms[0].operation.kind).toBe("halveEnergyCost");
    expect(result.site.standardChoiceLimit).toBe(3);
    expect(result.site.enhancedChoiceLimit).toBeNull();
  });

  it("keeps presentation-only tide metadata outside gameplay folds", () => {
    const result = compileTideAlignmentsData(parsed("tide_alignments.toml"));
    expect(result.alignments.map((alignment) => alignment.id)).toEqual(["ember", "valor", "vision", "wild", "shadow"]);
    expect(result).not.toHaveProperty("foldHash");
  });
});
