import { describe, expect, it } from "vitest";

import { serializeArtifact } from "./bake-tides4.mjs";
import {
  patchTideAnnotation,
  resolveTidesFile,
  validateTideEdit,
} from "./tides-editor-data.mjs";

// A small synthetic artifact, serialized through the real bake serializer, so
// these tests exercise the editor's read/patch path without coupling to the
// production tides4/tides5 card content (which is free to change at any time).
function fixtureArtifact() {
  const json = {
    version: 1,
    tides: [
      {
        id: "tide-sig-01",
        name: "Example signature",
        displayName: "Old Name",
        displayDescription: "An old blurb.",
        color: "purple",
        role: "signature",
        dreamAvatarId: "11111111-1111-1111-1111-111111111111",
        cards: [{ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "A", copies: 2 }],
      },
      {
        id: "tide-fac-01",
        name: "Lean: Example",
        color: "green",
        role: "facet",
        leanCardId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        cards: [{ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", name: "B", copies: 1 }],
      },
    ],
    tidePoolByDreamAvatar: {
      "11111111-1111-1111-1111-111111111111": {
        starter: "tide-sig-01",
        facets: ["tide-fac-01"],
        neutral: [],
      },
    },
  };
  return serializeArtifact(json, "// header line");
}

describe("validateTideEdit", () => {
  it("accepts the five deck colors and rejects others", () => {
    expect(validateTideEdit("color", "blue")).toMatchObject({ ok: true, value: "blue" });
    expect(validateTideEdit("color", "Orange")).toMatchObject({ ok: true, value: "orange" });
    expect(validateTideEdit("color", "teal").ok).toBe(false);
  });

  it("trims display text and rejects non-text", () => {
    expect(validateTideEdit("displayName", "  Hi  ")).toMatchObject({ ok: true, value: "Hi" });
    expect(validateTideEdit("displayName", 5).ok).toBe(false);
  });

  it("refuses fields that are not editable", () => {
    expect(validateTideEdit("role", "neutral").ok).toBe(false);
    expect(validateTideEdit("cards", []).ok).toBe(false);
  });
});

describe("patchTideAnnotation", () => {
  it("is a byte-identical no-op when setting a field to its current value", () => {
    const source = fixtureArtifact();
    const { source: patched } = patchTideAnnotation(source, {
      tideId: "tide-sig-01",
      field: "color",
      value: "purple",
    });
    expect(patched).toBe(source);
  });

  it("changes exactly one line when editing a display name", () => {
    const source = fixtureArtifact();
    const { source: patched, tide } = patchTideAnnotation(source, {
      tideId: "tide-sig-01",
      field: "displayName",
      value: "New Name",
    });
    expect(tide.displayName).toBe("New Name");
    const before = source.split("\n");
    const after = patched.split("\n");
    expect(after.length).toBe(before.length);
    const changed = before.filter((line, i) => line !== after[i]);
    expect(changed).toHaveLength(1);
  });

  it("removes the line when a display field is cleared", () => {
    const source = fixtureArtifact();
    const { source: patched } = patchTideAnnotation(source, {
      tideId: "tide-sig-01",
      field: "displayDescription",
      value: "",
    });
    expect(patched.split("\n").length).toBe(source.split("\n").length - 1);
    expect(patched).not.toContain("displayDescription");
  });

  it("preserves provenance UUIDs across an edit", () => {
    const source = fixtureArtifact();
    const { source: patched } = patchTideAnnotation(source, {
      tideId: "tide-fac-01",
      field: "color",
      value: "yellow",
    });
    expect(patched).toContain("\"leanCardId\": \"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\"");
    expect(patched).toContain("\"dreamAvatarId\": \"11111111-1111-1111-1111-111111111111\"");
  });

  it("throws for an unknown tide id", () => {
    const source = fixtureArtifact();
    expect(() =>
      patchTideAnnotation(source, { tideId: "tide-nope", field: "color", value: "blue" }),
    ).toThrow(/was not found/u);
  });
});

describe("resolveTidesFile", () => {
  const rootDir = "/repo";

  it("defaults to tides4 and maps to its artifact + public json paths", () => {
    const resolved = resolveTidesFile(rootDir, null);
    expect(resolved).toMatchObject({
      ok: true,
      file: "tides4",
      jsoncPath: "data/tides4.jsonc",
      jsonPath: "public/tides4-data.json",
    });
  });

  it("allows another tides artifact name", () => {
    expect(resolveTidesFile(rootDir, "tides5")).toMatchObject({
      ok: true,
      file: "tides5",
      jsoncPath: "data/tides5.jsonc",
    });
  });

  it("rejects traversal and path-bearing selectors", () => {
    expect(resolveTidesFile(rootDir, "../secret").ok).toBe(false);
    expect(resolveTidesFile(rootDir, "sub/tides4").ok).toBe(false);
    expect(resolveTidesFile(rootDir, "tides4.jsonc").ok).toBe(false);
  });
});
