import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, { jsxTagName } from "./no-raw-interactive-elements.js";

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

ruleTester.run("no-raw-interactive-elements", rule, {
  valid: [
    {
      name: "composing Cumulus components is fine",
      code: `const el = <GlassButton variant="accent"><Pressable /></GlassButton>;`,
    },
    {
      name: "non-interactive intrinsic elements are fine",
      code: `const el = <div><span>hi</span><img /><svg><circle /></svg></div>;`,
    },
    {
      name: "an anchor without href (not a control) is fine",
      code: `const el = <a id="anchor-target" />;`,
    },
    {
      name: "non-activating pointer handlers (hover, pan/zoom) are fine",
      code: `const el = <div onPointerEnter={f} onPointerMove={g} onPointerLeave={h} />;`,
    },
    {
      name: "a non-interactive role is fine",
      code: `const el = <div role="list" />;`,
    },
    {
      name: "activation handlers on components are the component's business",
      code: `const el = <Pressable onClick={f} />;`,
    },
  ],
  invalid: [
    {
      name: "raw <button> in a screen",
      code: `const el = <button onClick={f}>Go</button>;`,
      errors: [{ messageId: "rawInteractive" }],
    },
    {
      name: "raw <input> in a screen",
      code: `const el = <input value={v} />;`,
      errors: [{ messageId: "rawInteractive" }],
    },
    {
      name: "raw <select> in a screen",
      code: `const el = <select />;`,
      errors: [{ messageId: "rawInteractive" }],
    },
    {
      name: "an <a href> link/button in a screen",
      code: `const el = <a href="/next">Next</a>;`,
      errors: [{ messageId: "rawAnchor" }],
    },
    {
      name: "a hand-rolled button: <div onClick>",
      code: `const el = <div onClick={f}>Go</div>;`,
      errors: [{ messageId: "handRolledButton" }],
    },
    {
      name: "a hand-rolled button: interactive role",
      code: `const el = <span role="button">Go</span>;`,
      errors: [{ messageId: "handRolledButton" }],
    },
    {
      name: "a hand-rolled button: tabIndex on a plain element",
      code: `const el = <div tabIndex={0}>Go</div>;`,
      errors: [{ messageId: "handRolledButton" }],
    },
  ],
});
