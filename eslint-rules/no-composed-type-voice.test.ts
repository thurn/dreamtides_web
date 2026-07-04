import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, {
  toRepoRelativePosix,
  isProductUiFile,
} from "./no-composed-type-voice.js";

describe("toRepoRelativePosix (no-composed-type-voice)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/quest_prototype/src/tango/screens/HomeScreen.tsx",
        "/Users/x/quest_prototype",
      ),
    ).toBe("src/tango/screens/HomeScreen.tsx");
  });
});

describe("isProductUiFile (no-composed-type-voice)", () => {
  it("covers the product tier and the adapter layer", () => {
    expect(isProductUiFile("src/tango/screens/HomeScreen.tsx")).toBe(true);
    expect(isProductUiFile("src/screens/tango/home-view-model.ts")).toBe(true);
  });
  it("exempts primitives, components, docs, and non-tango files", () => {
    expect(isProductUiFile("src/tango/components/InfoCard.tsx")).toBe(false);
    expect(isProductUiFile("src/tango/docs/TangoApp.tsx")).toBe(false);
    expect(isProductUiFile("src/screens/LegacyScreen.tsx")).toBe(false);
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

ruleTester.run("no-composed-type-voice", rule, {
  valid: [
    {
      name: "a voice applied with a single token() call is fine",
      filename: SCREEN,
      code: `const style = { font: token("--t-body") };`,
    },
    {
      name: "a bare var(--t-…) string is fine",
      filename: SCREEN,
      code: `const style = { font: "var(--t-body)" };`,
    },
    {
      name: "fontStyle layered as its own property is fine",
      filename: SCREEN,
      code: `const style = { font: token("--t-body-sm"), fontStyle: "italic" };`,
    },
    {
      name: "non-voice tokens may be composed freely",
      filename: SCREEN,
      code: `const style = { border: \`1px solid \${token("--border-mid")}\` };`,
    },
    {
      name: "a template that is exactly one voice reference is fine",
      filename: SCREEN,
      code: `const style = { font: \`\${token("--t-body")}\` };`,
    },
    {
      name: "files outside the product tier are inert",
      filename: "src/screens/LegacyScreen.tsx",
      code: "const style = { font: `500 ${token(\"--t-caption\")} serif` };",
    },
  ],
  invalid: [
    {
      name: "a weight prefix composed onto a voice token",
      filename: SCREEN,
      code: "const style = { font: `500 ${token(\"--t-caption\")}` };",
      errors: [{ messageId: "composedVoice" }],
    },
    {
      name: "a face appended after a voice token",
      filename: SCREEN,
      code: 'const style = { font: `${token("--t-caption")} ${token("--font-ui")}` };',
      errors: [{ messageId: "composedVoice" }],
    },
    {
      name: "the full poisoned-exemplar shape (weight + voice + face)",
      filename: SCREEN,
      code: 'const style = { font: `500 ${token("--t-caption")} ${token("--font-ui")}` };',
      errors: [{ messageId: "composedVoice" }],
    },
    {
      name: "a composed literal var(--t-…) string",
      filename: SCREEN,
      code: `const style = { font: "italic var(--t-body-sm)" };`,
      errors: [{ messageId: "composedVoice" }],
    },
    {
      name: "two voice tokens in one value",
      filename: SCREEN,
      code: `const style = { font: "var(--t-body) var(--t-caption)" };`,
      errors: [{ messageId: "composedVoice" }],
    },
    {
      name: "adapters and view-models are covered too",
      filename: "src/screens/tango/home-view-model.ts",
      code: `const font = "700 var(--t-title-sm)";`,
      errors: [{ messageId: "composedVoice" }],
    },
  ],
});
