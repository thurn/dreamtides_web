// @vitest-environment node

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EDITABLE_DREAMSCAPE_FIELDS,
  SITE_TYPES,
  makeValidateDreamscapeEdit,
  readAffiliationOptions,
  readDreamGuideOptions,
  readEditorDreamscapes,
} from "./dreamscape-editor-data.mjs";

// Self-contained fixtures so these assertions never depend on (and never break
// when the author edits) the production dreamscapes / guides / affiliations.
const GUIDE_IDS = ["guide_one", "guide_two"];
const AFFILIATION_IDS = ["affil_one", "affil_two"];
const GUIDE_SITE_TYPES = [
  "Shop",
  "Purge",
  "Exploration",
  "Transfiguration",
  "Duplication",
  "Augury",
  "DreamsignMarket",
  "DreamsignRevelation",
  "RandomSite",
  "Gamble",
];

function fixtureToml() {
  return `[[dreamscapes]]
id = "starter_field"
name = "Starter Field"
signature-site = "Draft"
is-starter = true
fixed-sites = ["Draft", "Battle"]

${GUIDE_SITE_TYPES.map(
  (siteType, index) => `[[dreamscapes]]
id = "${index === 0 ? "second_realm" : `realm_${String(index)}`}"
name = "Realm ${String(index)}"
affiliation-id = "affil_one"
`,
).join("\n")}`;
}

function fixtureGuidesToml() {
  return `schema-version = 1

${GUIDE_SITE_TYPES.map((siteType, index) => {
  const id =
    index === 0
      ? "guide_one"
      : index === 1
        ? "guide_two"
        : `guide_${String(index)}`;
  const home = index === 0 ? "second_realm" : `realm_${String(index)}`;
  const specialDialogue =
    siteType === "RandomSite"
      ? 'random-site = ["Fixture roads."]\n'
      : siteType === "Gamble"
        ? 'gamble-three-gate = ["Fixture gates."]\ngamble-ladder-climb = ["Fixture {win-essence} ladder."]\ngamble-starway-stairs = ["Fixture stairs."]\ngamble-four-suit-reprise = ["Fixture suits."]\ngamble-blackjack = ["Fixture blackjack."]\n'
        : "";
  return `[[guides]]
id = "${id}"
name = "Guide ${String(index)}"
portrait-source = "fixture-${String(index)}.png"
home-dreamscape-id = "${home}"
site-type = "${siteType}"
home-specialty = "Fixture specialty ${String(index)}."

[guides.dialogue]
site = ["Fixture site line ${String(index)}."]
${specialDialogue}`;
}).join("\n")}`;
}

function writeFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "dreamscape-editor-data-test-"));
  mkdirSync(join(rootDir, "data"), { recursive: true });
  writeFileSync(join(rootDir, "data", "dreamscapes.toml"), fixtureToml());
  writeFileSync(
    join(rootDir, "data", "dream_guides.toml"),
    fixtureGuidesToml(),
  );
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

describe("catalog readers", () => {
  it("read guide and affiliation options when the catalogs exist", () => {
    const rootDir = writeFixture();
    mkdirSync(join(rootDir, "data"), { recursive: true });
    writeFileSync(
      join(rootDir, "data", "affiliations.toml"),
      `[[affiliations]]\nid = "affil_one"\nname = "Affiliation One"\n`,
    );

    const guides = readDreamGuideOptions({ rootDir });
    expect(guides[0]).toEqual({
      id: "guide_one",
      name: "Guide 0",
      homeDreamscapeId: "second_realm",
      siteType: "Shop",
    });

    const affiliations = readAffiliationOptions({ rootDir });
    expect(affiliations).toEqual([
      { id: "affil_one", name: "Affiliation One" },
    ]);
  });
});
