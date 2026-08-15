import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { transformAvatar } from "./setup-assets.mjs";
import { compileEconomyData } from "./economy-data.mjs";
import { compileTidesData } from "./tides-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_AVATAR_TOML_PATH = join(
  "data",
  "avatars.toml",
);
export const TIDES_SOURCE_PATH = join("data", "tides.ron");
export const TIDES_TOML_PATH = join("data", "tides.toml");
export const DEFAULT_ECONOMY_TOML_PATH = join("data", "economy.toml");
const AVATAR_JSON_PATH = join("public", "avatars-v2-data.json");

// Generated compatibility TOML supplies editor records. Semantic field and
// tide-pool saves target canonical `avatars.ron`.
export const EDITABLE_AVATAR_FIELDS = new Set([
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

function readSourceAvatars(rootDir, avatarTomlPath) {
  const absoluteTomlPath = join(rootDir, avatarTomlPath);
  const parsed = parse(readFileSync(absoluteTomlPath, "utf8"));
  const avatars = parsed.avatar;

  if (!Array.isArray(avatars)) {
    throw new Error(`Expected [[avatar]] array in ${avatarTomlPath}`);
  }

  return avatars;
}

function readTides4(rootDir, tides4Path, avatarTomlPath) {
  return compileTidesData(
    parse(readFileSync(join(rootDir, tides4Path), "utf8")),
    parse(readFileSync(join(rootDir, avatarTomlPath), "utf8")),
  );
}

/**
 * The available tide identities, in source order, stripped of their (large)
 * card lists. The editor's tide picker only needs each tide's id, role, resonance,
 * and the names it renders to the user.
 */
export function readTideCatalog({
  rootDir = ROOT,
  tides4Path = TIDES_TOML_PATH,
  avatarTomlPath = DEFAULT_AVATAR_TOML_PATH,
} = {}) {
  const tides4 = readTides4(rootDir, tides4Path, avatarTomlPath);
  const tides = Array.isArray(tides4.tides) ? tides4.tides : [];
  return tides.map((tide) => ({
    id: tide.id,
    displayName: typeof tide.displayName === "string" ? tide.displayName : "",
    resonance: tide.resonance,
    role: tide.role,
  }));
}

function tidePoolFor(tides4, avatarId) {
  const pools = tides4.tidePoolByAvatar;
  const pool =
    pools !== null && typeof pools === "object"
      ? pools[avatarId]
      : undefined;
  if (pool === null || typeof pool !== "object") {
    return { starter: null, facets: [], neutral: [] };
  }
  return {
    starter: typeof pool.starter === "string" ? pool.starter : null,
    facets: Array.isArray(pool.facets)
      ? pool.facets.filter((id) => typeof id === "string")
      : [],
    neutral: Array.isArray(pool.neutral)
      ? pool.neutral.filter((id) => typeof id === "string")
      : [],
  };
}

function editorRecordFromAvatar(
  avatar,
  index,
  tides4,
  defaultStartingEssence,
) {
  return {
    id: avatar.id,
    name: avatar.name,
    title: typeof avatar.title === "string" ? avatar.title : "",
    imageNumber:
      typeof avatar["image-number"] === "string"
        ? avatar["image-number"]
        : "",
    "rendered-text": avatar["rendered-text"] ?? "",
    startingEssence:
      typeof avatar["starting-essence"] === "number"
        ? avatar["starting-essence"]
        : defaultStartingEssence,
    tidePool: tidePoolFor(tides4, avatar.id),
    sourceIndex: index,
    source: avatar,
  };
}

export function readEditorAvatars({
  rootDir = ROOT,
  avatarTomlPath = DEFAULT_AVATAR_TOML_PATH,
  tides4Path = TIDES_TOML_PATH,
  economyTomlPath = DEFAULT_ECONOMY_TOML_PATH,
} = {}) {
  const tides4 = readTides4(rootDir, tides4Path, avatarTomlPath);
  const economy = compileEconomyData(
    parse(readFileSync(join(rootDir, economyTomlPath), "utf8")),
  );
  return readSourceAvatars(rootDir, avatarTomlPath).map(
    (avatar, index) =>
      editorRecordFromAvatar(
        avatar,
        index,
        tides4,
        economy.journey.defaultStartingEssence,
      ),
  );
}

export function validateAvatarEdit(field, rawValue) {
  if (!EDITABLE_AVATAR_FIELDS.has(field)) {
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
    const value = rawValue.trim();
    if (value.length === 0) {
      return validationFailure(field, "Title cannot be blank.", rawValue);
    }
    return validationSuccess(field, value);
  }

  if (field === "rendered-text") {
    if (typeof rawValue !== "string") {
      return validationFailure(field, "Ability text must be text.", rawValue);
    }
    if (
      rawValue.split("\n\n").some((paragraph) => paragraph.trim().length === 0)
    ) {
      return validationFailure(
        field,
        "Ability text must contain non-empty paragraphs.",
        rawValue,
      );
    }
    return validationSuccess(field, rawValue);
  }

  if (field === "image-number") {
    // The image number selects the portrait file (resolved to
    // `/avatars/<number>.png`) and is zero-padded (e.g. "0083"), so it is
    // stored as a digit string rather than a number to preserve the padding.
    const value =
      typeof rawValue === "number"
        ? String(rawValue)
        : typeof rawValue === "string"
          ? rawValue.trim()
          : "";
    if (!/^\d+$/u.test(value)) {
      return validationFailure(
        field,
        "Image number must be digits, e.g. 0083.",
        rawValue,
      );
    }
    const image = Number(value);
    if (image < 1 || image > 9999) {
      return validationFailure(
        field,
        "Image number must be between 0001 and 9999.",
        rawValue,
      );
    }
    return validationSuccess(field, value);
  }

  if (field === "starting-essence") {
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (typeof value === "number") {
      if (Number.isInteger(value) && value >= 0) {
        return validationSuccess(field, value);
      }
      return validationFailure(
        field,
        "Starting essence must be a non-negative whole number.",
        rawValue,
      );
    }
    if (typeof value === "string" && /^\d+$/u.test(value)) {
      return validationSuccess(field, Number(value));
    }
    return validationFailure(
      field,
      "Starting essence must be a non-negative whole number.",
      rawValue,
    );
  }

  return validationFailure(field, "This field is not editable.", rawValue);
}

/**
 * Validate a tide-pool edit against the available tide catalog: `starter` must
 * be a signature tide id (or null), `facets` must reference facet tides (and be
 * non-empty, matching the `tides4` artifact contract), and `neutral` must
 * reference neutral tides. Returns the canonicalized pool with duplicates
 * removed and ids kept in submitted order.
 */
export function validateTidePool(rawValue, tideCatalog) {
  if (
    rawValue === null ||
    typeof rawValue !== "object" ||
    Array.isArray(rawValue)
  ) {
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
      return {
        ok: false,
        message: `Starter "${starter}" is not a signature tide.`,
      };
    }
    starterValue = starter;
  }

  const facetsResult = dedupeWithRole(facets, "facet", "facet");
  if (!facetsResult.ok) {
    return facetsResult;
  }
  if (facetsResult.value.length === 0) {
    return {
      ok: false,
      message: "A Avatar must have at least one facet tide.",
    };
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

export function refreshAvatarDataJson({
  rootDir = ROOT,
  avatarTomlPath = DEFAULT_AVATAR_TOML_PATH,
} = {}) {
  const avatars = readSourceAvatars(rootDir, avatarTomlPath).map(
    transformAvatar,
  );
  const jsonPath = join(rootDir, AVATAR_JSON_PATH);

  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(avatars, null, 2) + "\n");

  return { count: avatars.length, path: jsonPath };
}
