import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it } from "vitest";
import rule from "./no-raw-safe-area-env.js";

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

ruleTester.run("no-raw-safe-area-env", rule, {
  valid: [
    {
      name: "the injected safe-area token read is fine",
      code: `const top = "var(--safe-area-inset-top)";`,
    },
    {
      name: "a design-floor token() read is fine",
      code: `const top = token("--safe-top");`,
    },
  ],
  invalid: [
    {
      name: "a raw env() in a plain string literal",
      code: `const TOP = "env(safe-area-inset-top)";`,
      errors: [{ messageId: "rawSafeAreaEnv" }],
    },
    {
      name: "a raw env() inside a template chunk",
      code: 'const TOP = `max(env(safe-area-inset-top), ${token("--safe-top")})`;',
      errors: [{ messageId: "rawSafeAreaEnv" }],
    },
  ],
});
