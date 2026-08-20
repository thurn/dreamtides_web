// @vitest-environment node

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readEditorFigments,
  readFigmentTagRegistry,
  validateFigmentEdit,
} from "./figment-editor-data.mjs";

describe("Figment editor tags", () => {
  it("loads record assignments and the canonical sidecar registry", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "figment-editor-tags-"));
    mkdirSync(join(rootDir, "data"), { recursive: true });
    writeFileSync(
      join(rootDir, "data", "figments.toml"),
      '[[figments]]\nid = "00000000-0000-4000-8000-000000000031"\nname = "Warrior"\nsubtype = "Warrior"\nspark = 1\nkeyword = ""\nrendered-text = ""\nimage-number = 31\ntags = ["Art Owned"]\n',
    );
    writeFileSync(
      join(rootDir, "data", "figments.tags.toml"),
      '[[tags]]\nname = "Art Owned"\ncolor = "#0f766e"\n',
    );
    expect(readEditorFigments({ rootDir })[0].tags).toEqual(["Art Owned"]);
    expect(readFigmentTagRegistry({ rootDir })).toEqual([
      { name: "Art Owned", color: "#0f766e" },
    ]);
  });

  it("normalizes valid assignments and rejects malformed tags", () => {
    expect(
      validateFigmentEdit("tags", [" Art Owned ", "Art Owned"]),
    ).toMatchObject({ ok: true, value: ["Art Owned"] });
    expect(validateFigmentEdit("tags", [""])).toMatchObject({ ok: false });
  });
});
