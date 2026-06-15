import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { patchTomlRecord } from "./card-editor-data.mjs";
import { transformFigment } from "./setup-assets.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_FIGMENT_TOML_PATH = join("data", "tabula", "figments.toml");
const FIGMENT_JSON_PATH = join("public", "figments-data.json");

/**
 * Figment fields the editor can save. Mirrors the card editor's field set minus
 * the systems figments do not carry (energy cost, tags, tides): the inline
 * fields `name`, `subtype`, `spark`, and `rendered-text`, plus `image-number`
 * and the `art` crop edited through the art-edit modal.
 */
export const EDITABLE_FIGMENT_FIELDS = new Set([
  "name",
  "subtype",
  "spark",
  "rendered-text",
  "image-number",
  "art",
]);

/** Default art crop applied to a figment that has never been art-edited. */
const DEFAULT_FIGMENT_ART_CROP = { x: 0, y: 0, scale: 1.17 };

function validationFailure(field, message, value) {
  return { ok: false, field, value, message };
}

function validationSuccess(field, value) {
  return { ok: true, field, value };
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function readSourceFigments(rootDir, figmentTomlPath = DEFAULT_FIGMENT_TOML_PATH) {
  const absoluteTomlPath = join(rootDir, figmentTomlPath);
  const parsed = parse(readFileSync(absoluteTomlPath, "utf8"));
  const figments = parsed.figments;

  if (!Array.isArray(figments)) {
    throw new Error(`Expected [[figments]] array in ${figmentTomlPath}`);
  }

  return figments;
}

function editorRecordFromFigment(figment, index) {
  const imageNumber =
    typeof figment["image-number"] === "number" ? figment["image-number"] : 0;
  const spark = typeof figment.spark === "number" ? figment.spark : 0;
  const subtype = typeof figment.subtype === "string" ? figment.subtype : "";
  return {
    id: figment.id,
    name: typeof figment.name === "string" ? figment.name : "",
    subtype,
    spark,
    keyword: typeof figment.keyword === "string" ? figment.keyword : "",
    "rendered-text": figment["rendered-text"] ?? "",
    "image-number": imageNumber,
    art:
      figment.art !== null && typeof figment.art === "object"
        ? figment.art
        : null,
    sourceIndex: index,
    source: figment,
  };
}

export function readEditorFigments({
  rootDir = ROOT,
  figmentTomlPath = DEFAULT_FIGMENT_TOML_PATH,
} = {}) {
  return readSourceFigments(rootDir, figmentTomlPath).map(editorRecordFromFigment);
}

export function validateFigmentEdit(field, rawValue) {
  if (!EDITABLE_FIGMENT_FIELDS.has(field)) {
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

  if (field === "subtype") {
    if (typeof rawValue !== "string") {
      return validationFailure(field, "Character type must be text.", rawValue);
    }
    const value = rawValue.trim();
    if (value.length === 0) {
      return validationFailure(field, "Character type cannot be blank.", rawValue);
    }
    return validationSuccess(field, value);
  }

  if (field === "rendered-text") {
    if (typeof rawValue !== "string") {
      return validationFailure(field, "Rules text must be text.", rawValue);
    }
    return validationSuccess(field, rawValue);
  }

  if (field === "spark") {
    const numeric =
      typeof rawValue === "number" ? rawValue : Number(String(rawValue).trim());
    if (!Number.isInteger(numeric) || numeric < 0) {
      return validationFailure(
        field,
        "Spark must be a whole number of 0 or more.",
        rawValue,
      );
    }
    return validationSuccess(field, numeric);
  }

  if (field === "image-number") {
    const numeric =
      typeof rawValue === "number" ? rawValue : Number(String(rawValue).trim());
    if (!Number.isInteger(numeric) || numeric < 0) {
      return validationFailure(
        field,
        "Image number must be a whole number of 0 or more.",
        rawValue,
      );
    }
    return validationSuccess(field, numeric);
  }

  if (field === "art") {
    if (rawValue === null || typeof rawValue !== "object" || Array.isArray(rawValue)) {
      return validationFailure(field, "Art crop must be an object.", rawValue);
    }
    const { x, y, scale } = rawValue;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      typeof scale !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(scale)
    ) {
      return validationFailure(
        field,
        "Art crop must have numeric x, y, and scale.",
        rawValue,
      );
    }
    return validationSuccess(field, {
      x: roundTo(x, 3),
      y: roundTo(y, 3),
      scale: roundTo(scale, 2),
    });
  }

  return validationFailure(field, "This field is not editable.", rawValue);
}

export function patchFigmentsToml(source, { figmentId, field, value }) {
  return patchTomlRecord(source, {
    id: figmentId,
    tableName: "figments",
    editableFields: EDITABLE_FIGMENT_FIELDS,
    validateEdit: validateFigmentEdit,
    field,
    value,
    optionalFields: new Set(["art"]),
    notFoundNoun: "Figment",
  });
}

export function refreshFigmentDataJson({
  rootDir = ROOT,
  figmentTomlPath = DEFAULT_FIGMENT_TOML_PATH,
} = {}) {
  const figments = readSourceFigments(rootDir, figmentTomlPath).map((figment) =>
    transformFigment(figment),
  );
  const figmentJsonPath = join(rootDir, FIGMENT_JSON_PATH);

  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(figmentJsonPath, JSON.stringify(figments, null, 2) + "\n");

  return {
    count: figments.length,
    path: figmentJsonPath,
  };
}

export { DEFAULT_FIGMENT_ART_CROP };
