// @vitest-environment node
//
// Unit tests for the pure core of the Tango docgen metadata generator. Every
// assertion runs `extractPropMeta` directly on the committed fixture
// (src/tango/components/__docgen_fixture__.tsx) rather than on whatever real
// components happen to exist, so these tests describe the normalization
// contract downstream props-tables + auto-controls depend on, independent of
// Phase 2's component churn.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extractPropMeta } from "./generate-tango-metadata.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = resolve(ROOT, "src/tango/components/__docgen_fixture__.tsx");

// Extract once; every test inspects the fixture component's PropMeta array.
const result = extractPropMeta([FIXTURE]);
const props = result["DocgenFixture"];
const byName = (name) => (props ?? []).find((p) => p.name === name);

describe("extractPropMeta (Tango docgen)", () => {
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
});
