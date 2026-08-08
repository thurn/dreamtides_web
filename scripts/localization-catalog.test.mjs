// @vitest-environment node

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  combineLocalizationResources,
  loadEnglishLocalizationResources,
  readLocalizationManifest,
} from "./localization-catalog.mjs";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("localization catalog", () => {
  it("loads every English resource in manifest order", () => {
    const resources = loadEnglishLocalizationResources();

    expect(resources.map(({ fileName }) => fileName)).toEqual(
      readLocalizationManifest(),
    );
    expect(combineLocalizationResources(resources)).toContain(
      "localization-invalid-message-fallback",
    );
  });

  it("rejects unlisted Fluent files", () => {
    const directory = mkdtempSync(join(tmpdir(), "localization-catalog-"));
    temporaryDirectories.push(directory);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "manifest.json"), '["terms.ftl"]\n');
    writeFileSync(join(directory, "terms.ftl"), "-term = Term\n");
    writeFileSync(join(directory, "extra.ftl"), "extra = Extra\n");

    expect(() => loadEnglishLocalizationResources(directory)).toThrow(
      "manifest does not match",
    );
  });

  it("rejects duplicate manifest entries", () => {
    const directory = mkdtempSync(join(tmpdir(), "localization-manifest-"));
    temporaryDirectories.push(directory);
    const manifestPath = join(directory, "manifest.json");
    writeFileSync(manifestPath, '["terms.ftl", "terms.ftl"]\n');

    expect(() => readLocalizationManifest(manifestPath)).toThrow(
      "Duplicate file",
    );
  });
});
