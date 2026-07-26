import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, {
  isCardNameExpression,
  toRepoRelativePosix,
} from "./no-name-keyed-cards.js";

describe("toRepoRelativePosix (no-name-keyed-cards)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/quest_prototype/src/cumulus/screens/DraftScreen.tsx",
        "/Users/x/quest_prototype",
      ),
    ).toBe("src/cumulus/screens/DraftScreen.tsx");
  });
});

describe("isCardNameExpression", () => {
  function expressionOf(source: string): unknown {
    const program = tsParser.parse(`const x = ${source};`, {
      ecmaVersion: 2022,
      sourceType: "module",
    }) as unknown as {
      body: Array<{
        declarations?: Array<{ init?: unknown }>;
      }>;
    };
    return program.body[0]?.declarations?.[0]?.init;
  }

  it("matches card display-name expressions", () => {
    for (const source of [
      "card.name",
      "offer.card.name",
      "selectedCard.name",
      "cardName",
      "selected_cardName",
    ]) {
      expect(isCardNameExpression(expressionOf(source))).toBe(true);
    }
  });

  it("does not match non-card names or card ids", () => {
    for (const source of [
      "dreamAvatar.name",
      "site.name",
      "card.id",
      "selectedCard.id",
      "name",
    ]) {
      expect(isCardNameExpression(expressionOf(source))).toBe(false);
    }
  });
});

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const SCREEN = "src/cumulus/screens/DraftScreen.tsx";
const ADAPTER = "src/screens/cumulus_adapters/draft-view-model.ts";

ruleTester.run("no-name-keyed-cards", rule, {
  valid: [
    {
      name: "display rendering may read a card name",
      filename: SCREEN,
      code: `const label = card.name;`,
    },
    {
      name: "card ids are valid lookup keys",
      filename: SCREEN,
      code: `const byId = new Map(cards.map((card) => [card.id, card])); byId.get(card.id);`,
    },
    {
      name: "non-card names are not affected",
      filename: SCREEN,
      code: `const sitesByName = new Map(sites.map((site) => [site.name, site])); sitesByName.get(site.name);`,
    },
    {
      name: "outside Cumulus product surfaces the rule is inert",
      filename: "src/components/LegacyCardList.tsx",
      code: `const byName = new Map(cards.map((card) => [card.name, card]));`,
    },
  ],
  invalid: [
    {
      name: "Map entry keyed by card.name",
      filename: SCREEN,
      code: `const byName = new Map(cards.map((card) => [card.name, card]));`,
      errors: [{ messageId: "nameKey" }],
    },
    {
      name: "Map lookup keyed by card.name",
      filename: SCREEN,
      code: `byName.get(card.name); byName.has(card.name); byName.set(card.name, card);`,
      errors: [
        { messageId: "nameKey" },
        { messageId: "nameKey" },
        { messageId: "nameKey" },
      ],
    },
    {
      name: "Set keyed by mapped card names",
      filename: SCREEN,
      code: `const names = new Set(cards.map((card) => card.name));`,
      errors: [{ messageId: "nameKey" }],
    },
    {
      name: "object index keyed by a nested card name",
      filename: ADAPTER,
      code: `const previous = seen[offer.card.name];`,
      errors: [{ messageId: "nameKey" }],
    },
    {
      name: "cardName variable used as a lookup key",
      filename: ADAPTER,
      code: `cardNames.add(selectedCardName); lookup[selectedCardName] = true;`,
      errors: [{ messageId: "nameKey" }, { messageId: "nameKey" }],
    },
  ],
});
