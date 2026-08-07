import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { patchTomlRecord } from "./card-editor-data.mjs";
import {
  stripJsonComments,
  transformDreamAvatar,
} from "./setup-assets.mjs";
import { compileEconomyData } from "./economy-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_DREAM_AVATAR_TOML_PATH = join(
  "data",
  "dream_avatars.toml",
);
export const TIDES4_SOURCE_PATH = join("data", "tides4.jsonc");
export const DEFAULT_ECONOMY_TOML_PATH = join("data", "economy.toml");
const DREAM_AVATAR_JSON_PATH = join("public", "dream-avatars-v2-data.json");
const TIDES4_JSON_PATH = join("public", "tides4-data.json");

// The text fields edited inline live on the `dream_avatars.toml` record;
// `tide-pool` is edited separately against `data/tides4.jsonc` and is therefore
// not part of the TOML-patch field set.
export const EDITABLE_DREAM_AVATAR_TOML_FIELDS = new Set([
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

function readSourceDreamAvatars(rootDir, dreamAvatarTomlPath) {
  const absoluteTomlPath = join(rootDir, dreamAvatarTomlPath);
  const parsed = parse(readFileSync(absoluteTomlPath, "utf8"));
  const dreamAvatars = parsed.dreamAvatar;

  if (!Array.isArray(dreamAvatars)) {
    throw new Error(`Expected [[dreamAvatar]] array in ${dreamAvatarTomlPath}`);
  }

  return dreamAvatars;
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

function tidePoolFor(tides4, dreamAvatarId) {
  const pools = tides4.tidePoolByDreamAvatar;
  const pool = pools !== null && typeof pools === "object" ? pools[dreamAvatarId] : undefined;
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

function editorRecordFromDreamAvatar(dreamAvatar, index, tides4, defaultStartingEssence) {
  return {
    id: dreamAvatar.id,
    name: dreamAvatar.name,
    title: typeof dreamAvatar.title === "string" ? dreamAvatar.title : "",
    imageNumber: typeof dreamAvatar["image-number"] === "string" ? dreamAvatar["image-number"] : "",
    "rendered-text": dreamAvatar["rendered-text"] ?? "",
    startingEssence:
      typeof dreamAvatar["starting-essence"] === "number"
        ? dreamAvatar["starting-essence"]
        : defaultStartingEssence,
    tidePool: tidePoolFor(tides4, dreamAvatar.id),
    sourceIndex: index,
    source: dreamAvatar,
  };
}

export function readEditorDreamAvatars({
  rootDir = ROOT,
  dreamAvatarTomlPath = DEFAULT_DREAM_AVATAR_TOML_PATH,
  tides4Path = TIDES4_SOURCE_PATH,
  economyTomlPath = DEFAULT_ECONOMY_TOML_PATH,
} = {}) {
  const tides4 = readTides4(rootDir, tides4Path);
  const economy = compileEconomyData(parse(readFileSync(join(rootDir, economyTomlPath), "utf8")));
  return readSourceDreamAvatars(rootDir, dreamAvatarTomlPath).map((dreamAvatar, index) =>
    editorRecordFromDreamAvatar(
      dreamAvatar,
      index,
      tides4,
      economy.journey.defaultStartingEssence,
    ),
  );
}

export function validateDreamAvatarEdit(field, rawValue) {
  if (!EDITABLE_DREAM_AVATAR_TOML_FIELDS.has(field)) {
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
    // `/dream-avatars/<number>.png`) and is zero-padded (e.g. "0083"), so it is
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

export function patchDreamAvatarsToml(source, { dreamAvatarId, field, value }) {
  return patchTomlRecord(source, {
    id: dreamAvatarId,
    tableName: "dreamAvatar",
    editableFields: EDITABLE_DREAM_AVATAR_TOML_FIELDS,
    validateEdit: validateDreamAvatarEdit,
    field,
    value,
    // `starting-essence` is omitted from most records (it falls back to the
    // default) so it is appended to the record block when first set.
    optionalFields: new Set(["starting-essence"]),
    notFoundNoun: "DreamAvatar",
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
    return { ok: false, message: "A DreamAvatar must have at least one facet tide." };
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
 * Replace a single DreamAvatar's entry within the `tidePoolByDreamAvatar` block
 * of `data/tides4.jsonc`. Each entry is stored on its own line as a compact JSON
 * object, so a line-anchored replacement preserves the file's surrounding
 * comments, ordering, and formatting while swapping just the one pool. The
 * result is re-parsed (comments stripped) to guarantee it stays valid JSON.
 */
export function patchTides4Pool(source, { dreamAvatarId, pool }) {
  const compact = JSON.stringify({
    starter: pool.starter,
    facets: pool.facets,
    neutral: pool.neutral,
  });

  const entryPattern = new RegExp(
    `^(\\s*"${escapeRegExp(dreamAvatarId)}"\\s*:\\s*)\\{.*?\\}(,?)([^\\n]*)$`,
    "mu",
  );

  if (!entryPattern.test(source)) {
    throw new Error(`DreamAvatar ${dreamAvatarId} was not found in tides4.jsonc`);
  }

  const patched = source.replace(entryPattern, `$1${compact}$2$3`);
  // Validate the result is still well-formed JSONC.
  JSON.parse(stripJsonComments(patched));

  return { source: patched };
}

export function refreshDreamAvatarDataJson({
  rootDir = ROOT,
  dreamAvatarTomlPath = DEFAULT_DREAM_AVATAR_TOML_PATH,
} = {}) {
  const dreamAvatars = readSourceDreamAvatars(rootDir, dreamAvatarTomlPath).map(
    transformDreamAvatar,
  );
  const jsonPath = join(rootDir, DREAM_AVATAR_JSON_PATH);

  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(dreamAvatars, null, 2) + "\n");

  return { count: dreamAvatars.length, path: jsonPath };
}

export function refreshTides4DataJson({ rootDir = ROOT, tides4Path = TIDES4_SOURCE_PATH } = {}) {
  const jsonc = readFileSync(join(rootDir, tides4Path), "utf8");
  const served = JSON.stringify(JSON.parse(stripJsonComments(jsonc)));
  const jsonPath = join(rootDir, TIDES4_JSON_PATH);

  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(jsonPath, served + "\n");

  return { path: jsonPath };
}
