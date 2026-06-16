import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { patchTomlRecord } from "./card-editor-data.mjs";
import {
  DEFAULT_STARTING_ESSENCE,
  stripJsonComments,
  transformDreamcaller,
} from "./setup-assets.mjs";
import { DREAMCALLER_ARCHETYPES } from "../src/data/dreamcallers-v2-database.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_DREAMCALLER_TOML_PATH = join(
  "data",
  "tabula",
  "dreamcallers_v2.toml",
);
export const TIDES4_SOURCE_PATH = join("data", "tides4.jsonc");
const DREAMCALLER_JSON_PATH = join("public", "dreamcallers-v2-data.json");
const TIDES4_JSON_PATH = join("public", "tides4-data.json");

// The text fields edited inline live on the `dreamcallers_v2.toml` record;
// `tide-pool` is edited separately against `data/tides4.jsonc` and is therefore
// not part of the TOML-patch field set.
export const EDITABLE_DREAMCALLER_TOML_FIELDS = new Set([
  "name",
  "title",
  "rendered-text",
  "image-number",
  "starting-essence",
]);

function validationFailure(field, message, value) {
  return { ok: false, field, value, message };
}

function validationSuccess(field, value) {
  return { ok: true, field, value };
}

function readSourceDreamcallers(rootDir, dreamcallerTomlPath) {
  const absoluteTomlPath = join(rootDir, dreamcallerTomlPath);
  const parsed = parse(readFileSync(absoluteTomlPath, "utf8"));
  const dreamcallers = parsed.dreamcaller;

  if (!Array.isArray(dreamcallers)) {
    throw new Error(`Expected [[dreamcaller]] array in ${dreamcallerTomlPath}`);
  }

  return dreamcallers;
}

function readTides4(rootDir, tides4Path) {
  const absolute = join(rootDir, tides4Path);
  return JSON.parse(stripJsonComments(readFileSync(absolute, "utf8")));
}

/**
 * The available tide identities, in source order, stripped of their (large)
 * card lists. The editor's tide picker only needs each tide's id, role, color,
 * and the names it renders to the user.
 */
export function readTideCatalog({ rootDir = ROOT, tides4Path = TIDES4_SOURCE_PATH } = {}) {
  const tides4 = readTides4(rootDir, tides4Path);
  const tides = Array.isArray(tides4.tides) ? tides4.tides : [];
  return tides.map((tide) => ({
    id: tide.id,
    name: typeof tide.name === "string" ? tide.name : tide.id,
    shortName: typeof tide.shortName === "string" ? tide.shortName : "",
    displayName: typeof tide.displayName === "string" ? tide.displayName : "",
    color: tide.color,
    role: tide.role,
  }));
}

function tidePoolFor(tides4, dreamcallerId) {
  const pools = tides4.tidePoolByDreamcaller;
  const pool = pools !== null && typeof pools === "object" ? pools[dreamcallerId] : undefined;
  if (pool === null || typeof pool !== "object") {
    return { starter: null, facets: [], neutral: [] };
  }
  return {
    starter: typeof pool.starter === "string" ? pool.starter : null,
    facets: Array.isArray(pool.facets) ? pool.facets.filter((id) => typeof id === "string") : [],
    neutral: Array.isArray(pool.neutral)
      ? pool.neutral.filter((id) => typeof id === "string")
      : [],
  };
}

function editorRecordFromDreamcaller(dreamcaller, index, tides4) {
  return {
    id: dreamcaller.id,
    name: dreamcaller.name,
    title: typeof dreamcaller.title === "string" ? dreamcaller.title : "",
    imageNumber: typeof dreamcaller["image-number"] === "string" ? dreamcaller["image-number"] : "",
    "rendered-text": dreamcaller["rendered-text"] ?? "",
    startingEssence:
      typeof dreamcaller["starting-essence"] === "number"
        ? dreamcaller["starting-essence"]
        : DEFAULT_STARTING_ESSENCE,
    tidePool: tidePoolFor(tides4, dreamcaller.id),
    sourceIndex: index,
    source: dreamcaller,
  };
}

export function readEditorDreamcallers({
  rootDir = ROOT,
  dreamcallerTomlPath = DEFAULT_DREAMCALLER_TOML_PATH,
  tides4Path = TIDES4_SOURCE_PATH,
} = {}) {
  const tides4 = readTides4(rootDir, tides4Path);
  return readSourceDreamcallers(rootDir, dreamcallerTomlPath).map((dreamcaller, index) =>
    editorRecordFromDreamcaller(dreamcaller, index, tides4),
  );
}

export function validateDreamcallerEdit(field, rawValue) {
  if (!EDITABLE_DREAMCALLER_TOML_FIELDS.has(field)) {
    return validationFailure(field, "This field is not editable.", rawValue);
  }

  if (field === "name") {
    if (typeof rawValue !== "string") {
      return validationFailure(field, "Name must be text.", rawValue);
    }
    const value = rawValue.trim();
    if (value.length === 0) {
      return validationFailure(field, "Name cannot be blank.", rawValue);
    }
    return validationSuccess(field, value);
  }

  if (field === "title") {
    if (typeof rawValue !== "string") {
      return validationFailure(field, "Title must be text.", rawValue);
    }
    return validationSuccess(field, rawValue.trim());
  }

  if (field === "rendered-text") {
    if (typeof rawValue !== "string") {
      return validationFailure(field, "Ability text must be text.", rawValue);
    }
    return validationSuccess(field, rawValue);
  }

  if (field === "image-number") {
    // The image number selects the portrait file (resolved to
    // `/dreamcallers/<number>.png`) and is zero-padded (e.g. "0083"), so it is
    // stored as a digit string rather than a number to preserve the padding.
    const value =
      typeof rawValue === "number" ? String(rawValue) : typeof rawValue === "string" ? rawValue.trim() : "";
    if (!/^\d+$/u.test(value)) {
      return validationFailure(field, "Image number must be digits, e.g. 0083.", rawValue);
    }
    return validationSuccess(field, value);
  }

  if (field === "starting-essence") {
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (typeof value === "number") {
      if (Number.isInteger(value) && value >= 0) {
        return validationSuccess(field, value);
      }
      return validationFailure(field, "Starting essence must be a non-negative whole number.", rawValue);
    }
    if (typeof value === "string" && /^\d+$/u.test(value)) {
      return validationSuccess(field, Number(value));
    }
    return validationFailure(field, "Starting essence must be a non-negative whole number.", rawValue);
  }

  return validationFailure(field, "This field is not editable.", rawValue);
}

export function patchDreamcallersToml(source, { dreamcallerId, field, value }) {
  return patchTomlRecord(source, {
    id: dreamcallerId,
    tableName: "dreamcaller",
    editableFields: EDITABLE_DREAMCALLER_TOML_FIELDS,
    validateEdit: validateDreamcallerEdit,
    field,
    value,
    // `starting-essence` is omitted from most records (it falls back to the
    // default) so it is appended to the record block when first set.
    optionalFields: new Set(["starting-essence"]),
    notFoundNoun: "Dreamcaller",
  });
}

/**
 * Validate a tide-pool edit against the available tide catalog: `starter` must
 * be a signature tide id (or null), `facets` must reference facet tides (and be
 * non-empty, matching the `tides4` artifact contract), and `neutral` must
 * reference neutral tides. Returns the canonicalized pool with duplicates
 * removed and ids kept in submitted order.
 */
export function validateTidePool(rawValue, tideCatalog) {
  if (rawValue === null || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return { ok: false, message: "Tide pool must be an object." };
  }

  const roleById = new Map(tideCatalog.map((tide) => [tide.id, tide.role]));

  function dedupeWithRole(list, role, label) {
    if (!Array.isArray(list)) {
      return { ok: false, message: `${label} must be a list.` };
    }
    const result = [];
    for (const id of list) {
      if (typeof id !== "string") {
        return { ok: false, message: `Each ${label} id must be text.` };
      }
      if (!roleById.has(id)) {
        return { ok: false, message: `Unknown tide id "${id}".` };
      }
      if (roleById.get(id) !== role) {
        return { ok: false, message: `Tide "${id}" is not a ${role} tide.` };
      }
      if (!result.includes(id)) {
        result.push(id);
      }
    }
    return { ok: true, value: result };
  }

  const { starter, facets, neutral } = rawValue;

  let starterValue = null;
  if (starter !== null && starter !== undefined && starter !== "") {
    if (typeof starter !== "string") {
      return { ok: false, message: "Starter must be a tide id or null." };
    }
    if (roleById.get(starter) !== "signature") {
      return { ok: false, message: `Starter "${starter}" is not a signature tide.` };
    }
    starterValue = starter;
  }

  const facetsResult = dedupeWithRole(facets, "facet", "facet");
  if (!facetsResult.ok) {
    return facetsResult;
  }
  if (facetsResult.value.length === 0) {
    return { ok: false, message: "A Dreamcaller must have at least one facet tide." };
  }

  const neutralResult = dedupeWithRole(neutral, "neutral", "neutral");
  if (!neutralResult.ok) {
    return neutralResult;
  }

  return {
    ok: true,
    value: {
      starter: starterValue,
      facets: facetsResult.value,
      neutral: neutralResult.value,
    },
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Replace a single Dreamcaller's entry within the `tidePoolByDreamcaller` block
 * of `data/tides4.jsonc`. Each entry is stored on its own line as a compact JSON
 * object, so a line-anchored replacement preserves the file's surrounding
 * comments, ordering, and formatting while swapping just the one pool. The
 * result is re-parsed (comments stripped) to guarantee it stays valid JSON.
 */
export function patchTides4Pool(source, { dreamcallerId, pool }) {
  const compact = JSON.stringify({
    starter: pool.starter,
    facets: pool.facets,
    neutral: pool.neutral,
  });

  const entryPattern = new RegExp(
    `^(\\s*"${escapeRegExp(dreamcallerId)}"\\s*:\\s*)\\{.*?\\}(,?)([^\\n]*)$`,
    "mu",
  );

  if (!entryPattern.test(source)) {
    throw new Error(`Dreamcaller ${dreamcallerId} was not found in tides4.jsonc`);
  }

  const patched = source.replace(entryPattern, `$1${compact}$2$3`);
  // Validate the result is still well-formed JSONC.
  JSON.parse(stripJsonComments(patched));

  return { source: patched };
}

export function refreshDreamcallerDataJson({
  rootDir = ROOT,
  dreamcallerTomlPath = DEFAULT_DREAMCALLER_TOML_PATH,
} = {}) {
  const dreamcallers = readSourceDreamcallers(rootDir, dreamcallerTomlPath).map((dreamcaller) => {
    const archetypes = DREAMCALLER_ARCHETYPES[dreamcaller.name];
    if (archetypes) {
      dreamcaller["draft-archetypes"] = archetypes;
    }
    return transformDreamcaller(dreamcaller);
  });
  const jsonPath = join(rootDir, DREAMCALLER_JSON_PATH);

  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(dreamcallers, null, 2) + "\n");

  return { count: dreamcallers.length, path: jsonPath };
}

export function refreshTides4DataJson({ rootDir = ROOT, tides4Path = TIDES4_SOURCE_PATH } = {}) {
  const jsonc = readFileSync(join(rootDir, tides4Path), "utf8");
  const served = JSON.stringify(JSON.parse(stripJsonComments(jsonc)));
  const jsonPath = join(rootDir, TIDES4_JSON_PATH);

  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(jsonPath, served + "\n");

  return { path: jsonPath };
}
