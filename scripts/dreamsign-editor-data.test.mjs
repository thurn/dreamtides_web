// @vitest-environment node

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import {
  patchDreamsignsToml,
  readEditorDreamsigns,
  refreshDreamsignDataJson,
  removeTagsFromDreamsigns,
  validateDreamsignEdit,
} from "./dreamsign-editor-data.mjs";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

function fixtureToml() {
  return `[[dreamsign]]
id = "${FIRST_ID}"
name = "Golden Acorn"
image_name = "acorn_gold.png"
rendered-text = "The second discard matters."

[[dreamsign]]
id = "${SECOND_ID}"
name = "Pyramid Relic"
image_name = "artifact.png"
tags = ["engine", "cost"]
rendered-text = """
Line one.

name = "Wrong Target"

Line three.
"""
`;
}

function writeFixtureRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "journey-dreamsign-editor-data-"));
  mkdirSync(join(rootDir, "data"), { recursive: true });
  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(join(rootDir, "data", "dreamsigns.toml"), fixtureToml());
  return rootDir;
}

function blockFor(source, id) {
  const blocks = source.split(/(?=^\[\[dreamsign\]\]$)/m).filter(Boolean);
  const block = blocks.find((candidate) => candidate.includes(`id = "${id}"`));
  if (block === undefined) {
    throw new Error(`Missing block for ${id}`);
  }
  return block;
}

describe("readEditorDreamsigns", () => {
  it("loads source dreamsigns in TOML order with editable tags", () => {
    const rootDir = writeFixtureRoot();

    const dreamsigns = readEditorDreamsigns({ rootDir });

    expect(dreamsigns.map((dreamsign) => dreamsign.id)).toEqual([
      FIRST_ID,
      SECOND_ID,
    ]);
    expect(dreamsigns[0]).toMatchObject({
      name: "Golden Acorn",
      imageName: "acorn_gold.png",
      "rendered-text": "The second discard matters.",
      tags: [],
      sourceIndex: 0,
    });
    expect(dreamsigns[1]?.tags).toEqual(["engine", "cost"]);
  });
});

describe("patchDreamsignsToml", () => {
  it("updates name and effect text without touching other records", () => {
    const patchedName = patchDreamsignsToml(fixtureToml(), {
      dreamsignId: FIRST_ID,
      field: "name",
      value: "Amber Acorn",
    }).source;
    const patchedText = patchDreamsignsToml(patchedName, {
      dreamsignId: SECOND_ID,
      field: "rendered-text",
      value: "Fresh effect.",
    }).source;

    const parsed = parse(patchedText);
    expect(parsed.dreamsign[0].name).toBe("Amber Acorn");
    expect(parsed.dreamsign[1]["rendered-text"]).toBe("Fresh effect.");
    expect(blockFor(patchedText, FIRST_ID)).toContain("The second discard matters.");
  });

  it("adds a missing tags field inside the target dreamsign block", () => {
    const patched = patchDreamsignsToml(fixtureToml(), {
      dreamsignId: FIRST_ID,
      field: "tags",
      value: ["engine"],
    }).source;

    expect(parse(patched).dreamsign[0].tags).toEqual(["engine"]);
    expect(blockFor(patched, FIRST_ID)).toContain('tags = ["engine"]');
    expect(blockFor(patched, SECOND_ID)).toContain('tags = ["engine", "cost"]');
  });

  it("ignores field-looking text inside multiline strings", () => {
    const patched = patchDreamsignsToml(fixtureToml(), {
      dreamsignId: SECOND_ID,
      field: "name",
      value: "Relic",
    }).source;

    const secondBlock = blockFor(patched, SECOND_ID);
    expect(secondBlock).toContain('name = "Relic"');
    expect(secondBlock).toContain('name = "Wrong Target"');
  });
});

describe("validateDreamsignEdit", () => {
  it("rejects blank names and unsupported fields", () => {
    expect(validateDreamsignEdit("name", "   ")).toMatchObject({
      ok: false,
      message: "Name cannot be blank.",
    });
    expect(validateDreamsignEdit("tides", [])).toMatchObject({
      ok: false,
      message: "This field is not editable.",
    });
  });
});

describe("refreshDreamsignDataJson", () => {
  it("writes runtime dreamsign JSON from source TOML", () => {
    const rootDir = writeFixtureRoot();

    const result = refreshDreamsignDataJson({ rootDir });
    const json = JSON.parse(readFileSync(result.path, "utf8"));

    expect(result.count).toBe(2);
    expect(json[0]).toMatchObject({
      id: FIRST_ID,
      name: "Golden Acorn",
      imageName: "acorn_gold.png",
      effectDescription: "The second discard matters.",
    });
  });
});

describe("removeTagsFromDreamsigns", () => {
  it("strips removed tag names from all dreamsign records", () => {
    const patched = removeTagsFromDreamsigns(fixtureToml(), ["engine"]);

    const parsed = parse(patched);
    expect(parsed.dreamsign[0].tags).toBeUndefined();
    expect(parsed.dreamsign[1].tags).toEqual(["cost"]);
  });
});
