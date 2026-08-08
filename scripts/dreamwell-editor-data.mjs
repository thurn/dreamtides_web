import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { validateArtCrop } from "./card-editor-data.mjs";
import { transformDreamwell } from "./setup-assets.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_DREAMWELL_TOML_PATH = join("data", "dreamwell.toml");
const DREAMWELL_JSON_PATH = join("public", "dreamwell-data.json");

/**
 * Highest `order` slot a Dreamwell card may occupy. Order 0 cards are the
 * per-player starting cards; 1-4 are the shuffled deck slots (rules §The
 * Dreamwell and Energy). The editor caps `order` here so a stray value cannot
 * land a card outside the deck's cycle.
 */
export const MAX_DREAMWELL_ORDER = 4;

/**
 * Dreamwell fields the editor can save: the card name, its rules text, the
 * `energy-added` value (the purple orb on the card), the deck `order` slot, the
 * `image-number` selecting the card art, and the `art` crop (pan/zoom) framing
 * that image. Every other field on a record (`id`, `card-type`, `art-owned`,
 * `card-number`) is identity or provenance and is left untouched.
 */
export const EDITABLE_DREAMWELL_FIELDS = new Set([
  "name",
  "rendered-text",
  "energy-added",
  "order",
  "image-number",
  "art",
]);

function validationFailure(field, message, value) {
  return { ok: false, field, value, message };
}

function validationSuccess(field, value) {
  return { ok: true, field, value };
}

function readSourceDreamwell(rootDir, dreamwellTomlPath = DEFAULT_DREAMWELL_TOML_PATH) {
  const absoluteTomlPath = join(rootDir, dreamwellTomlPath);
  const parsed = parse(readFileSync(absoluteTomlPath, "utf8"));
  const dreamwell = parsed.dreamwell;

  if (!Array.isArray(dreamwell)) {
    throw new Error(`Expected [[dreamwell]] array in ${dreamwellTomlPath}`);
  }

  return dreamwell;
}

/**
 * Read an authored `art` table into the editor record's `{ x, y, scale }` crop,
 * or `undefined` for a card that has never been cropped (the renderer then falls
 * back to its default full-cover framing). Malformed tables are dropped rather
 * than surfaced so a hand-edited record can never crash the editor load.
 */
function readArtCrop(art) {
  if (art === null || typeof art !== "object" || Array.isArray(art)) {
    return undefined;
  }
  const { x, y, scale } = art;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof scale !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(scale)
  ) {
    return undefined;
  }
  return { x, y, scale };
}

function editorRecordFromDreamwell(dreamwell, index) {
  return {
    id: dreamwell.id,
    name: typeof dreamwell.name === "string" ? dreamwell.name : "",
    "rendered-text": dreamwell["rendered-text"] ?? "",
    "energy-added":
      typeof dreamwell["energy-added"] === "number" ? dreamwell["energy-added"] : 0,
    order: typeof dreamwell.order === "number" ? dreamwell.order : 0,
    "image-number":
      typeof dreamwell["image-number"] === "number" ? dreamwell["image-number"] : 0,
    art: readArtCrop(dreamwell.art),
    "card-number":
      typeof dreamwell["card-number"] === "number" ? dreamwell["card-number"] : index + 1,
    sourceIndex: index,
    source: dreamwell,
  };
}

export function readEditorDreamwell({
  rootDir = ROOT,
  dreamwellTomlPath = DEFAULT_DREAMWELL_TOML_PATH,
} = {}) {
  return readSourceDreamwell(rootDir, dreamwellTomlPath).map(editorRecordFromDreamwell);
}

function validateWholeNumber(field, rawValue, { max, label }) {
  const numeric =
    typeof rawValue === "number" ? rawValue : Number(String(rawValue).trim());
  if (!Number.isInteger(numeric) || numeric < 0) {
    return validationFailure(
      field,
      `${label} must be a whole number of 0 or more.`,
      rawValue,
    );
  }
  if (max !== undefined && numeric > max) {
    return validationFailure(field, `${label} must be ${max} or less.`, rawValue);
  }
  return validationSuccess(field, numeric);
}

export function validateDreamwellEdit(field, rawValue) {
  if (!EDITABLE_DREAMWELL_FIELDS.has(field)) {
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

  if (field === "rendered-text") {
    if (typeof rawValue !== "string") {
      return validationFailure(field, "Rules text must be text.", rawValue);
    }
    return validationSuccess(field, rawValue);
  }

  if (field === "energy-added") {
    return validateWholeNumber(field, rawValue, { label: "Energy added" });
  }

  if (field === "order") {
    return validateWholeNumber(field, rawValue, {
      max: MAX_DREAMWELL_ORDER,
      label: "Order",
    });
  }

  if (field === "image-number") {
    return validateWholeNumber(field, rawValue, { label: "Image number" });
  }

  if (field === "art") {
    return validateArtCrop(field, rawValue);
  }

  return validationFailure(field, "This field is not editable.", rawValue);
}

export function refreshDreamwellDataJson({
  rootDir = ROOT,
  dreamwellTomlPath = DEFAULT_DREAMWELL_TOML_PATH,
} = {}) {
  const dreamwell = readSourceDreamwell(rootDir, dreamwellTomlPath).map((card) =>
    transformDreamwell(card),
  );
  const dreamwellJsonPath = join(rootDir, DREAMWELL_JSON_PATH);

  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(dreamwellJsonPath, JSON.stringify(dreamwell, null, 2) + "\n");

  return {
    count: dreamwell.length,
    path: dreamwellJsonPath,
  };
}
