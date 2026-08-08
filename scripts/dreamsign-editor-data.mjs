import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import {
  normalizeTagList,
  readFacetRegistry,
  TAG_FACET,
  validateTagRegistry,
} from "./card-editor-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_DREAMSIGN_TOML_PATH = join("data", "dreamsigns.toml");

export const EDITABLE_DREAMSIGN_FIELDS = new Set(["name", "rendered-text", "tags"]);

// Generated compatibility TOML supplies the editor's display records. Saves
// target typed Dreamsign definitions, internal metadata, and the tag registry
// through the canonical RON transaction in dreamsign-editor-api.mjs.

function validationFailure(field, message, value) {
  return {
    ok: false,
    field,
    value,
    message,
  };
}

function validationSuccess(field, value) {
  return {
    ok: true,
    field,
    value,
  };
}

function readSourceDreamsigns(rootDir, dreamsignTomlPath = DEFAULT_DREAMSIGN_TOML_PATH) {
  const absoluteTomlPath = join(rootDir, dreamsignTomlPath);
  const parsed = parse(readFileSync(absoluteTomlPath, "utf8"));
  const dreamsigns = parsed.dreamsign;

  if (!Array.isArray(dreamsigns)) {
    throw new Error(`Expected [[dreamsign]] array in ${dreamsignTomlPath}`);
  }

  return dreamsigns;
}

function editorRecordFromDreamsign(dreamsign, index) {
  return {
    id: dreamsign.id,
    name: dreamsign.name,
    imageName: typeof dreamsign.image_name === "string" ? dreamsign.image_name : "",
    imageAlt: `${String(dreamsign.name)} Dreamsign artwork`,
    "rendered-text": dreamsign["rendered-text"] ?? "",
    tags: normalizeTagList(dreamsign.tags),
    sourceIndex: index,
    source: dreamsign,
  };
}

export function readEditorDreamsigns({
  rootDir = ROOT,
  dreamsignTomlPath = DEFAULT_DREAMSIGN_TOML_PATH,
} = {}) {
  return readSourceDreamsigns(rootDir, dreamsignTomlPath).map(editorRecordFromDreamsign);
}

export function validateDreamsignEdit(field, rawValue) {
  if (!EDITABLE_DREAMSIGN_FIELDS.has(field)) {
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
      return validationFailure(field, "Effect text must be text.", rawValue);
    }

    return validationSuccess(field, rawValue);
  }

  if (field === "tags") {
    if (!Array.isArray(rawValue)) {
      return validationFailure(field, "Tags must be a list.", rawValue);
    }

    const values = [];
    for (const entry of rawValue) {
      if (typeof entry !== "string") {
        return validationFailure(field, "Each tag must be text.", rawValue);
      }
      const trimmed = entry.trim();
      if (trimmed === "") {
        return validationFailure(field, "Tags cannot be blank.", rawValue);
      }
      if (!values.includes(trimmed)) {
        values.push(trimmed);
      }
    }

    return validationSuccess(field, values);
  }

  return validationFailure(field, "This field is not editable.", rawValue);
}

export function readDreamsignTagRegistry({
  rootDir = ROOT,
  dreamsignTomlPath = DEFAULT_DREAMSIGN_TOML_PATH,
} = {}) {
  return readFacetRegistry({
    rootDir,
    cardTomlPath: dreamsignTomlPath,
    facet: TAG_FACET,
    sourceArrayKey: "dreamsign",
  });
}

export { validateTagRegistry };
