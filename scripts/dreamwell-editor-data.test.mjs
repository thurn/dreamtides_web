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
  const rootDir = mkdtempSync(join(tmpdir(), "quest-dreamwell-editor-data-"));
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
