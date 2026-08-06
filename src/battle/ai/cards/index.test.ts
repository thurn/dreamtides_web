import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { starterCardModels } from "./index";
import { buildAiConfiguredDeck } from "../deck";
import type { CardData } from "../../../types/cards";
import { opponentsFixture } from "../../../testing/opponents-fixture";

const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

/** Loads the real runtime card catalog the headless scripts read. */
function loadCardDatabase(): Map<number, CardData> {
  const json = readFileSync(
    join(REPO_ROOT, "public", "cards_v2-data.json"),
    "utf8",
  );
  const cards = JSON.parse(json) as CardData[];
  return new Map(cards.map((card) => [card.cardNumber, card]));
}

describe("starterCardModels registry", () => {
  it("is a Map instance", () => {
    expect(starterCardModels).toBeInstanceOf(Map);
  });

  it("every entry is keyed by its own cardNumber", () => {
    for (const [key, model] of starterCardModels) {
      expect(model.cardNumber).toBe(key);
    }
  });

  it("models exactly the ten Starter cards #510-519", () => {
    expect([...starterCardModels.keys()].sort((a, b) => a - b)).toEqual([
      510, 511, 512, 513, 514, 515, 516, 517, 518, 519,
    ]);
  });

  it("every distinct cardNumber in the real AI deck has a registered model", () => {
    const deck = buildAiConfiguredDeck(
      loadCardDatabase(),
      opponentsFixture().journeyAiDeck,
    );
    expect(deck.length).toBeGreaterThan(0);
    const distinct = new Set(deck.map((card) => card.cardNumber));
    for (const cardNumber of distinct) {
      expect(
        starterCardModels.has(cardNumber),
        `deck card #${cardNumber} has no StarterCardModel`,
      ).toBe(true);
    }
  });
});
