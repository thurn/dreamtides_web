import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, {
  toRepoRelativePosix,
  isAllowedBasename,
} from "./screen-file-taxonomy.js";

describe("toRepoRelativePosix (screen-file-taxonomy)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/quest_prototype/src/screens/tango_adapters/registry.tsx",
        "/Users/x/quest_prototype",
      ),
    ).toBe("src/screens/tango_adapters/registry.tsx");
  });
});

describe("isAllowedBasename", () => {
  it("accepts every sanctioned role", () => {
    expect(isAllowedBasename("registry.tsx")).toBe(true);
    expect(isAllowedBasename("registry.test.tsx")).toBe(true);
    expect(isAllowedBasename("HomeScreenAdapter.tsx")).toBe(true);
    expect(isAllowedBasename("HomeScreenAdapter.test.tsx")).toBe(true);
    expect(isAllowedBasename("home-view-model.ts")).toBe(true);
    expect(isAllowedBasename("home-view-model.test.ts")).toBe(true);
  });
  it("rejects everything else, including near-misses", () => {
    expect(isAllowedBasename("home-helpers.ts")).toBe(false);
    expect(isAllowedBasename("SharedPanel.tsx")).toBe(false);
    // A .tsx view-model would dodge the builder-purity import block, whose
    // glob is .ts-only; the taxonomy is what keeps that channel closed.
    expect(isAllowedBasename("home-view-model.tsx")).toBe(false);
    expect(isAllowedBasename("HomeAdapter.ts")).toBe(false);
    expect(isAllowedBasename("registry.ts")).toBe(false);
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

ruleTester.run("screen-file-taxonomy", rule, {
  valid: [
    {
      name: "the registry",
      filename: "src/screens/tango_adapters/registry.tsx",
      code: `export const x = 1;`,
    },
    {
      name: "an adapter",
      filename: "src/screens/tango_adapters/HomeScreenAdapter.tsx",
      code: `export const x = 1;`,
    },
    {
      name: "a view-model builder and its test",
      filename: "src/screens/tango_adapters/home-view-model.ts",
      code: `export const x = 1;`,
    },
    {
      name: "nested dirs follow the same taxonomy",
      filename: "src/screens/tango_adapters/atlas/atlas-view-model.test.ts",
      code: `export const x = 1;`,
    },
    {
      name: "files outside src/screens/tango_adapters are inert",
      filename: "src/screens/LegacyScreen.tsx",
      code: `export const x = 1;`,
    },
  ],
  invalid: [
    {
      name: "a helpers module has no sanctioned role",
      filename: "src/screens/tango_adapters/home-helpers.ts",
      code: `export const x = 1;`,
      errors: [{ messageId: "unknownRole" }],
    },
    {
      name: "a shared component beside the adapters",
      filename: "src/screens/tango_adapters/SharedPanel.tsx",
      code: `export const x = 1;`,
      errors: [{ messageId: "unknownRole" }],
    },
    {
      name: "a .tsx view-model dodges the purity block's .ts glob",
      filename: "src/screens/tango_adapters/home-view-model.tsx",
      code: `export const x = 1;`,
      errors: [{ messageId: "unknownRole" }],
    },
    {
      name: "nested unsanctioned files are caught too",
      filename: "src/screens/tango_adapters/atlas/format.ts",
      code: `export const x = 1;`,
      errors: [{ messageId: "unknownRole" }],
    },
  ],
});
