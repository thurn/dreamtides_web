import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, {
  toRepoRelativePosix,
  isGovernedFile,
  isTestFile,
  adhocScaleCalls,
} from "./no-adhoc-press-scale.js";

describe("toRepoRelativePosix (no-adhoc-press-scale)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/journey_prototype/src/cumulus/components/hud/JourneyStatusBar.tsx",
        "/Users/x/journey_prototype",
      ),
    ).toBe("src/cumulus/components/hud/JourneyStatusBar.tsx");
  });
});

describe("isTestFile", () => {
  it("matches a .test.tsx file", () => {
    expect(isTestFile("src/cumulus/primitives/Pressable.test.tsx")).toBe(true);
  });
  it("does not match a production file", () => {
    expect(isTestFile("src/cumulus/primitives/Pressable.tsx")).toBe(false);
  });
});

describe("isGovernedFile", () => {
  it("governs a cumulus component file", () => {
    expect(isGovernedFile("src/cumulus/components/hud/JourneyStatusBar.tsx")).toBe(
      true,
    );
  });
  it("exempts the Pressable definition file", () => {
    expect(isGovernedFile("src/cumulus/primitives/Pressable.tsx")).toBe(false);
  });
  it("exempts test files (they assert against rendered transforms)", () => {
    expect(isGovernedFile("src/cumulus/primitives/Pressable.test.tsx")).toBe(
      false,
    );
  });
  it("ignores files outside the cumulus tier", () => {
    expect(isGovernedFile("src/screens/ShopScreen.tsx")).toBe(false);
  });
});

describe("adhocScaleCalls", () => {
  it("flags a bare numeric scale", () => {
    expect(adhocScaleCalls("scale(1.08)")).toEqual(["scale(1.08)"]);
  });
  it("flags scaleX / scaleY", () => {
    expect(adhocScaleCalls("scaleX(2)")).toEqual(["scaleX(2)"]);
    expect(adhocScaleCalls("scaleY(0.5)")).toEqual(["scaleY(0.5)"]);
  });
  it("allows the identity reset scale(1)", () => {
    expect(adhocScaleCalls("scale(1)")).toEqual([]);
  });
  it("does not match grayscale() (a filter, not a transform)", () => {
    expect(adhocScaleCalls("grayscale(0.5)")).toEqual([]);
  });
  it("ignores a scale() whose arg is not a bare number", () => {
    expect(adhocScaleCalls("scale(var(--node-hover-scale))")).toEqual([]);
    expect(adhocScaleCalls("scale(")).toEqual([]);
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

const COMPONENT = "src/cumulus/components/hud/JourneyStatusBar.tsx";
const PRESSABLE = "src/cumulus/primitives/Pressable.tsx";

ruleTester.run("no-adhoc-press-scale", rule, {
  valid: [
    {
      name: "referencing HOVER_SCALE via a template expression is fine",
      filename: COMPONENT,
      code: "const t = `scale(${HOVER_SCALE})`;",
    },
    {
      name: "referencing a token via a template expression is fine",
      filename: COMPONENT,
      code: 'const t = `scale(${token("--node-hover-scale")})`;',
    },
    {
      name: "referencing a CSS var string is fine",
      filename: COMPONENT,
      code: 'const t = "scale(var(--node-hover-scale))";',
    },
    {
      name: "the identity reset scale(1) is allowed",
      filename: COMPONENT,
      code: 'const t = "scale(1)";',
    },
    {
      name: "grayscale() is a filter, not a transform scale",
      filename: COMPONENT,
      code: 'const f = "grayscale(0.5) brightness(0.62)";',
    },
    {
      name: "the Pressable definition file may hold the raw factors",
      filename: PRESSABLE,
      code: "const t = `scale(${PRESS_SCALE})`;",
    },
    {
      name: "a raw scale literal outside the cumulus tier is inert",
      filename: "src/screens/ShopScreen.tsx",
      code: 'const t = "scale(1.08)";',
    },
  ],
  invalid: [
    {
      name: "a bare numeric scale literal in a components-tier file",
      filename: COMPONENT,
      code: 'const t = "scale(1.08)";',
      errors: [{ messageId: "adhocScale" }],
    },
    {
      name: "a bare integer scale literal (an image crop) is flagged",
      filename: "src/cumulus/components/hud/DreamAvatarPortrait.tsx",
      code: 'const t = "scale(2)";',
      errors: [{ messageId: "adhocScale" }],
    },
    {
      name: "a numeric scale inside a multi-transform string is flagged",
      filename: COMPONENT,
      code: 'const t = "translateY(5px) scale(0.97)";',
      errors: [{ messageId: "adhocScale" }],
    },
  ],
});
