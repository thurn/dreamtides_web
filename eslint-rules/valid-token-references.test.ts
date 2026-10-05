import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule from "./valid-token-references.js";
import { knownTokenNames } from "./cumulus-token-index.js";

describe("knownTokenNames", () => {
  it("loads a non-trivial token set from the live stylesheet", () => {
    // Structural assertion only — token names/values are design data. An empty
    // set would silently turn the rule into a no-op.
    expect(knownTokenNames().size).toBeGreaterThan(50);
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

// Derive a real token from the live stylesheet so the tests never pin a
// specific token NAME (token vocabulary is design data, subject to change).
const REAL_TOKEN = [...knownTokenNames()][0];

// A name guaranteed not to collide with any declared token.
const BOGUS_TOKEN = "--this-token-does-not-exist-anywhere";

ruleTester.run("valid-token-references", rule, {
  valid: [
    {
      name: "a declared token referenced via var() is fine",
      code: `const style = { color: "var(${REAL_TOKEN})" };`,
    },
    {
      name: "a declared token with a fallback is fine",
      code: `const style = { color: "var(${REAL_TOKEN}, red)" };`,
    },
    {
      name: "template chunks referencing declared tokens are fine",
      code: `const style = { border: \`1px solid var(${REAL_TOKEN})\` };`,
    },
    {
      name: "strings without var() references are ignored",
      code: `const label = "starts --like-a-token but is prose";`,
    },
    {
      name: "allowlisted component-local runtime vars are fine",
      code: `const style = { width: "var(--atlas-node-size)", filter: "blur(var(--cv-name-color))" };`,
    },
  ],
  invalid: [
    {
      name: "a typo'd token in a string literal",
      code: `const style = { color: "var(${BOGUS_TOKEN})" };`,
      errors: [{ messageId: "unknownToken" }],
    },
    {
      name: "an invented token in a template chunk",
      code: `const style = { border: \`1px solid var(${BOGUS_TOKEN})\` };`,
      errors: [{ messageId: "unknownToken" }],
    },
    {
      name: "each unknown reference in one string is reported",
      code: `const style = { boxShadow: "0 0 4px var(${BOGUS_TOKEN}), 0 0 8px var(${BOGUS_TOKEN}-b)" };`,
      errors: [{ messageId: "unknownToken" }, { messageId: "unknownToken" }],
    },
  ],
});
