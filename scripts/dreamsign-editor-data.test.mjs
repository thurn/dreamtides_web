// @vitest-environment node

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readEditorDreamsigns,
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
