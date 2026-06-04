import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { STARTER_CARD_NUMBERS } from "./starter-cards";

// Parse cards_v2.toml with the same TOML parser scripts/setup-assets.mjs uses
// (smol-toml) so this test exercises the exact data the asset pipeline reads.
const tomlPath = fileURLToPath(
  new URL("../../data/tabula/cards_v2.toml", import.meta.url),
);

interface CardRow {
  name?: unknown;
  rarity?: unknown;
  "card-type"?: unknown;
  "card-number"?: unknown;
}

const parsed = parse(readFileSync(tomlPath, "utf8")) as unknown as {
  cards: CardRow[];
};
const cards = parsed.cards;

describe("starter cards", () => {
  it("STARTER_CARD_NUMBERS is exactly the 10 ported numbers", () => {
    expect([...STARTER_CARD_NUMBERS]).toEqual([
      510, 511, 512, 513, 514, 515, 516, 517, 518, 519,
    ]);
  });

  it("each starter number matches exactly one card row", () => {
    for (const num of STARTER_CARD_NUMBERS) {
      const matches = cards.filter((c) => c["card-number"] === num);
      expect(
        matches.length,
        `expected exactly one card row with card-number ${num}`,
      ).toBe(1);
    }
  });

  it("the set of Starter-rarity rows equals STARTER_CARD_NUMBERS", () => {
    const starterRowNumbers = cards
      .filter((c) => c.rarity === "Starter")
      .map((c) => c["card-number"] as number)
      .sort((a, b) => a - b);
    const expected = [...STARTER_CARD_NUMBERS].sort((a, b) => a - b);
    expect(starterRowNumbers).toEqual(expected);
  });

  it("each starter row has a non-empty name and a valid card-type", () => {
    for (const num of STARTER_CARD_NUMBERS) {
      const row = cards.find((c) => c["card-number"] === num);
      expect(row, `missing card row for card-number ${num}`).toBeDefined();
      const name = row!.name;
      expect(
        typeof name === "string" && name.length > 0,
        `card ${num} must have a non-empty name`,
      ).toBe(true);
      const cardType = row!["card-type"];
      expect(
        cardType === "Character" || cardType === "Event",
        `card ${num} must be Character or Event`,
      ).toBe(true);
    }
  });
});
