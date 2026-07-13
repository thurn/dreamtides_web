import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, {
  toRepoRelativePosix,
  isGovernedFile,
} from "./no-raw-safe-area-env.js";

describe("isGovernedFile", () => {
  it("governs a cumulus screen", () => {
    expect(isGovernedFile("src/cumulus/screens/DraftScreen.tsx")).toBe(true);
  });
  it("governs a cumulus component", () => {
    expect(isGovernedFile("src/cumulus/components/overlay/InfoCard.tsx")).toBe(
      true,
    );
  });
  it("exempts the primitives token mirror", () => {
    expect(isGovernedFile("src/cumulus/primitives/tokens.ts")).toBe(false);
  });
  it("exempts the docs site", () => {
    expect(isGovernedFile("src/cumulus/docs/CumulusApp.tsx")).toBe(false);
  });
  it("exempts test files", () => {
    expect(isGovernedFile("src/cumulus/screens/DraftScreen.test.tsx")).toBe(
      false,
    );
  });
  it("ignores files outside src/cumulus/", () => {
    expect(isGovernedFile("src/components/StartingDeckModal.tsx")).toBe(
      false,
    );
  });
});

describe("toRepoRelativePosix (no-raw-safe-area-env)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/repo/src/cumulus/screens/DraftScreen.tsx",
        "/repo",
      ),
    ).toBe("src/cumulus/screens/DraftScreen.tsx");
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

const SCREEN = "src/cumulus/screens/DraftScreen.tsx";

ruleTester.run("no-raw-safe-area-env", rule, {
  valid: [
    {
      name: "the injected safe-area token read is fine",
      filename: SCREEN,
      code: `const top = "var(--safe-area-inset-top)";`,
    },
    {
      name: "a design-floor token() read is fine",
      filename: SCREEN,
      code: `const top = token("--safe-top");`,
    },
    {
      name: "the primitives token mirror may declare the env() fallback",
      filename: "src/cumulus/primitives/tokens.ts",
      code: `const TOP = "env(safe-area-inset-top, 0px)";`,
    },
    {
      name: "a non-cumulus file's raw env() is inert",
      filename: "src/components/StartingDeckModal.tsx",
      code: `const top = "env(safe-area-inset-top, 0px)";`,
    },
  ],
  invalid: [
    {
      name: "a raw env() in a plain string literal",
      filename: SCREEN,
      code: `const TOP = "env(safe-area-inset-top)";`,
      errors: [{ messageId: "rawSafeAreaEnv" }],
    },
    {
      name: "a raw env() inside a template chunk",
      filename: SCREEN,
      code: 'const TOP = `max(env(safe-area-inset-top), ${token("--safe-top")})`;',
      errors: [{ messageId: "rawSafeAreaEnv" }],
    },
  ],
});
