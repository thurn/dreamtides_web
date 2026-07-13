// @vitest-environment node
//
// Unit tests for the pure core of the Cumulus docgen metadata generator. Every
// assertion runs `extractPropMeta` directly on the committed fixture
// (src/cumulus/components/__docgen_fixture__.tsx) rather than on whatever real
// components happen to exist, so these tests describe the normalization
// contract downstream props-tables + auto-controls depend on, independent of
// Phase 2's component churn.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPropMeta } from "./generate-cumulus-metadata.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = resolve(ROOT, "src/cumulus/components/__docgen_fixture__.tsx");
const NAME_FILTER_FIXTURE = resolve(
  ROOT,
  "src/cumulus/components/__docgen_name_filter_fixture__.tsx",
);
const NESTED_FIXTURE = resolve(
  ROOT,
  "src/cumulus/components/__docgen_nested_fixture__.tsx",
);

// Extract once; every test inspects the fixture component's PropMeta array.
const result = extractPropMeta([FIXTURE]);
const props = result["DocgenFixture"];
const byName = (name) => (props ?? []).find((p) => p.name === name);

describe("extractPropMeta (Cumulus docgen)", () => {
  it("extracts the fixture component under its display name", () => {
    // Sanity: the parser found the component at all. If this fails every other
    // assertion is meaningless.
    expect(Array.isArray(props)).toBe(true);
    expect(props.length).toBeGreaterThan(0);
  });

  it("normalizes a string-literal union into ordered, unquoted unionMembers", () => {
    // Catches leaving the enum as one joined `"sm" | "md" | "lg"` string (or
    // keeping the surrounding quotes), which breaks the generated <select>.
    const size = byName("size");
    expect(size).toBeTruthy();
    expect(size.unionMembers).toEqual(["sm", "md", "lg"]);
  });

  it("leaves unionMembers empty for non-union props", () => {
    // A boolean / number / string must not accidentally get union members.
    expect(byName("active").unionMembers).toEqual([]);
    expect(byName("count").unionMembers).toEqual([]);
    expect(byName("label").unionMembers).toEqual([]);
  });

  it("reports readable tsType strings, not the raw 'enum' placeholder", () => {
    // shouldExtractLiteralValuesFromEnum makes react-docgen-typescript label
    // booleans/numbers/unions as "enum"; the generator must surface the real
    // source type (from type.raw) with the synthetic `| undefined` stripped.
    expect(byName("active").tsType).toBe("boolean");
    expect(byName("count").tsType).toBe("number");
    expect(byName("label").tsType).toBe("string");
    expect(byName("size").tsType).toBe('"sm" | "md" | "lg"');
  });

  it("captures the JSDoc description of a prop", () => {
    // Catches losing the props-table copy during normalization.
    expect(byName("size").description).toBe("The size of the fixture.");
    expect(byName("label").description).toBe("The text label shown by the fixture.");
  });

  it("reports required vs optional accurately", () => {
    // `active` and `label` have no `?`; `size` / `count` / `children` do.
    expect(byName("active").required).toBe(true);
    expect(byName("label").required).toBe(true);
    expect(byName("size").required).toBe(false);
    expect(byName("count").required).toBe(false);
  });

  it("captures default values for optional props", () => {
    // The optional `size` / `count` props have literal defaults in the
    // destructure; the generator should surface them.
    expect(byName("size").defaultValue).toBe("md");
    expect(byName("count").defaultValue).toBe("1");
  });

  it("excludes props inherited from node_modules DOM types", () => {
    // The fixture extends React.HTMLAttributes<HTMLDivElement>. Without the
    // node_modules propFilter, hundreds of DOM props (className, onClick, ...)
    // would flood the table. None of them may appear.
    const names = (props ?? []).map((p) => p.name);
    expect(names).not.toContain("className");
    expect(names).not.toContain("onClick");
    expect(names).not.toContain("style");
  });

  it("expands a prop whose type is a project model object into nested fields", () => {
    // A prop like `model: NestedFixtureModel` arrives from react-docgen as the
    // bare type name; buildNestedResolver must attach its one-level field list
    // so the props table can document the required shape.
    const nested = extractPropMeta([NESTED_FIXTURE])["NestedFixture"];
    const model = (nested ?? []).find((p) => p.name === "model");
    expect(model).toBeTruthy();
    expect(model.nested).toBeTruthy();
    expect(model.nested.name).toBe("NestedFixtureModel");
    expect(model.nested.fields.map((f) => f.name)).toEqual([
      "label",
      "count",
      "tone",
    ]);
    const byField = (name) => model.nested.fields.find((f) => f.name === name);
    // Required vs optional members, member types, and JSDoc all survive.
    expect(byField("label").optional).toBe(false);
    expect(byField("label").tsType).toBe("string");
    expect(byField("label").description).toBe("How the widget is labelled.");
    expect(byField("count").optional).toBe(true);
    expect(byField("count").tsType).toBe("number");
    // A string-literal union member keeps its readable type string.
    expect(byField("tone").tsType).toBe('"calm" | "loud"');
  });

  it("expands an array-of-model prop using the element model", () => {
    // `models: NestedFixtureModel[]` should resolve to the element type's
    // fields, not be skipped because of the trailing [].
    const nested = extractPropMeta([NESTED_FIXTURE])["NestedFixture"];
    const models = (nested ?? []).find((p) => p.name === "models");
    expect(models.nested).toBeTruthy();
    expect(models.nested.name).toBe("NestedFixtureModel");
    expect(models.nested.fields.length).toBe(3);
  });

  it("leaves a non-model prop without a nested field list", () => {
    // A plain boolean carries no nested shape; the key must be absent rather
    // than an empty object so downstream `meta.nested ? ...` checks stay simple.
    const nested = extractPropMeta([NESTED_FIXTURE])["NestedFixture"];
    const active = (nested ?? []).find((p) => p.name === "active");
    expect(active).toBeTruthy();
    expect(active.nested).toBeUndefined();
  });

  it("documents only the component in a file that also exports a hook and a constant", () => {
    // Mirrors Pressable.tsx, which co-locates the `Pressable` component with
    // the `usePress` hook and the `PRESS_SCALE` constant in the same file —
    // react-docgen-typescript happily emits doc entries for all three, but
    // only the PascalCase component should end up in the metadata. Without
    // the isComponentName filter, `useNameFilterFixtureThing` (camelCase) and
    // `FILTER_FIXTURE_DELAY_MS` (ALL-CAPS) would leak in alongside it.
    const filtered = extractPropMeta([NAME_FILTER_FIXTURE]);
    expect(Object.keys(filtered)).toEqual(["NameFilterFixture"]);
    expect(filtered["NameFilterFixture"]).toEqual([
      {
        name: "children",
        tsType: "ReactNode",
        unionMembers: [],
        required: false,
        defaultValue: null,
        description: "Content rendered inside the fixture.",
      },
    ]);
  });
});
