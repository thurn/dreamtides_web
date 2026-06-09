import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import {
  normalizeTagList,
  patchTomlRecord,
  readFacetRegistry,
  serializeFacetRegistry,
  TAG_FACET,
  tagRegistryPathFor,
  validateTagRegistry,
} from "./card-editor-data.mjs";
import { transformDreamsign } from "./setup-assets.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_DREAMSIGN_TOML_PATH = join("data", "tabula", "dreamsigns.toml");
const DREAMSIGN_JSON_PATH = join("public", "dreamsign-data.json");

export const EDITABLE_DREAMSIGN_FIELDS = new Set(["name", "rendered-text", "tags"]);

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

export function patchDreamsignsToml(source, { dreamsignId, field, value }) {
  return patchTomlRecord(source, {
    id: dreamsignId,
    tableName: "dreamsign",
    editableFields: EDITABLE_DREAMSIGN_FIELDS,
    validateEdit: validateDreamsignEdit,
    field,
    value,
    optionalFields: new Set(["tags"]),
    notFoundNoun: "Dreamsign",
  });
}

export function refreshDreamsignDataJson({
  rootDir = ROOT,
  dreamsignTomlPath = DEFAULT_DREAMSIGN_TOML_PATH,
} = {}) {
  const dreamsigns = readSourceDreamsigns(rootDir, dreamsignTomlPath).map((dreamsign) =>
    transformDreamsign(dreamsign),
  );
  const dreamsignJsonPath = join(rootDir, DREAMSIGN_JSON_PATH);

  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(dreamsignJsonPath, JSON.stringify(dreamsigns, null, 2) + "\n");

  return {
    count: dreamsigns.length,
    path: dreamsignJsonPath,
  };
}

export function removeTagsFromDreamsigns(source, removedNames) {
  if (removedNames.length === 0) {
    return source;
  }

  const removed = new Set(removedNames);
  const parsed = parse(source);
  const dreamsigns = Array.isArray(parsed.dreamsign) ? parsed.dreamsign : [];

  let next = source;
  for (const dreamsign of dreamsigns) {
    const values = normalizeTagList(dreamsign.tags);
    if (!values.some((value) => removed.has(value))) {
      continue;
    }
    const filtered = values.filter((value) => !removed.has(value));
    next = patchDreamsignsToml(next, {
      dreamsignId: dreamsign.id,
      field: "tags",
      value: filtered,
    }).source;
  }

  return next;
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

export function serializeDreamsignTagRegistry(tags, { dreamsignTomlBasename } = {}) {
  return serializeFacetRegistry(tags, {
    cardTomlBasename: dreamsignTomlBasename,
    facet: TAG_FACET,
    resourceNoun: "dreamsign",
    editorName: "dreamsign editor",
  });
}

export function dreamsignTagRegistryPathFor(dreamsignTomlPath) {
  return tagRegistryPathFor(dreamsignTomlPath);
}

export { validateTagRegistry };
