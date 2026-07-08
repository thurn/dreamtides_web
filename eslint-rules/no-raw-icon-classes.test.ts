import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, {
  toRepoRelativePosix,
  isGovernedFile,
  isTestFile,
} from "./no-raw-icon-classes.js";

describe("toRepoRelativePosix (no-raw-icon-classes)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/quest_prototype/src/tango/components/hud/QuestStatusBar.tsx",
        "/Users/x/quest_prototype",
      ),
    ).toBe("src/tango/components/hud/QuestStatusBar.tsx");
  });
});

describe("isTestFile", () => {
  it("matches a .test.tsx file", () => {
    expect(isTestFile("src/tango/components/card/RulesText.test.tsx")).toBe(
      true,
    );
  });
  it("does not match a production file", () => {
    expect(isTestFile("src/tango/components/card/RulesText.tsx")).toBe(false);
  });
});

describe("isGovernedFile", () => {
  it("governs a tango component file", () => {
    expect(isGovernedFile("src/tango/components/hud/QuestStatusBar.tsx")).toBe(
      true,
    );
  });
  it("governs the adapter layer", () => {
    expect(isGovernedFile("src/screens/tango_adapters/ShopAdapter.tsx")).toBe(
      true,
    );
  });
  it("exempts the glyph vocabulary file", () => {
    expect(isGovernedFile("src/tango/primitives/glyph.ts")).toBe(false);
  });
  it("exempts the doc site", () => {
    expect(isGovernedFile("src/tango/docs/mockups/site-node.tsx")).toBe(false);
  });
  it("exempts test files (they assert against rendered classes)", () => {
    expect(isGovernedFile("src/tango/components/card/RulesText.test.tsx")).toBe(
      false,
    );
  });
  it("ignores files outside the tango tier", () => {
    expect(isGovernedFile("src/screens/ShopScreen.tsx")).toBe(false);
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

const GLYPH_FILE = "src/tango/primitives/glyph.ts";
const COMPONENT = "src/tango/components/hud/QuestStatusBar.tsx";

ruleTester.run("no-raw-icon-classes", rule, {
  valid: [
    {
      name: "the glyph vocabulary file may hold raw class strings",
      filename: GLYPH_FILE,
      code: `export const essence = g("bxf bx-crypto");`,
    },
    {
      name: "referencing a named glyph is fine in a governed file",
      filename: COMPONENT,
      code: `const el = <GlowIcon iconClass={GLYPHS.close} color="essence" />;`,
    },
    {
      name: "branding a game-data class through glyph() is the sanctioned boundary",
      filename: COMPONENT,
      code: `const icon = glyph("bxf bx-store-alt-2");`,
    },
    {
      name: "a glyph() call over a template (a runtime metadata class) is fine",
      filename: COMPONENT,
      code: "const icon = glyph(`bxf ${ICONS[type]}`);",
    },
    {
      name: "an unrelated string containing 'bx' as a substring is not flagged",
      filename: COMPONENT,
      code: `const label = "inbox contents";`,
    },
    {
      name: "a test file may query the rendered class string",
      filename: "src/tango/components/card/RulesText.test.tsx",
      code: `const flame = container.querySelector("i.bxf.bx-fire-alt");`,
    },
    {
      name: "raw class strings outside the tango tier are inert",
      filename: "src/screens/ShopScreen.tsx",
      code: `const el = <i className="bxf bx-refresh-cw" />;`,
    },
  ],
  invalid: [
    {
      name: "a raw <i className='bxf bx-x'> in a components-tier file",
      filename: COMPONENT,
      code: `const el = <i className="bxf bx-x" />;`,
      errors: [{ messageId: "rawIconClass" }],
    },
    {
      name: "a bare base class token is flagged",
      filename: COMPONENT,
      code: `const el = <i className="bx bx-crypto" />;`,
      errors: [{ messageId: "rawIconClass" }],
    },
    {
      name: "a raw icon-class constant is flagged",
      filename: COMPONENT,
      code: `const ESSENCE_ICON_CLASS = "bxf bx-crypto";`,
      errors: [{ messageId: "rawIconClass" }],
    },
    {
      name: "a bare template literal carrying a bx- class is flagged",
      filename: COMPONENT,
      code: "const cls = `bxf bx-cog ${extra}`;",
      errors: [{ messageId: "rawIconClass" }],
    },
    {
      name: "the adapter layer is covered too",
      filename: "src/screens/tango_adapters/ShopAdapter.tsx",
      code: `const cls = "bxf bx-refresh-cw";`,
      errors: [{ messageId: "rawIconClass" }],
    },
  ],
});
