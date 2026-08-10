import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  readTidesArtifact,
  resolveTidesFile,
  validateTideEdit,
} from "./tides-editor-data.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("validateTideEdit", () => {
  it("accepts the five resonances and rejects others", () => {
    expect(validateTideEdit("resonance", "vision")).toMatchObject({
      ok: true,
      value: "vision",
    });
    expect(validateTideEdit("resonance", "Ember")).toMatchObject({
      ok: true,
      value: "ember",
    });
    expect(validateTideEdit("resonance", "harmony").ok).toBe(false);
  });

  it("trims display text and refuses non-editable fields", () => {
    expect(validateTideEdit("displayName", "  Hi  ")).toMatchObject({
      ok: true,
      value: "Hi",
    });
    expect(validateTideEdit("displayName", 5).ok).toBe(false);
    expect(validateTideEdit("role", "neutral").ok).toBe(false);
    expect(validateTideEdit("cards", []).ok).toBe(false);
  });
});

describe("readTidesArtifact", () => {
  it("loads the generated TOML projection", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "tides-editor-data-"));
    roots.push(rootDir);
    mkdirSync(join(rootDir, "data"));
    writeFileSync(
      join(rootDir, "data", "tides.toml"),
      [
        "schema-version = 1",
        "[[tide]]",
        'id = "00000000-0000-4000-8000-000000000001"',
        'display-name = "Fixture"',
        'display-description = "Description"',
        'resonance = "shadow"',
        'role = "signature"',
        "[[tide.card]]",
        'id = "00000000-0000-4000-8000-000000000011"',
        "copies = 2",
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(rootDir, "data", "dream_avatar_tide_pools.toml"),
      [
        "schema-version = 1",
        "[[dream-avatar-pool]]",
        'dream-avatar-id = "00000000-0000-4000-8000-000000000021"',
        'facets = ["00000000-0000-4000-8000-000000000001"]',
        "neutral = []",
        "",
      ].join("\n"),
    );
    expect(
      readTidesArtifact({ rootDir, tomlPath: "data/tides.toml" }),
    ).toMatchObject({
      tides: [{ displayName: "Fixture", cards: [{ copies: 2 }] }],
    });
  });
});

describe("resolveTidesFile", () => {
  const rootDir = "/repo";

  it("defaults to the canonical RON and generated TOML paths", () => {
    expect(resolveTidesFile(rootDir, null)).toMatchObject({
      ok: true,
      file: "tides",
      ronPath: "data/tides.ron",
      tomlPath: "data/tides.toml",
    });
  });

  it("rejects another catalog name and traversal", () => {
    expect(resolveTidesFile(rootDir, "tides4").ok).toBe(false);
    expect(resolveTidesFile(rootDir, "../secret").ok).toBe(false);
    expect(resolveTidesFile(rootDir, "sub/tides").ok).toBe(false);
    expect(resolveTidesFile(rootDir, "tides.ron").ok).toBe(false);
  });
});
