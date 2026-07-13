import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, {
  toRepoRelativePosix,
  isProductUiFile,
} from "./no-classname-in-product-ui.js";

describe("toRepoRelativePosix (no-classname-in-product-ui)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/quest_prototype/src/cumulus/screens/HomeScreen.tsx",
        "/Users/x/quest_prototype",
      ),
    ).toBe("src/cumulus/screens/HomeScreen.tsx");
  });
});

describe("isProductUiFile (no-classname-in-product-ui)", () => {
  it("covers the product tier and the adapter layer", () => {
    expect(isProductUiFile("src/cumulus/screens/HomeScreen.tsx")).toBe(true);
    expect(isProductUiFile("src/screens/cumulus_adapters/HomeScreenAdapter.tsx")).toBe(
      true,
    );
  });
  it("exempts primitives, components, docs, and non-cumulus files", () => {
    expect(isProductUiFile("src/cumulus/components/Button.tsx")).toBe(false);
    expect(isProductUiFile("src/cumulus/primitives/Pressable.tsx")).toBe(false);
    expect(isProductUiFile("src/cumulus/docs/CumulusApp.tsx")).toBe(false);
    expect(isProductUiFile("src/screens/LegacyScreen.tsx")).toBe(false);
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

ruleTester.run("no-classname-in-product-ui", rule, {
  valid: [
    {
      name: "the token-scope root class is the one allowed value",
      filename: SCREEN,
      code: `const el = <div className="cumulus" style={{ minHeight: "100vh" }} />;`,
    },
    {
      name: "token-valued inline styles are the styling channel",
      filename: SCREEN,
      code: `const el = <div style={{ color: token("--text-primary") }} />;`,
    },
    {
      name: "components tier legitimately authors class-based styling",
      filename: "src/cumulus/components/Button.tsx",
      code: `const el = <button className="cumulus-button" />;`,
    },
    {
      name: "the doc site is tooling and exempt",
      filename: "src/cumulus/docs/CumulusApp.tsx",
      code: `const el = <div className="doc-shell" />;`,
    },
    {
      name: "files outside the product tier are inert",
      filename: "src/screens/LegacyScreen.tsx",
      code: `const el = <div className="p-3 text-purple-400" />;`,
    },
  ],
  invalid: [
    {
      name: "utility classes in a screen bypass the token system",
      filename: SCREEN,
      code: `const el = <div className="p-3 text-purple-400" />;`,
      errors: [{ messageId: "classNameProp" }],
    },
    {
      name: "a bespoke stylesheet hook in a screen",
      filename: SCREEN,
      code: `const el = <div className="home-hero" />;`,
      errors: [{ messageId: "classNameProp" }],
    },
    {
      name: "a dynamic className expression in a screen",
      filename: SCREEN,
      code: `const el = <div className={cls} />;`,
      errors: [{ messageId: "classNameProp" }],
    },
    {
      name: "adapters render no chrome and may not class anything",
      filename: "src/screens/cumulus_adapters/HomeScreenAdapter.tsx",
      code: `const el = <Widget className="wrap" />;`,
      errors: [{ messageId: "classNameProp" }],
    },
  ],
});
