// @vitest-environment node

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readEditorDreamwell,
  refreshDreamwellDataJson,
  validateDreamwellEdit,
} from "./dreamwell-editor-data.mjs";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

function fixtureToml() {
  return `[[dreamwell]]
name = "Fixture Dreamwell"
id = "${FIRST_ID}"
rendered-text = "(no ability)"
order = 1
energy-added = 2
card-type = "Dreamwell"
image-number = 1963305268
art-owned = true
card-number = 1

[[dreamwell]]
name = "Meteor Meadow"
id = "${SECOND_ID}"
rendered-text = """
Draw a card.

order = 9
"""
order = 2
energy-added = 1
card-type = "Dreamwell"
image-number = 2421338077
art-owned = true
card-number = 2
`;
}

function writeFixtureRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "journey-dreamwell-editor-data-"));
  mkdirSync(join(rootDir, "data"), { recursive: true });
  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(join(rootDir, "data", "dreamwell.toml"), fixtureToml());
  return rootDir;
}

describe("readEditorDreamwell", () => {
  it("loads source records in TOML order with editor-facing fields", () => {
    const rootDir = writeFixtureRoot();

    const dreamwell = readEditorDreamwell({ rootDir });

    expect(dreamwell.map((record) => record.id)).toEqual([FIRST_ID, SECOND_ID]);
    expect(dreamwell[0]).toMatchObject({
      name: "Fixture Dreamwell",
      "rendered-text": "(no ability)",
      "energy-added": 2,
      order: 1,
      "image-number": 1963305268,
      sourceIndex: 0,
    });
  });
});

describe("validateDreamwellEdit", () => {
  it("accepts valid edits and rejects malformed ones", () => {
    expect(validateDreamwellEdit("name", "  Aurora  ")).toMatchObject({
      ok: true,
      value: "Aurora",
    });
    expect(validateDreamwellEdit("energy-added", "2")).toMatchObject({
      ok: true,
      value: 2,
    });
    expect(validateDreamwellEdit("name", "   ")).toMatchObject({ ok: false });
    expect(validateDreamwellEdit("energy-added", "-1")).toMatchObject({ ok: false });
    expect(validateDreamwellEdit("order", 0)).toMatchObject({ ok: false });
    expect(validateDreamwellEdit("order", 5)).toMatchObject({ ok: false });
    expect(validateDreamwellEdit("image-number", "1.5")).toMatchObject({ ok: false });
    expect(validateDreamwellEdit("card-type", "Dreamwell")).toMatchObject({
      ok: false,
      message: "This field is not editable.",
    });
  });

  it("accepts an art crop and clamps it to the editor's bounds", () => {
    expect(
      validateDreamwellEdit("art", { x: 0.25, y: -0.5, scale: 1.4 }),
    ).toMatchObject({ ok: true, value: { x: 0.25, y: -0.5, scale: 1.4 } });

    // Out-of-range pan/zoom is clamped rather than rejected.
    expect(
      validateDreamwellEdit("art", { x: 5, y: -9, scale: 0.2 }),
    ).toMatchObject({ ok: true, value: { x: 1, y: -1, scale: 1 } });

    expect(validateDreamwellEdit("art", { x: 0, y: 0 })).toMatchObject({
      ok: false,
    });
  });
});

describe("refreshDreamwellDataJson", () => {
  it("writes runtime Dreamwell JSON with camelCase keys from source TOML", () => {
    const rootDir = writeFixtureRoot();

    const result = refreshDreamwellDataJson({ rootDir });
    const json = JSON.parse(readFileSync(result.path, "utf8"));

    expect(result.count).toBe(2);
    expect(json[0]).toMatchObject({
      id: FIRST_ID,
      name: "Fixture Dreamwell",
      energyAdded: 2,
      imageNumber: 1963305268,
      order: 1,
    });
  });
});
