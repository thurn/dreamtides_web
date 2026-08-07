import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it, expect } from "vitest";
import rule, { isKnobName } from "./no-numeric-style-props.js";

describe("isKnobName (no-numeric-style-props)", () => {
  it("matches exact knob words and camelCase knob boundaries", () => {
    for (const name of [
      "size",
      "gap",
      "scale",
      "padding",
      "radius",
      "blur",
      "opacity",
      "badgeScale",
      "pipScale",
      "sizePx",
      "scaleFactor",
    ]) {
      expect(isKnobName(name)).toBe(true);
    }
  });

  it("does not match non-knob names", () => {
    for (const name of [
      "kind",
      "value",
      "label",
      "width",
      "height",
      "left",
      "top",
      "targetWidthPx",
    ]) {
      expect(isKnobName(name)).toBe(false);
    }
  });
});

// RuleTester in ESLint 9 exposes `describe`/`it` hooks; wire them to vitest so
// each RuleTester case shows up as an individual vitest test.
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const COMPONENT = "src/cumulus/components/Widget.tsx";

ruleTester.run("no-numeric-style-props", rule, {
  valid: [
    {
      name: "an enumerated string variant is the strict form we want",
      filename: COMPONENT,
      code: `export interface WidgetProps { size?: "sm" | "md" | "lg"; }`,
    },
    {
      name: "an allowlisted numeric knob is exempt",
      filename: "src/cumulus/components/hud/DreamAvatarPortrait.tsx",
      code: `export interface DreamAvatarPortraitProps { size?: number; }`,
      options: [{ allow: ["DreamAvatarPortraitProps.size"] }],
    },
    {
      name: "a knob-worded number on a non-*Props/*View type is out of scope",
      filename: COMPONENT,
      code: `export interface SizeSpec { size?: number; gap?: number; }`,
    },
    {
      name: "outside src/cumulus/components/ the rule is inert",
      filename: "src/screens/DraftSiteScreen.tsx",
      code: `export interface RowProps { size?: number; gap?: number; }`,
    },
    {
      name: "a non-knob numeric member is a legitimate box measure",
      filename: COMPONENT,
      code: `export interface WidgetProps { targetWidthPx?: number; }`,
    },
    {
      name: "a non-exported *Props with a numeric knob is out of scope",
      filename: COMPONENT,
      code: `interface WidgetProps { scale?: number; }`,
    },
    {
      name: "a numeric knob nested in an inline object member is not a direct knob",
      filename: COMPONENT,
      code: `export interface WidgetProps { art: { scale: number }; }`,
    },
    {
      name: "__fixture__ files are skipped",
      filename: "src/cumulus/components/__docgen_fixture__.tsx",
      code: `export interface WidgetProps { size?: number; }`,
    },
  ],
  invalid: [
    {
      name: "numeric size + gap knobs on an exported *Props are both flagged",
      filename: "src/cumulus/components/controls/SizedValue.tsx",
      code: `export interface SizedValueProps { size?: number; gap?: number; }`,
      errors: [{ messageId: "numericKnob" }, { messageId: "numericKnob" }],
    },
    {
      name: "a knob-word prefix cannot disguise a numeric size",
      filename: COMPONENT,
      code: `export interface WidgetProps { sizePx?: number; }`,
      errors: [{ messageId: "numericKnob" }],
    },
    {
      name: "a camelCase knob suffix on an exported *View is flagged",
      filename: "src/cumulus/components/atlas/AtlasNode.tsx",
      code: `export interface AtlasNodeView { badgeScale?: number; }`,
      errors: [{ messageId: "numericKnob" }],
    },
    {
      name: "a union including number still counts as a numeric knob",
      filename: COMPONENT,
      code: `export interface WidgetProps { scale?: number | undefined; }`,
      errors: [{ messageId: "numericKnob" }],
    },
    {
      name: "an exported type-alias *Props is checked too",
      filename: COMPONENT,
      code: `export type WidgetProps = { padding?: number };`,
      errors: [{ messageId: "numericKnob" }],
    },
  ],
});
