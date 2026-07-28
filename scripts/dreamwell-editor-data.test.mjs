// @vitest-environment node

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import {
  patchDreamwellToml,
  readEditorDreamwell,
  refreshDreamwellDataJson,
  validateDreamwellEdit,
} from "./dreamwell-editor-data.mjs";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

function fixtureToml() {
  return `[[dreamwell]]
name = "Dawning Horizon"
id = "${FIRST_ID}"
rendered-text = "(no ability)"
order = 0
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
  mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(join(rootDir, "data", "tabula", "dreamwell.toml"), fixtureToml());
  return rootDir;
}

function blockFor(source, id) {
  const blocks = source.split(/(?=^\[\[dreamwell\]\]$)/m).filter(Boolean);
  const block = blocks.find((candidate) => candidate.includes(`id = "${id}"`));
  if (block === undefined) {
    throw new Error(`Missing block for ${id}`);
  }
  return block;
}

describe("readEditorDreamwell", () => {
  it("loads source records in TOML order with editor-facing fields", () => {
    const rootDir = writeFixtureRoot();

    const dreamwell = readEditorDreamwell({ rootDir });

    expect(dreamwell.map((record) => record.id)).toEqual([FIRST_ID, SECOND_ID]);
    expect(dreamwell[0]).toMatchObject({
      name: "Dawning Horizon",
      "rendered-text": "(no ability)",
      "energy-added": 2,
      order: 0,
      "image-number": 1963305268,
      sourceIndex: 0,
    });
  });
});

describe("patchDreamwellToml", () => {
  it("updates name and numeric fields without touching other records", () => {
    const patchedName = patchDreamwellToml(fixtureToml(), {
      dreamwellId: FIRST_ID,
      field: "name",
      value: "Daybreak Ridge",
    }).source;
    const patchedEnergy = patchDreamwellToml(patchedName, {
      dreamwellId: FIRST_ID,
      field: "energy-added",
      value: 3,
    }).source;
    const patchedOrder = patchDreamwellToml(patchedEnergy, {
      dreamwellId: SECOND_ID,
      field: "order",
      value: 4,
    }).source;

    const parsed = parse(patchedOrder);
    expect(parsed.dreamwell[0].name).toBe("Daybreak Ridge");
    expect(parsed.dreamwell[0]["energy-added"]).toBe(3);
    expect(parsed.dreamwell[1].order).toBe(4);
    expect(parsed.dreamwell[1]["image-number"]).toBe(2421338077);
  });

  it("ignores field-looking text inside multiline rules strings", () => {
    const patched = patchDreamwellToml(fixtureToml(), {
      dreamwellId: SECOND_ID,
      field: "order",
      value: 3,
    }).source;

    const secondBlock = blockFor(patched, SECOND_ID);
    // The real `order` key is updated; the `order = 9` inside the rules string
    // is left intact.
    expect(parse(patched).dreamwell[1].order).toBe(3);
    expect(secondBlock).toContain("order = 9");
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

describe("patchDreamwellToml art crop", () => {
  it("appends an art table on first save and replaces it thereafter", () => {
    const firstSave = patchDreamwellToml(fixtureToml(), {
      dreamwellId: FIRST_ID,
      field: "art",
      value: { x: 0.1, y: -0.2, scale: 1.3 },
    }).source;
    expect(parse(firstSave).dreamwell[0].art).toEqual({
      x: 0.1,
      y: -0.2,
      scale: 1.3,
    });

    const secondSave = patchDreamwellToml(firstSave, {
      dreamwellId: FIRST_ID,
      field: "art",
      value: { x: 0, y: 0.4, scale: 2 },
    }).source;
    expect(parse(secondSave).dreamwell[0].art).toEqual({
      x: 0,
      y: 0.4,
      scale: 2,
    });
    // The second record is untouched and the art table is not duplicated.
    expect(parse(secondSave).dreamwell[1].art).toBeUndefined();
    expect(blockFor(secondSave, FIRST_ID).match(/^art = /gmu)).toHaveLength(1);
  });
});

describe("patchDreamwellToml image number", () => {
  it("appends image-number on a record that has none", () => {
    const imagelessToml = `[[dreamwell]]
name = "Imageless Vista"
id = "${FIRST_ID}"
rendered-text = "(no ability)"
order = 0
energy-added = 2
card-type = "Dreamwell"
art-owned = true
card-number = 1
`;

    const patched = patchDreamwellToml(imagelessToml, {
      dreamwellId: FIRST_ID,
      field: "image-number",
      value: 450441286,
    }).source;

    expect(parse(patched).dreamwell[0]["image-number"]).toBe(450441286);
  });

  it("replaces an existing image-number without duplicating it", () => {
    const patched = patchDreamwellToml(fixtureToml(), {
      dreamwellId: FIRST_ID,
      field: "image-number",
      value: 450441286,
    }).source;

    expect(parse(patched).dreamwell[0]["image-number"]).toBe(450441286);
    expect(parse(patched).dreamwell[1]["image-number"]).toBe(2421338077);
    expect(blockFor(patched, FIRST_ID).match(/^image-number = /gmu)).toHaveLength(1);
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
      name: "Dawning Horizon",
      energyAdded: 2,
      imageNumber: 1963305268,
      order: 0,
    });
  });
});
