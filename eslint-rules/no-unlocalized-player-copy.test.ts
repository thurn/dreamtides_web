import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it } from "vitest";
import rule from "./no-unlocalized-player-copy.js";

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

tester.run("no-unlocalized-player-copy", rule, {
  valid: [
    {
      filename: "src/cumulus/screens/FixtureScreen.tsx",
      code: `const view = { label: t("fixture-label") };`,
    },
    {
      filename: "src/cumulus/screens/FixtureScreen.tsx",
      code: `<Button label={t("fixture-action")} title={createMessageDescriptor("fixture-title")} />`,
    },
    {
      filename: "src/cumulus/screens/FixtureScreen.tsx",
      code: `<div data-testid="loading-card" className="glass-panel" />`,
    },
    {
      filename: "src/cumulus/screens/FixtureScreen.tsx",
      code: `const copy = { label: authoredLabel, title: authoredTitle };`,
    },
    {
      filename: "src/cumulus/screens/FixtureScreen.tsx",
      code: `// localization-ignore: authored fixture value\nconst copy = { label: "Card UUID" };`,
    },
    {
      filename: "src/editor/FixtureEditor.tsx",
      code: `<Button label="Developer command" />`,
    },
    {
      filename: "src/cumulus/screens/FixtureScreen.tsx",
      code: `throw new Error("Developer failure"); console.error("Diagnostic failure");`,
    },
  ],
  invalid: [
    {
      filename: "src/cumulus/screens/FixtureScreen.tsx",
      code: `<Button label="Back" />`,
      errors: [{ messageId: "unlocalized" }],
    },
    {
      filename: "src/cumulus/screens/FixtureScreen.tsx",
      code: `<Panel title={"Loading"} subtitle={\`Please wait\`} />`,
      errors: [
        { messageId: "unlocalized" },
        { messageId: "unlocalized" },
      ],
    },
    {
      filename: "src/cumulus/screens/FixtureScreen.tsx",
      code: `const actions = [{ label: "Choose" }, { title: "Confirm" }];`,
      errors: [
        { messageId: "unlocalized" },
        { messageId: "unlocalized" },
      ],
    },
    {
      filename: "src/rules/battle/effect-step.ts",
      code: `const prompt = { label: "Choose a card", subtitle: "Pick one" };`,
      errors: [
        { messageId: "unlocalized" },
        { messageId: "unlocalized" },
      ],
    },
    {
      filename: "src/cumulus/screens/FixtureScreen.tsx",
      code: `<span>{"Static text"}</span>`,
      errors: [{ messageId: "unlocalized" }],
    },
    {
      filename: "src/cumulus/screens/FixtureScreen.tsx",
      code: `const option = { label: count === 1 ? "Card" : "Cards" };`,
      errors: [{ messageId: "unlocalized" }],
    },
  ],
});
