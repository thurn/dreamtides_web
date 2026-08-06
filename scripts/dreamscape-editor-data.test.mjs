// @vitest-environment node

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import {
  EDITABLE_DREAMSCAPE_FIELDS,
  SITE_TYPES,
  makeValidateDreamscapeEdit,
  patchDreamscapesToml,
  readAffiliationOptions,
  readDreamGuideOptions,
  readEditorDreamscapes,
  refreshDreamscapesDataJson,
} from "./dreamscape-editor-data.mjs";

// Self-contained fixtures so these assertions never depend on (and never break
// when the author edits) the production dreamscapes / guides / affiliations.
const GUIDE_IDS = ["guide_one", "guide_two"];
const AFFILIATION_IDS = ["affil_one", "affil_two"];

function fixtureToml() {
  return `[[dreamscapes]]
id = "starter_field"
name = "Starter Field"
aesthetic = "A calm opening."
signature-site = "Draft"
is-starter = true
fixed-sites = ["Draft", "Battle"]

[[dreamscapes]]
id = "second_realm"
name = "Second Realm"
aesthetic = "A stormy coast."
guide-id = "guide_one"
signature-site = "Shop"
affiliation-id = "affil_one"
`;
}

function writeFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "dreamscape-editor-data-test-"));
  mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
  writeFileSync(join(rootDir, "data", "tabula", "dreamscapes.toml"), fixtureToml());
  return rootDir;
}

const validateEdit = makeValidateDreamscapeEdit({
  guideIds: GUIDE_IDS,
  affiliationIds: AFFILIATION_IDS,
});

describe("readEditorDreamscapes", () => {
  it("normalizes the starter's absent guide and affiliation to null", () => {
    const rootDir = writeFixture();
    const records = readEditorDreamscapes({ rootDir });

    const starter = records.find((record) => record.id === "starter_field");
    expect(starter).toBeDefined();
    expect(starter.isStarter).toBe(true);
    expect(starter["guide-id"]).toBeNull();
    expect(starter["affiliation-id"]).toBeNull();
    expect(starter.fixedSites).toEqual(["Draft", "Battle"]);

    const second = records.find((record) => record.id === "second_realm");
    expect(second["guide-id"]).toBe("guide_one");
    expect(second["affiliation-id"]).toBe("affil_one");
    expect(second.isStarter).toBe(false);
  });
});

describe("makeValidateDreamscapeEdit", () => {
  it("accepts a known signature site, guide, and affiliation", () => {
    expect(validateEdit("signature-site", SITE_TYPES[0]).ok).toBe(true);
    expect(validateEdit("guide-id", "guide_two").ok).toBe(true);
    expect(validateEdit("affiliation-id", "affil_two").ok).toBe(true);
  });

  it("rejects unknown enum / catalog values and blank text", () => {
    expect(validateEdit("signature-site", "NotASite").ok).toBe(false);
    expect(validateEdit("guide-id", "ghost_guide").ok).toBe(false);
    expect(validateEdit("affiliation-id", "ghost_affil").ok).toBe(false);
    expect(validateEdit("name", "   ").ok).toBe(false);
  });

  it("rejects fields that are not editable", () => {
    expect(validateEdit("id", "anything").ok).toBe(false);
    expect(EDITABLE_DREAMSCAPE_FIELDS.has("name")).toBe(true);
    expect(EDITABLE_DREAMSCAPE_FIELDS.has("id")).toBe(false);
  });
});

describe("patchDreamscapesToml", () => {
  it("replaces an existing field in place", () => {
    const patched = patchDreamscapesToml(fixtureToml(), {
      dreamscapeId: "second_realm",
      field: "name",
      value: "Renamed Realm",
      validateEdit,
    });
    const second = parse(patched.source).dreamscapes.find(
      (entry) => entry.id === "second_realm",
    );
    expect(second.name).toBe("Renamed Realm");
  });

  it("inserts an optional guide-id onto a record that lacks it", () => {
    const patched = patchDreamscapesToml(fixtureToml(), {
      dreamscapeId: "starter_field",
      field: "guide-id",
      value: "guide_two",
      validateEdit,
    });
    const starter = parse(patched.source).dreamscapes.find(
      (entry) => entry.id === "starter_field",
    );
    expect(starter["guide-id"]).toBe("guide_two");
    // The unrelated record keeps its original guide.
    const second = parse(patched.source).dreamscapes.find(
      (entry) => entry.id === "second_realm",
    );
    expect(second["guide-id"]).toBe("guide_one");
  });
});

describe("refreshDreamscapesDataJson", () => {
  it("writes camelCased runtime JSON with explicit null guide/affiliation", () => {
    const rootDir = writeFixture();
    const result = refreshDreamscapesDataJson({ rootDir });
    expect(result.count).toBe(2);

    const json = JSON.parse(readFileSync(result.path, "utf8"));
    const starter = json.find((entry) => entry.id === "starter_field");
    expect(starter.guideId).toBeNull();
    expect(starter.affiliationId).toBeNull();
    expect(starter.isStarter).toBe(true);
    expect(starter.signatureSite).toBe("Draft");
  });
});

describe("catalog readers", () => {
  it("read guide and affiliation options when the catalogs exist", () => {
    const rootDir = writeFixture();
    mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
    writeFileSync(
      join(rootDir, "data", "tabula", "dream_guides.toml"),
      `[[guides]]\nid = "guide_one"\nname = "Guide One"\nhome-dreamscape-id = "second_realm"\nsite-type = "Shop"\n`,
    );
    writeFileSync(
      join(rootDir, "data", "tabula", "affiliations.toml"),
      `[[affiliations]]\nid = "affil_one"\nname = "Affiliation One"\n`,
    );

    const guides = readDreamGuideOptions({ rootDir });
    expect(guides).toEqual([
      {
        id: "guide_one",
        name: "Guide One",
        homeDreamscapeId: "second_realm",
        siteType: "Shop",
      },
    ]);

    const affiliations = readAffiliationOptions({ rootDir });
    expect(affiliations).toEqual([{ id: "affil_one", name: "Affiliation One" }]);
  });
});
