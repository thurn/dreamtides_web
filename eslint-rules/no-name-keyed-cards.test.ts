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
    {
      name: "a local copy of a card name may be rendered",
      code: `function Label({ card }) { const name = card.name; const { name: title } = avatar; return <span title={title}>{name}</span>; }`,
    },
    {
      name: "a local case-folded card name may be searched for display filtering",
      code: `function matches(card, query) { const name = card.name.toLowerCase(); const { name: label } = card; return name.includes(query) || label.toLowerCase().includes(query); }`,
    },
    {
      name: "a destructured name of a non-card value may be compared",
      code: `function f(site, other) { const { name } = site; const label = site.name; return name === other.name || label === other.name; }`,
    },
    {
      name: "a reassignable local is not followed",
      code: `function f(card, other) { let name = card.name; name = other.id; return name === other.id; }`,
    },
    {
      name: "a shadowing parameter is not the outer alias",
      code: `const name = card.name; function f(name, other) { return name === other.name; }`,
    },
    {
      name: "an element of a card-name collection is not followed",
      code: `for (const value of cardNames) { if (value === other) {} }`,
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
    {
      name: "local alias of an Avatar name compared for equality",
      code: `function find(avatar, descriptors) { const name = avatar.name; return descriptors.find((d) => d.label === name); }`,
      errors: [{ messageId: "nameEquality" }],
    },
    {
      name: "local alias of a card name used as Map, Set, and object keys",
      code: `function track(card) { const key = card.name.toLowerCase(); seen.add(key); byKey.get(key); counts[key] = 1; }`,
      errors: [
        { messageId: "nameKey" },
        { messageId: "nameKey" },
        { messageId: "nameKey" },
      ],
    },
    {
      name: "destructured name of a card compared for equality",
      code: `function same(card, other) { const { name } = card; const { name: theirs = "" } = other.card; return name === theirs; }`,
      errors: [{ messageId: "nameEquality" }],
    },
    {
      name: "nested and loop destructuring of card names used as keys",
      code: `const { card: { name } } = offer; byName.get(name); for (const { name: label } of avatars) { seen.has(label); }`,
      errors: [{ messageId: "nameKey" }, { messageId: "nameKey" }],
    },
    {
      name: "aliases of aliases and optional or asserted card names",
      code: `function f(card, other) { const first = card?.name as string; const second = first; return second.trim() === other.id; }`,
      errors: [{ messageId: "nameEquality" }],
    },
  ],
});
