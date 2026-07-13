import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, { toRepoRelativePosix, isGovernedFile } from "./no-inline-glass.js";

describe("isGovernedFile", () => {
  it("governs a cumulus component", () => {
    expect(
      isGovernedFile("src/cumulus/components/card/CardView.tsx"),
    ).toBe(true);
  });
  it("governs a cumulus screen", () => {
    expect(isGovernedFile("src/cumulus/screens/MobileDeckViewer.tsx")).toBe(
      true,
    );
  });
  it("exempts the internal material recipes (the legal home)", () => {
    expect(isGovernedFile("src/cumulus/internal/glass-surface.ts")).toBe(false);
  });
  it("exempts the docs site", () => {
    expect(isGovernedFile("src/cumulus/docs/CumulusApp.tsx")).toBe(false);
  });
  it("exempts the primitives token mirror", () => {
    expect(isGovernedFile("src/cumulus/primitives/tokens.ts")).toBe(false);
  });
  it("exempts test files", () => {
    expect(
      isGovernedFile("src/cumulus/components/overlay/InfoCard.test.ts"),
    ).toBe(false);
  });
});

describe("toRepoRelativePosix (no-inline-glass)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/repo/src/cumulus/components/card/CardView.tsx",
        "/repo",
      ),
    ).toBe("src/cumulus/components/card/CardView.tsx");
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

const CARD_VIEW = "src/cumulus/components/card/CardView.tsx";

ruleTester.run("no-inline-glass", rule, {
  valid: [
    {
      name: "token-driven blur wins even alongside a numeric saturate",
      filename: CARD_VIEW,
      code: 'const s = "blur(var(--cv-textbox-blur)) saturate(1)";',
    },
    {
      name: "a member-expression value is not a literal and is never flagged",
      filename: CARD_VIEW,
      code: "const s = { backdropFilter: glass.backdropFilter };",
    },
    {
      name: "the internal material recipe is the legal home for raw glass",
      filename: "src/cumulus/internal/glass-surface.ts",
      code: 'const s = "blur(22px) saturate(1.5)";',
    },
    {
      name: "the docs site is exempt",
      filename: "src/cumulus/docs/CumulusApp.tsx",
      code: 'const s = "blur(8px)";',
    },
    {
      name: "a non-cumulus file's raw glass is inert",
      filename: "src/components/HUD.tsx",
      code: 'const s = "blur(8px)";',
    },
  ],
  invalid: [
    {
      name: "a raw blur/saturate literal in a governed file",
      filename: CARD_VIEW,
      code: 'const s = "blur(22px) saturate(1.5)";',
      errors: [{ messageId: "inlineGlass" }],
    },
    {
      name: "a bare raw saturate with no token blur",
      filename: CARD_VIEW,
      code: 'const s = { WebkitBackdropFilter: "saturate(1.5)" };',
      errors: [{ messageId: "inlineGlass" }],
    },
  ],
});
