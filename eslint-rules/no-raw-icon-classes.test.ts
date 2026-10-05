import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it } from "vitest";
import rule from "./no-raw-icon-classes.js";

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

ruleTester.run("no-raw-icon-classes", rule, {
  valid: [
    {
      name: "referencing a named glyph is fine in a governed file",
      code: `const el = <StandaloneGlyph glyph={GLYPHS.close} color="essence" />;`,
    },
    {
      name: "branding a game-data class through glyph() is the sanctioned boundary",
      code: `const icon = glyph("bxf bx-store-alt-2");`,
    },
    {
      name: "a glyph() call over a template (a runtime metadata class) is fine",
      code: "const icon = glyph(`bxf ${ICONS[type]}`);",
    },
    {
      name: "an unrelated string containing 'bx' as a substring is not flagged",
      code: `const label = "inbox contents";`,
    },
  ],
  invalid: [
    {
      name: "a raw <i className='bxf bx-x'> in a components-tier file",
      code: `const el = <i className="bxf bx-x" />;`,
      errors: [{ messageId: "rawIconClass" }],
    },
    {
      name: "a bare base class token is flagged",
      code: `const el = <i className="bx bx-crypto" />;`,
      errors: [{ messageId: "rawIconClass" }],
    },
    {
      name: "a raw icon-class constant is flagged",
      code: `const ESSENCE_ICON_CLASS = "bxf bx-crypto";`,
      errors: [{ messageId: "rawIconClass" }],
    },
    {
      name: "a bare template literal carrying a bx- class is flagged",
      code: "const cls = `bxf bx-cog ${extra}`;",
      errors: [{ messageId: "rawIconClass" }],
    },
  ],
});
