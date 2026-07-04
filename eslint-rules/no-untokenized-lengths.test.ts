import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, {
  toRepoRelativePosix,
  isProductUiFile,
} from "./no-untokenized-lengths.js";
import { spaceTokenFor } from "./tango-token-index.js";

describe("toRepoRelativePosix (no-untokenized-lengths)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/quest_prototype/src/tango/screens/HomeScreen.tsx",
        "/Users/x/quest_prototype",
      ),
    ).toBe("src/tango/screens/HomeScreen.tsx");
  });
});

describe("isProductUiFile (no-untokenized-lengths)", () => {
  it("covers the product tier and the adapter layer", () => {
    expect(isProductUiFile("src/tango/screens/HomeScreen.tsx")).toBe(true);
    expect(isProductUiFile("src/screens/tango/HomeScreenAdapter.tsx")).toBe(
      true,
    );
  });
  it("exempts primitives, components, docs, and non-tango files", () => {
    expect(isProductUiFile("src/tango/components/Button.tsx")).toBe(false);
    expect(isProductUiFile("src/tango/docs/TangoApp.tsx")).toBe(false);
    expect(isProductUiFile("src/screens/LegacyScreen.tsx")).toBe(false);
  });
});

// Derive an on-scale step and an off-scale length from the live stylesheet so
// the tests never pin specific scale VALUES (the scale is design data).
const KNOWN_STEPS = Array.from({ length: 512 }, (_, px) => px).filter(
  (px) => px > 0 && spaceTokenFor(px) !== null,
);
const ON_SCALE = KNOWN_STEPS[KNOWN_STEPS.length - 1];
const ON_SCALE_TOKEN = spaceTokenFor(ON_SCALE);
const OFF_SCALE = Array.from({ length: 512 }, (_, px) => px).find(
  (px) => px > 0 && spaceTokenFor(px) === null,
);

describe("spaceTokenFor", () => {
  it("finds a non-trivial spacing scale in the live stylesheet", () => {
    expect(KNOWN_STEPS.length).toBeGreaterThan(3);
    expect(OFF_SCALE).toBeDefined();
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

ruleTester.run("no-untokenized-lengths", rule, {
  valid: [
    {
      name: "token-valued spacing is the sanctioned shape",
      filename: SCREEN,
      code: `const el = <div style={{ gap: token("--space-5"), padding: "0 var(--space-4)" }} />;`,
    },
    {
      name: "zero needs no token",
      filename: SCREEN,
      code: `const el = <div style={{ margin: 0, padding: "0" }} />;`,
    },
    {
      name: "box measures are content-driven layout, not rhythm",
      filename: SCREEN,
      code: `const el = <div style={{ maxWidth: 340, minHeight: 62, width: "100%" }} />;`,
    },
    {
      name: "percentages and non-px units on offsets are not flagged",
      filename: SCREEN,
      code: `const el = <div style={{ left: "50%", top: "1em" }} />;`,
    },
    {
      name: "hairline borders and type metrics are out of scope",
      filename: SCREEN,
      code: "const el = <div style={{ border: `2px solid ${token(\"--border-mid\")}`, letterSpacing: \"0.06em\", lineHeight: 1.5 }} />;",
    },
    {
      name: "view-model data with CSS-ish field names is not a style object",
      filename: "src/screens/tango/atlas-view-model.ts",
      code: `export function build() { return { top: ${ON_SCALE}, left: 340, gap: 3 }; }`,
    },
    {
      name: "the components tier authors raw values legitimately",
      filename: "src/tango/components/Button.tsx",
      code: `const el = <div style={{ gap: ${ON_SCALE} }} />;`,
    },
    {
      name: "files outside the product tier are inert",
      filename: "src/screens/LegacyScreen.tsx",
      code: `const el = <div style={{ gap: ${ON_SCALE} }} />;`,
    },
  ],
  invalid: [
    {
      name: "a bare numeric spacing step is autofixed to its token",
      filename: SCREEN,
      code: `const el = <div style={{ gap: ${ON_SCALE} }} />;`,
      output: `const el = <div style={{ gap: "var(${ON_SCALE_TOKEN})" }} />;`,
      errors: [{ messageId: "rawSpacingWithToken" }],
    },
    {
      name: "a whole 'Npx' string is autofixed to its token",
      filename: SCREEN,
      code: `const el = <div style={{ marginTop: "${ON_SCALE}px" }} />;`,
      output: `const el = <div style={{ marginTop: "var(${ON_SCALE_TOKEN})" }} />;`,
      errors: [{ messageId: "rawSpacingWithToken" }],
    },
    {
      name: "an off-scale length asks for snapping, no autofix",
      filename: SCREEN,
      code: `const el = <div style={{ gap: ${OFF_SCALE} }} />;`,
      output: null,
      errors: [{ messageId: "rawSpacingOffScale" }],
    },
    {
      name: "each px length in a shorthand string is reported",
      filename: SCREEN,
      code: `const el = <div style={{ padding: "${ON_SCALE}px ${OFF_SCALE}px" }} />;`,
      output: null,
      errors: [
        { messageId: "rawSpacingWithToken" },
        { messageId: "rawSpacingOffScale" },
      ],
    },
    {
      name: "raw px inside a template chunk is reported",
      filename: SCREEN,
      code: 'const el = <div style={{ padding: `${token("--space-6")} 18px` }} />;',
      errors: [{ messageId: "rawSpacingOffScale" }],
    },
    {
      name: "a raw corner radius must use a --radius-* role",
      filename: SCREEN,
      code: `const el = <div style={{ borderRadius: ${ON_SCALE} }} />;`,
      errors: [{ messageId: "rawRadius" }],
    },
    {
      name: "extracted style consts are style context too",
      filename: SCREEN,
      code: `const cardStyle = { gap: ${ON_SCALE} };`,
      output: `const cardStyle = { gap: "var(${ON_SCALE_TOKEN})" };`,
      errors: [{ messageId: "rawSpacingWithToken" }],
    },
    {
      name: "adapters are covered too",
      filename: "src/screens/tango/HomeScreenAdapter.tsx",
      code: `const el = <div style={{ gap: ${ON_SCALE} }} />;`,
      output: `const el = <div style={{ gap: "var(${ON_SCALE_TOKEN})" }} />;`,
      errors: [{ messageId: "rawSpacingWithToken" }],
    },
  ],
});
