import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, { toRepoRelativePosix } from "./no-hardcoded-values.js";
import { colorTokenFor, normalizeColor } from "./cumulus-token-index.js";

describe("toRepoRelativePosix (no-hardcoded-values)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/quest_prototype/src/cumulus/screens/HomeScreen.tsx",
        "/Users/x/quest_prototype",
      ),
    ).toBe("src/cumulus/screens/HomeScreen.tsx");
  });
});

describe("normalizeColor", () => {
  it("expands 3/4-digit hex to 6/8 and lowercases", () => {
    expect(normalizeColor("#ABC")).toBe("#aabbcc");
    expect(normalizeColor("#abcd")).toBe("#aabbccdd");
    expect(normalizeColor("#A855F7")).toBe("#a855f7");
  });
  it("collapses whitespace inside rgb/hsl functions", () => {
    expect(normalizeColor("rgba(168, 85, 247, 0.16)")).toBe(
      "rgba(168,85,247,0.16)",
    );
  });
  it("returns null for non-color text", () => {
    expect(normalizeColor("12px")).toBeNull();
    expect(normalizeColor("red")).toBeNull();
  });
});

// Derive fixtures from the live stylesheet so these tests never assert a
// specific palette VALUE (colors are design data, subject to change). We only
// assert structural properties: a color declared in the sheet resolves to SOME
// token, and a token suggestion is never a raw primitive when a cleaner one
// exists.
const TOKENS_CSS = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../src/cumulus/primitives/cumulus-tokens.css",
  ),
  "utf8",
);

/** The first 6-digit hex literal actually declared in the sheet — guaranteed to
 * be a real palette color whatever its value happens to be today. */
const KNOWN_HEX = /#[0-9a-fA-F]{6}\b/.exec(TOKENS_CSS)?.[0] ?? "#a855f7";
const KNOWN_TOKEN = colorTokenFor(KNOWN_HEX);

/** A hex guaranteed NOT to be in the palette, found by scanning upward. */
function firstUnknownHex(): string {
  for (let n = 1; n < 0x1000; n++) {
    const hex = "#" + n.toString(16).padStart(6, "0");
    if (colorTokenFor(hex) === null) {
      return hex;
    }
  }
  throw new Error("could not find an unused hex");
}
const UNKNOWN_HEX = firstUnknownHex();

describe("colorTokenFor", () => {
  it("maps a real palette color to a token, preferring a semantic name", () => {
    expect(KNOWN_TOKEN).not.toBeNull();
    expect(KNOWN_TOKEN?.startsWith("--")).toBe(true);
  });
  it("returns null for a color not in the palette", () => {
    expect(colorTokenFor(UNKNOWN_HEX)).toBeNull();
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

const SCREEN = "src/cumulus/screens/HomeScreen.tsx";

ruleTester.run("no-hardcoded-values", rule, {
  valid: [
    {
      name: "a semantic token reference is fine",
      filename: SCREEN,
      code: `const s = { color: "var(--accent)", background: "var(--surface-card)" };`,
    },
    {
      name: "non-color values (length, zIndex, opacity) are not flagged",
      filename: SCREEN,
      code: `const s = { padding: "12px", zIndex: 100, opacity: 0.5, flex: 1 };`,
    },
    {
      name: "named colors are left to review",
      filename: SCREEN,
      code: `const s = { color: "red" };`,
    },
    {
      name: "components/ may author raw color values",
      filename: "src/cumulus/components/Widget.tsx",
      code: `const s = { color: "${KNOWN_HEX}" };`,
    },
    {
      name: "primitives/ define the colors",
      filename: "src/cumulus/primitives/tokens.ts",
      code: `const s = { color: "${UNKNOWN_HEX}" };`,
    },
    {
      name: "docs demos may show arbitrary sample colors",
      filename: "src/cumulus/docs/mockups/scene.tsx",
      code: `const s = { background: "rgba(8,5,17,0.4)" };`,
    },
    {
      name: "files outside src/cumulus are inert",
      filename: "src/screens/LegacyScreen.tsx",
      code: `const s = { color: "${UNKNOWN_HEX}" };`,
    },
  ],
  invalid: [
    {
      name: "hardcoded hex with a matching token (autofixed)",
      filename: SCREEN,
      code: `const s = { color: "${KNOWN_HEX}" };`,
      output: `const s = { color: "var(${KNOWN_TOKEN})" };`,
      errors: [{ messageId: "hardcodedColorWithToken" }],
    },
    {
      name: "hardcoded hex with no matching token (reported, not fixed)",
      filename: SCREEN,
      code: `const s = { color: "${UNKNOWN_HEX}" };`,
      output: null,
      errors: [{ messageId: "hardcodedColorNoToken" }],
    },
    {
      name: "rgba literal in a JSX style attribute",
      filename: SCREEN,
      code: `const el = <div style={{ background: "rgba(1,2,3,0.5)" }} />;`,
      errors: [{ messageId: "hardcodedColorNoToken" }],
    },
    {
      name: "a color inside a composite gradient string is flagged but not autofixed",
      filename: SCREEN,
      code: `const s = { backgroundImage: "linear-gradient(${UNKNOWN_HEX}, rgb(1,2,3))" };`,
      output: null,
      errors: [
        { messageId: "hardcodedColorNoToken" },
        { messageId: "hardcodedColorNoToken" },
      ],
    },
    {
      name: "a matching color in a JSX fill attribute is autofixed",
      filename: SCREEN,
      code: `const el = <circle fill="${KNOWN_HEX}" />;`,
      output: `const el = <circle fill="var(${KNOWN_TOKEN})" />;`,
      errors: [{ messageId: "hardcodedColorWithToken" }],
    },
    {
      name: "the adapter/builder layer in src/screens/cumulus_adapters is covered too",
      filename: "src/screens/cumulus_adapters/foo-view-model.ts",
      code: `const s = { color: "${UNKNOWN_HEX}" };`,
      output: null,
      errors: [{ messageId: "hardcodedColorNoToken" }],
    },
    {
      name: "a pending outer presentation file is covered before migration",
      filename: "src/index.css",
      code: `const s = { color: "${UNKNOWN_HEX}" };`,
      output: null,
      errors: [{ messageId: "hardcodedColorNoToken" }],
    },
  ],
});
