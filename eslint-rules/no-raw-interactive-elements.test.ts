import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, {
  toRepoRelativePosix,
  jsxTagName,
} from "./no-raw-interactive-elements.js";

describe("toRepoRelativePosix (no-raw-interactive-elements)", () => {
  it("returns a clean repo-relative path", () => {
    expect(
      toRepoRelativePosix(
        "/Users/x/quest_prototype/src/cumulus/screens/HomeScreen.tsx",
        "/Users/x/quest_prototype",
      ),
    ).toBe("src/cumulus/screens/HomeScreen.tsx");
  });
});

describe("jsxTagName", () => {
  it("returns the tag for a lowercase intrinsic element", () => {
    expect(jsxTagName({ name: { type: "JSXIdentifier", name: "button" } })).toBe(
      "button",
    );
  });
  it("returns null for a capitalized component", () => {
    expect(jsxTagName({ name: { type: "JSXIdentifier", name: "Button" } })).toBeNull();
  });
  it("returns null for a member/namespaced element", () => {
    expect(jsxTagName({ name: { type: "JSXMemberExpression" } })).toBeNull();
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

ruleTester.run("no-raw-interactive-elements", rule, {
  valid: [
    {
      name: "composing Cumulus components is fine",
      filename: SCREEN,
      code: `const el = <GlassButton variant="accent"><Pressable /></GlassButton>;`,
    },
    {
      name: "non-interactive intrinsic elements are fine",
      filename: SCREEN,
      code: `const el = <div><span>hi</span><img /><svg><circle /></svg></div>;`,
    },
    {
      name: "an anchor without href (not a control) is fine",
      filename: SCREEN,
      code: `const el = <a id="anchor-target" />;`,
    },
    {
      name: "components/ own native interactive elements",
      filename: "src/cumulus/components/GlassButton.tsx",
      code: `const el = <button type="button" />;`,
    },
    {
      name: "primitives/ forward to native elements",
      filename: "src/cumulus/primitives/Pressable.tsx",
      code: `const el = <button />;`,
    },
    {
      name: "docs control panel may use native form controls",
      filename: "src/cumulus/docs/ControlPanel.tsx",
      code: `const el = <select><option /></select>;`,
    },
    {
      name: "files outside the product tier are inert",
      filename: "src/screens/LegacyScreen.tsx",
      code: `const el = <button />;`,
    },
    {
      name: "non-activating pointer handlers (hover, pan/zoom) are fine",
      filename: SCREEN,
      code: `const el = <div onPointerEnter={f} onPointerMove={g} onPointerLeave={h} />;`,
    },
    {
      name: "a non-interactive role is fine",
      filename: SCREEN,
      code: `const el = <div role="list" />;`,
    },
    {
      name: "activation handlers on components are the component's business",
      filename: SCREEN,
      code: `const el = <Pressable onClick={f} />;`,
    },
  ],
  invalid: [
    {
      name: "raw <button> in a screen",
      filename: SCREEN,
      code: `const el = <button onClick={f}>Go</button>;`,
      errors: [{ messageId: "rawInteractive" }],
    },
    {
      name: "raw <input> in a screen",
      filename: SCREEN,
      code: `const el = <input value={v} />;`,
      errors: [{ messageId: "rawInteractive" }],
    },
    {
      name: "raw <select> in a screen",
      filename: SCREEN,
      code: `const el = <select />;`,
      errors: [{ messageId: "rawInteractive" }],
    },
    {
      name: "an <a href> link/button in a screen",
      filename: SCREEN,
      code: `const el = <a href="/next">Next</a>;`,
      errors: [{ messageId: "rawAnchor" }],
    },
    {
      name: "a hand-rolled button: <div onClick>",
      filename: SCREEN,
      code: `const el = <div onClick={f}>Go</div>;`,
      errors: [{ messageId: "handRolledButton" }],
    },
    {
      name: "a hand-rolled button: interactive role",
      filename: SCREEN,
      code: `const el = <span role="button">Go</span>;`,
      errors: [{ messageId: "handRolledButton" }],
    },
    {
      name: "a hand-rolled button: tabIndex on a plain element",
      filename: SCREEN,
      code: `const el = <div tabIndex={0}>Go</div>;`,
      errors: [{ messageId: "handRolledButton" }],
    },
    {
      name: "the adapter layer is covered too",
      filename: "src/screens/cumulus_adapters/HomeScreenAdapter.tsx",
      code: `const el = <button />;`,
      errors: [{ messageId: "rawInteractive" }],
    },
    {
      name: "a pending outer presentation file cannot add a raw button",
      filename: "src/index.css",
      code: `const el = <button />;`,
      errors: [{ messageId: "rawInteractive" }],
    },
  ],
});
