// @vitest-environment node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import {
  compileGambleData,
  compileResonanceData,
  compileTransfigurationData,
} from "./data-driven-catalogs.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const parsed = (file) =>
  parse(readFileSync(resolve(ROOT, "data", file), "utf8"));

describe("data-driven catalog runtime generation", () => {
  it("emits deterministic gameplay-only Gamble data with stable identities", () => {
    const source = parsed("gamble_site.toml");
    const first = compileGambleData(source);
    expect(compileGambleData(source)).toEqual(first);
    expect(first.games.map((game) => game.id)).toEqual([
      "gravok-three-gate-wager",
      "tidemark-ladder-climb",
      "starway-stairs",
      "four-suit-reprise",
      "blackjack",
    ]);
    expect(first.foldHash).toBe(first.contentHash);
    for (const game of first.games) {
      expect(game).not.toHaveProperty("rulesVersion");
      expect(game).not.toHaveProperty("presentation");
      expect(game.selection).not.toHaveProperty("fallback");
    }
  });

  it("preserves a configured Gamble subset and order", () => {
    const source = parsed("gamble_site.toml");
    source.games = [source.games[4], source.games[0]];
    const result = compileGambleData(source);
    expect(result.games.map((game) => game.id)).toEqual([
      "blackjack",
      "gravok-three-gate-wager",
    ]);
  });

  it("normalizes Transfiguration tuning without restating closed mechanics", () => {
    const result = compileTransfigurationData(parsed("transfiguration_site.toml"));
    expect(result.forms.map((form) => form.id)).toHaveLength(9);
    expect(result.forms[0].glyph).toBe("transfigurationEmpowered");
    expect(result.forms[0].rewardScore.kind).toBe("statDelta");
    expect(result.forms[0]).not.toHaveProperty("eligibility");
    expect(result.forms[0]).not.toHaveProperty("operation");
    expect(result.site.standardChoiceLimit).toBe(3);
    expect(result.site.enhancedChoiceLimit).toBeNull();
  });

  it("preserves a configured Transfiguration subset and variable limits", () => {
    const source = parsed("transfiguration_site.toml");
    source.forms = source.forms.slice(0, 3).reverse();
    source.site.standard_choice_limit = "All";
    source.site.enhanced_choice_limit = { Count: 2 };
    const result = compileTransfigurationData(source);
    expect(result.forms.map((form) => form.id)).toEqual([
      "Kindled",
      "Amplified",
      "Empowered",
    ]);
    expect(result.site.standardChoiceLimit).toBeNull();
    expect(result.site.enhancedChoiceLimit).toBe(2);
  });

  it("keeps presentation-only tide metadata outside gameplay folds", () => {
    const result = compileResonanceData(parsed("resonance.toml"));
    expect(result.resonances.map((resonance) => resonance.id)).toEqual([
      "ember",
      "valor",
      "vision",
      "wild",
      "shadow",
    ]);
    expect(result).not.toHaveProperty("foldHash");
  });
});
