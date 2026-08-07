import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it } from "vitest";
import rule from "./no-manual-count-copy.js";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const SCREEN = "src/cumulus/screens/FixtureScreen.tsx";

tester.run("no-manual-count-copy", rule, {
  valid: [
    {
      filename: SCREEN,
      code: `const label = t("fixture-count", { count });`,
    },
    {
      filename: SCREEN,
      code: `const layout = count === 1 ? "single" : "grid";`,
    },
    {
      filename: SCREEN,
      code: `const width = count === 1 ? "min(58vw, 240px)" : "min(40vw, 180px)";`,
    },
    {
      filename: "src/editor/FixtureEditor.tsx",
      code: `const label = count === 1 ? "Card" : "Cards";`,
    },
  ],
  invalid: [
    {
      filename: SCREEN,
      code: `const label = count === 1 ? "Card" : "Cards";`,
      errors: [{ messageId: "manualCountCopy" }],
    },
    {
      filename: SCREEN,
      code: "const label = `memory counter${storedTime === 1 ? \"\" : \"s\"}`;",
      errors: [{ messageId: "manualCountCopy" }],
    },
    {
      filename: "src/screens/cumulus_adapters/fixture-view-model.ts",
      code: "const label = cards.length === 1 ? \"Take this card\" : `Take these ${cards.length} cards`;",
      errors: [{ messageId: "manualCountCopy" }],
    },
  ],
});
