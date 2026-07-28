import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, { toRepoRelativePosix } from "./no-primitive-tokens.js";

describe("toRepoRelativePosix (no-primitive-tokens)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/journey_prototype/src/cumulus/docs/mockups/scene.tsx",
        "/Users/x/journey_prototype",
      ),
    ).toBe("src/cumulus/docs/mockups/scene.tsx");
  });
});

// RuleTester in ESLint 9 exposes `describe`/`it` hooks; wire them to vitest so
// each RuleTester case shows up as an individual vitest test.
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

ruleTester.run("no-primitive-tokens", rule, {
  valid: [
    {
      name: "semantic token() call in docs",
      filename: "src/cumulus/docs/DemoStage.tsx",
      code: `const s = { color: token("--text-primary"), borderRadius: token("--radius-panel") };`,
    },
    {
      name: "sanctioned spacing token() in docs",
      filename: "src/cumulus/docs/IntroSection.tsx",
      code: `const s = { gap: token("--space-6") };`,
    },
    {
      name: "primitive token() is allowed inside components/",
      filename: "src/cumulus/components/TidePill.tsx",
      code: `const fg = token("--primitive-rust-500");`,
    },
    {
      name: "primitive token() is allowed inside primitives/",
      filename: "src/cumulus/primitives/tokens.ts",
      code: `const v = token("--primitive-violet-400");`,
    },
    {
      name: "inspecting a primitive name (not applying it) is fine in docs",
      filename: "src/cumulus/docs/PrimitivesSection.tsx",
      code: `function isPrimitive(name) { return name.startsWith("--primitive-"); }`,
    },
    {
      name: "dynamic var(name) referencing a primitive is not a static match",
      filename: "src/cumulus/docs/PrimitivesSection.tsx",
      code: "const bg = `var(${name})`;",
    },
    {
      name: "semantic var() in an inline style string is fine",
      filename: "src/cumulus/docs/mockups/scene.tsx",
      code: "const s = { border: `1px solid var(--border-soft)` };",
    },
    {
      name: "outside cumulus: rule is inert",
      filename: "src/components/App.tsx",
      code: `const s = { color: token("--primitive-violet-400") };`,
    },
  ],
  invalid: [
    {
      name: "primitive token() call in a doc page",
      filename: "src/cumulus/docs/mockups/scene.tsx",
      code: `const s = { color: token("--primitive-violet-400") };`,
      errors: [{ messageId: "primitiveToken" }],
    },
    {
      name: "primitive var() in an inline style string literal",
      filename: "src/cumulus/docs/DemoStage.tsx",
      code: `const s = { border: "1px solid var(--primitive-line-soft)" };`,
      errors: [{ messageId: "primitiveInString" }],
    },
    {
      name: "primitive var() inside a template literal (CSS-in-JS)",
      filename: "src/cumulus/docs/demos/button.tsx",
      code: "const s = { boxShadow: `0 0 0 1px var(--primitive-violet-300)` };",
      errors: [{ messageId: "primitiveInString" }],
    },
    {
      name: "the adapter/builder layer in src/screens/cumulus_adapters is covered too",
      filename: "src/screens/cumulus_adapters/foo-view-model.ts",
      code: `const s = { color: token("--primitive-violet-400") };`,
      errors: [{ messageId: "primitiveToken" }],
    },
  ],
});
