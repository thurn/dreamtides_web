import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { patchTomlRecord } from "./card-editor-data.mjs";
import { transformDreamscape } from "./setup-assets.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_DREAMSCAPE_TOML_PATH = join("data", "tabula", "dreamscapes.toml");
const DREAMSCAPE_JSON_PATH = join("public", "dreamscapes-data.json");
const DREAM_GUIDES_TOML_PATH = join("data", "tabula", "dream_guides.toml");
const AFFILIATIONS_TOML_PATH = join("data", "tabula", "affiliations.toml");

/**
 * The SiteType enum (see `src/types/quest.ts`). A dreamscape's `signature-site`
 * is the one site type its resident Dream Guide enhances at home, so the editor
 * constrains edits to this fixed set. Kept in sync with the TS enum by hand;
 * SiteType is source code, not authored game-design data.
 */
export const SITE_TYPES = [
  "Battle",
  "Draft",
  "Shop",
  "Purge",
  "Essence",
  "Transfiguration",
  "Duplication",
  "Reward",
  "DreamAugury",
  "DreamsignMarket",
  "DreamsignRevelation",
  "TemptingOffer",
  "Gamble",
  "TemporalFork",
];

/**
 * Dreamscape fields the editor can save. `name` and `aesthetic` are free text;
 * `signature-site` is a SiteType; `guide-id` and `affiliation-id` reference the
 * Dream Guide and affiliation catalogs; `site-icon` is the Atlas marker icon
 * reference. Identity (`id`) and the starter-only `is-starter` / `fixed-sites`
 * are left untouched.
 */
export const EDITABLE_DREAMSCAPE_FIELDS = new Set([
  "name",
  "aesthetic",
  "signature-site",
  "guide-id",
  "affiliation-id",
  "site-icon",
]);

// `guide-id` and `affiliation-id` are absent on the starter dreamscape, so the
// patcher appends them to the record block on first save rather than replacing
// an existing line in place.
const OPTIONAL_DREAMSCAPE_FIELDS = new Set(["guide-id", "affiliation-id"]);

function validationFailure(field, message, value) {
  return { ok: false, field, value, message };
}

function validationSuccess(field, value) {
  return { ok: true, field, value };
}

function readSourceDreamscapes(rootDir, dreamscapeTomlPath = DEFAULT_DREAMSCAPE_TOML_PATH) {
  const absoluteTomlPath = join(rootDir, dreamscapeTomlPath);
  const parsed = parse(readFileSync(absoluteTomlPath, "utf8"));
  const dreamscapes = parsed.dreamscapes;

  if (!Array.isArray(dreamscapes)) {
    throw new Error(`Expected [[dreamscapes]] array in ${dreamscapeTomlPath}`);
  }

  return dreamscapes;
}

function editorRecordFromDreamscape(dreamscape, index) {
  return {
    id: dreamscape.id,
    name: typeof dreamscape.name === "string" ? dreamscape.name : "",
    aesthetic: typeof dreamscape.aesthetic === "string" ? dreamscape.aesthetic : "",
    "signature-site":
      typeof dreamscape["signature-site"] === "string"
        ? dreamscape["signature-site"]
        : "",
    "guide-id": typeof dreamscape["guide-id"] === "string" ? dreamscape["guide-id"] : null,
    "affiliation-id":
      typeof dreamscape["affiliation-id"] === "string"
        ? dreamscape["affiliation-id"]
        : null,
    "site-icon": typeof dreamscape["site-icon"] === "string" ? dreamscape["site-icon"] : "",
    isStarter: dreamscape["is-starter"] === true,
    fixedSites: Array.isArray(dreamscape["fixed-sites"])
      ? dreamscape["fixed-sites"].filter((entry) => typeof entry === "string")
      : [],
    sourceIndex: index,
    source: dreamscape,
  };
}

export function readEditorDreamscapes({
  rootDir = ROOT,
  dreamscapeTomlPath = DEFAULT_DREAMSCAPE_TOML_PATH,
} = {}) {
  return readSourceDreamscapes(rootDir, dreamscapeTomlPath).map(editorRecordFromDreamscape);
}

/**
 * Read the Dream Guide catalog as `{ id, name, homeDreamscapeId, siteType }`
 * options for the editor's guide picker. Names are display-only; ids are the
 * authoritative key written back into a dreamscape's `guide-id`.
 */
export function readDreamGuideOptions({ rootDir = ROOT } = {}) {
  const parsed = parse(readFileSync(join(rootDir, DREAM_GUIDES_TOML_PATH), "utf8"));
  const guides = Array.isArray(parsed.guides) ? parsed.guides : [];
  return guides
    .filter((guide) => typeof guide.id === "string")
    .map((guide) => ({
      id: guide.id,
      name: typeof guide.name === "string" ? guide.name : guide.id,
      homeDreamscapeId:
        typeof guide["home-dreamscape-id"] === "string"
          ? guide["home-dreamscape-id"]
          : null,
      siteType: typeof guide["site-type"] === "string" ? guide["site-type"] : null,
    }));
}

/**
 * Read the affiliation catalog as `{ id, name }` options for the editor's
 * affiliation picker.
 */
export function readAffiliationOptions({ rootDir = ROOT } = {}) {
  const parsed = parse(readFileSync(join(rootDir, AFFILIATIONS_TOML_PATH), "utf8"));
  const affiliations = Array.isArray(parsed.affiliations) ? parsed.affiliations : [];
  return affiliations
    .filter((affiliation) => typeof affiliation.id === "string")
    .map((affiliation) => ({
      id: affiliation.id,
      name: typeof affiliation.name === "string" ? affiliation.name : affiliation.id,
    }));
}

/**
 * Build a `validateEdit(field, value)` validator bound to the live guide and
 * affiliation id sets so a saved `guide-id` / `affiliation-id` is always a real
 * catalog entry. The valid sets are read from the TOML catalogs at request time
 * by the middleware and passed in here.
 */
export function makeValidateDreamscapeEdit({ guideIds, affiliationIds }) {
  const validGuideIds = new Set(guideIds);
  const validAffiliationIds = new Set(affiliationIds);

  return function validateDreamscapeEdit(field, rawValue) {
    if (!EDITABLE_DREAMSCAPE_FIELDS.has(field)) {
      return validationFailure(field, "This field is not editable.", rawValue);
    }

    if (field === "name") {
      if (typeof rawValue !== "string") {
        return validationFailure(field, "Name must be text.", rawValue);
      }
      const value = rawValue.trim();
      return value.length === 0
        ? validationFailure(field, "Name cannot be blank.", rawValue)
        : validationSuccess(field, value);
    }

    if (field === "aesthetic") {
      if (typeof rawValue !== "string") {
        return validationFailure(field, "Aesthetic must be text.", rawValue);
      }
      const value = rawValue.trim();
      return value.length === 0
        ? validationFailure(field, "Aesthetic cannot be blank.", rawValue)
        : validationSuccess(field, value);
    }

    if (field === "site-icon") {
      if (typeof rawValue !== "string") {
        return validationFailure(field, "Site icon must be text.", rawValue);
      }
      const value = rawValue.trim();
      return value.length === 0
        ? validationFailure(field, "Site icon cannot be blank.", rawValue)
        : validationSuccess(field, value);
    }

    if (field === "signature-site") {
      if (typeof rawValue !== "string" || !SITE_TYPES.includes(rawValue)) {
        return validationFailure(field, "Signature site must be a known site type.", rawValue);
      }
      return validationSuccess(field, rawValue);
    }

    if (field === "guide-id") {
      if (typeof rawValue !== "string" || !validGuideIds.has(rawValue)) {
        return validationFailure(field, "Dream guide must be a known guide.", rawValue);
      }
      return validationSuccess(field, rawValue);
    }

    if (field === "affiliation-id") {
      if (typeof rawValue !== "string" || !validAffiliationIds.has(rawValue)) {
        return validationFailure(field, "Affiliation must be a known affiliation.", rawValue);
      }
      return validationSuccess(field, rawValue);
    }

    return validationFailure(field, "This field is not editable.", rawValue);
  };
}

export function patchDreamscapesToml(source, { dreamscapeId, field, value, validateEdit }) {
  return patchTomlRecord(source, {
    id: dreamscapeId,
    tableName: "dreamscapes",
    editableFields: EDITABLE_DREAMSCAPE_FIELDS,
    validateEdit,
    field,
    value,
    optionalFields: OPTIONAL_DREAMSCAPE_FIELDS,
    notFoundNoun: "Dreamscape",
  });
}

export function refreshDreamscapesDataJson({
  rootDir = ROOT,
  dreamscapeTomlPath = DEFAULT_DREAMSCAPE_TOML_PATH,
} = {}) {
  const dreamscapes = readSourceDreamscapes(rootDir, dreamscapeTomlPath).map((dreamscape) =>
    transformDreamscape(dreamscape),
  );
  const dreamscapesJsonPath = join(rootDir, DREAMSCAPE_JSON_PATH);

  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(dreamscapesJsonPath, JSON.stringify(dreamscapes, null, 2) + "\n");

  return {
    count: dreamscapes.length,
    path: dreamscapesJsonPath,
  };
}
