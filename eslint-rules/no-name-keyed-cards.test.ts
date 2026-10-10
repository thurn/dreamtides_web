import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, { isCardNameExpression } from "./no-name-keyed-cards.js";

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
      "avatar.name",
      "opponentAvatar.name",
      "avatarName",
      "card.name.toLowerCase()",
      "avatar.name.toLocaleLowerCase().trim()",
    ]) {
      expect(isCardNameExpression(expressionOf(source))).toBe(true);
    }
  });

  it("does not match other names, ids, or other calls on a name", () => {
    for (const source of [
      "site.name",
      "site.name.toLowerCase()",
      "avatar.id.toLowerCase()",
      "card.name.split(',')",
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

ruleTester.run("no-name-keyed-cards", rule, {
  valid: [
    {
      name: "display rendering may read a card name",
      code: `const label = card.name;`,
    },
    {
      name: "card ids are valid lookup keys",
      code: `const byId = new Map(cards.map((card) => [card.id, card])); byId.get(card.id);`,
    },
    {
      name: "non-card names are not affected",
      code: `const sitesByName = new Map(sites.map((site) => [site.name, site])); sitesByName.get(site.name);`,
    },
    {
      name: "card ids may be compared for equality",
      code: `const same = card.id === other.id; const differs = left.cardId !== right.cardId;`,
    },
    {
      name: "presence checks on a card name are not identity comparisons",
      code: `const missing = cardName === null || card.name !== undefined;`,
    },
    {
      name: "non-card names may be compared",
      code: `const same = site.name === other.name;`,
    },
    {
      name: "a case-folded name may be searched for display filtering",
      code: `const shown = card.name.toLocaleLowerCase().includes(query);`,
    },
    {
      name: "Avatar ids may be compared",
      code: `const same = avatar.id === descriptor.avatarId;`,
    },
  ],
  invalid: [
    {
      name: "Map entry keyed by card.name",
      code: `const byName = new Map(cards.map((card) => [card.name, card]));`,
      errors: [{ messageId: "nameKey" }],
    },
    {
      name: "Map lookup keyed by card.name",
      code: `byName.get(card.name); byName.has(card.name); byName.set(card.name, card);`,
      errors: [
        { messageId: "nameKey" },
        { messageId: "nameKey" },
        { messageId: "nameKey" },
      ],
    },
    {
      name: "Set keyed by mapped card names",
      code: `const names = new Set(cards.map((card) => card.name));`,
      errors: [{ messageId: "nameKey" }],
    },
    {
      name: "object index keyed by a nested card name",
      code: `const previous = seen[offer.card.name];`,
      errors: [{ messageId: "nameKey" }],
    },
    {
      name: "cardName variable used as a lookup key",
      code: `cardNames.add(selectedCardName); lookup[selectedCardName] = true;`,
      errors: [{ messageId: "nameKey" }, { messageId: "nameKey" }],
    },
    {
      name: "card names compared for equality",
      code: `const same = card.name === other.card.name; const differs = cardName !== "Ember";`,
      errors: [{ messageId: "nameEquality" }, { messageId: "nameEquality" }],
    },
    {
      name: "case-folded Avatar names compared for equality",
      code: `const same = avatar.name.toLocaleLowerCase() === descriptor.name.toLowerCase();`,
      errors: [{ messageId: "nameEquality" }],
    },
    {
      name: "Map lookup keyed by a case-folded Avatar name",
      code: `avatarsByName.get(opponentAvatar.name.toLowerCase());`,
      errors: [{ messageId: "nameKey" }],
    },
  ],
});
