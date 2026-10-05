import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it } from "vitest";
import rule from "./no-composed-type-voice.js";

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

ruleTester.run("no-composed-type-voice", rule, {
  valid: [
    {
      name: "a voice applied with a single token() call is fine",
      code: `const style = { font: token("--t-body") };`,
    },
    {
      name: "a bare var(--t-…) string is fine",
      code: `const style = { font: "var(--t-body)" };`,
    },
    {
      name: "fontStyle layered as its own property is fine",
      code: `const style = { font: token("--t-body-sm"), fontStyle: "italic" };`,
    },
    {
      name: "non-voice tokens may be composed freely",
      code: `const style = { border: \`1px solid \${token("--border-mid")}\` };`,
    },
    {
      name: "a template that is exactly one voice reference is fine",
      code: `const style = { font: \`\${token("--t-body")}\` };`,
    },
  ],
  invalid: [
    {
      name: "a weight prefix composed onto a voice token",
      code: "const style = { font: `500 ${token(\"--t-caption\")}` };",
      errors: [{ messageId: "composedVoice" }],
    },
    {
      name: "a face appended after a voice token",
      code: 'const style = { font: `${token("--t-caption")} ${token("--font-ui")}` };',
      errors: [{ messageId: "composedVoice" }],
    },
    {
      name: "the full poisoned-exemplar shape (weight + voice + face)",
      code: 'const style = { font: `500 ${token("--t-caption")} ${token("--font-ui")}` };',
      errors: [{ messageId: "composedVoice" }],
    },
    {
      name: "a composed literal var(--t-…) string",
      code: `const style = { font: "italic var(--t-body-sm)" };`,
      errors: [{ messageId: "composedVoice" }],
    },
    {
      name: "two voice tokens in one value",
      code: `const style = { font: "var(--t-body) var(--t-caption)" };`,
      errors: [{ messageId: "composedVoice" }],
    },
  ],
});
