import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, {
  toRepoRelativePosix,
  isProductUiFile,
  isTangoOwnedFile,
} from "./valid-token-references.js";
import { knownTokenNames } from "./tango-token-index.js";

describe("toRepoRelativePosix (valid-token-references)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/quest_prototype/src/tango/screens/HomeScreen.tsx",
        "/Users/x/quest_prototype",
      ),
    ).toBe("src/tango/screens/HomeScreen.tsx");
  });
});

describe("isProductUiFile", () => {
  it("covers screens, composition files, and the adapter layer", () => {
    expect(isProductUiFile("src/tango/screens/HomeScreen.tsx")).toBe(true);
    expect(isProductUiFile("src/screens/tango_adapters/HomeScreenAdapter.tsx")).toBe(
      true,
    );
    expect(isProductUiFile("src/screens/tango_adapters/home-view-model.ts")).toBe(true);
  });
  it("exempts primitives, components, docs, and non-tango files", () => {
    expect(isProductUiFile("src/tango/primitives/tokens.ts")).toBe(false);
    expect(isProductUiFile("src/tango/components/Button.tsx")).toBe(false);
    expect(isProductUiFile("src/tango/docs/TangoApp.tsx")).toBe(false);
    expect(isProductUiFile("src/screens/LegacyScreen.tsx")).toBe(false);
  });
});

describe("isTangoOwnedFile", () => {
  it("governs all of src/tango/ (components included) plus the adapter layer", () => {
    expect(isTangoOwnedFile("src/tango/components/Button.tsx")).toBe(true);
    expect(isTangoOwnedFile("src/tango/screens/HomeScreen.tsx")).toBe(true);
    expect(isTangoOwnedFile("src/screens/tango_adapters/HomeScreenAdapter.tsx")).toBe(
      true,
    );
  });
  it("exempts the primitive and doc tiers, and non-tango files", () => {
    expect(isTangoOwnedFile("src/tango/primitives/tokens.ts")).toBe(false);
    expect(isTangoOwnedFile("src/tango/docs/TangoApp.tsx")).toBe(false);
    expect(isTangoOwnedFile("src/screens/LegacyScreen.tsx")).toBe(false);
  });
});

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

const SCREEN = "src/tango/screens/HomeScreen.tsx";
const ADAPTER = "src/screens/tango_adapters/HomeScreenAdapter.tsx";

// Derive a real token from the live stylesheet so the tests never pin a
// specific token NAME (token vocabulary is design data, subject to change).
const REAL_TOKEN = [...knownTokenNames()][0];

// A name guaranteed not to collide with any declared token.
const BOGUS_TOKEN = "--this-token-does-not-exist-anywhere";

ruleTester.run("valid-token-references", rule, {
  valid: [
    {
      name: "a declared token referenced via var() is fine",
      filename: SCREEN,
      code: `const style = { color: "var(${REAL_TOKEN})" };`,
    },
    {
      name: "a declared token with a fallback is fine",
      filename: SCREEN,
      code: `const style = { color: "var(${REAL_TOKEN}, red)" };`,
    },
    {
      name: "template chunks referencing declared tokens are fine",
      filename: SCREEN,
      code: `const style = { border: \`1px solid var(${REAL_TOKEN})\` };`,
    },
    {
      name: "strings without var() references are ignored",
      filename: SCREEN,
      code: `const label = "starts --like-a-token but is prose";`,
    },
    {
      name: "a declared token referenced from a components file is fine",
      filename: "src/tango/components/GameCard.tsx",
      code: `const style = { color: "var(${REAL_TOKEN})" };`,
    },
    {
      name: "allowlisted component-local runtime vars are fine in a components file",
      filename: "src/tango/components/GameCard.tsx",
      code: `const style = { width: "var(--atlas-node-size)", filter: "blur(var(--cv-name-color))" };`,
    },
    {
      name: "files outside the product tier are inert",
      filename: "src/screens/LegacyScreen.tsx",
      code: `const style = { color: "var(${BOGUS_TOKEN})" };`,
    },
  ],
  invalid: [
    {
      name: "components are now governed — an unknown token is reported",
      filename: "src/tango/components/GameCard.tsx",
      code: `const style = { color: "var(${BOGUS_TOKEN})" };`,
      errors: [{ messageId: "unknownToken" }],
    },
    {
      name: "a typo'd token in a string literal",
      filename: SCREEN,
      code: `const style = { color: "var(${BOGUS_TOKEN})" };`,
      errors: [{ messageId: "unknownToken" }],
    },
    {
      name: "an invented token in a template chunk",
      filename: SCREEN,
      code: `const style = { border: \`1px solid var(${BOGUS_TOKEN})\` };`,
      errors: [{ messageId: "unknownToken" }],
    },
    {
      name: "adapters are covered too",
      filename: ADAPTER,
      code: `const style = { color: "var(${BOGUS_TOKEN})" };`,
      errors: [{ messageId: "unknownToken" }],
    },
    {
      name: "each unknown reference in one string is reported",
      filename: SCREEN,
      code: `const style = { boxShadow: "0 0 4px var(${BOGUS_TOKEN}), 0 0 8px var(${BOGUS_TOKEN}-b)" };`,
      errors: [{ messageId: "unknownToken" }, { messageId: "unknownToken" }],
    },
  ],
});
