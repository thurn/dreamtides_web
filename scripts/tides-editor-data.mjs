// Data layer for the tides editor dev API (`/api/editor/tides`). It reads a
// committed tides artifact (`data/tides4.jsonc`), validates and
// applies an edit to one tide's player-facing annotation fields (displayName,
// displayDescription, color), and writes the file back in the canonical baked
// format so the tides4 freshness gate still passes.
//
// The write-back round-trips the parsed artifact through the SAME
// `serializeArtifact` the bake uses (imported from scripts/bake-tides4.mjs), so a
// hand edit here is byte-identical to what a re-bake would produce except for the
// one annotation field that changed — and the annotation fields are exactly the
// fields the freshness check ignores. Cards are referenced only by stable UUID;
// no code here resolves or compares card names.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serializeArtifact } from "./bake-tides4.mjs";
import { stripJsonComments } from "./setup-assets.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA_DIR = "data";
const PUBLIC_DIR = "public";

/** The default tides artifact edited when no `file` parameter is supplied. */
export const DEFAULT_TIDES_FILE = "tides4";

/** The deck colors a tide may be annotated with (mirrors `Tides4Color`). */
export const TIDES_COLORS = ["purple", "green", "yellow", "blue", "orange"];

/** The annotation fields the editor may change on a tide. */
export const EDITABLE_TIDE_FIELDS = new Set([
  "displayName",
  "displayDescription",
  "color",
]);

/**
 * Resolve the optional `file` parameter to the tides4 artifact.
 */
export function resolveTidesFile(rootDir, requested) {
  const name =
    requested === null || requested === undefined || String(requested).trim() === ""
      ? DEFAULT_TIDES_FILE
      : String(requested).trim();

  if (name !== DEFAULT_TIDES_FILE) {
    return {
      ok: false,
      message: "The file parameter must be tides4.",
    };
  }

  return {
    ok: true,
    file: name,
    jsoncPath: join(DATA_DIR, `${name}.jsonc`),
    jsonPath: join(PUBLIC_DIR, `${name}-data.json`),
  };
}

function readArtifact(rootDir, jsoncPath) {
  const source = readFileSync(join(rootDir, jsoncPath), "utf8");
  return { source, parsed: JSON.parse(stripJsonComments(source)) };
}

/**
 * The committed tides artifact, parsed (comments stripped). Returns the full
 * `{ version, tides, tidePoolByDreamAvatar }` shape so the editor has each tide's
 * id, role, color, annotations, provenance UUIDs (dreamAvatarId / leanCardId),
 * and decklist.
 */
export function readTidesArtifact({ rootDir = ROOT, jsoncPath } = {}) {
  return readArtifact(rootDir, jsoncPath).parsed;
}

/** Validate one tide-annotation edit, returning the canonicalized value. */
export function validateTideEdit(field, rawValue) {
  if (!EDITABLE_TIDE_FIELDS.has(field)) {
    return { ok: false, field, message: "This field is not editable." };
  }

  if (field === "color") {
    const value = typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
    if (!TIDES_COLORS.includes(value)) {
      return {
        ok: false,
        field,
        message: `Color must be one of: ${TIDES_COLORS.join(", ")}.`,
      };
    }
    return { ok: true, field, value };
  }

  // displayName / displayDescription are free text. An empty value clears the
  // annotation (the serializer then omits the field entirely).
  if (typeof rawValue !== "string") {
    return { ok: false, field, message: "Value must be text." };
  }
  return { ok: true, field, value: rawValue.trim() };
}

/**
 * Split a serialized tides artifact into its leading `//` header block and the
 * JSON body's opening brace, so the file can be re-serialized with its own header
 * preserved.
 */
function extractHeader(source) {
  const lines = source.split("\n");
  const braceIndex = lines.findIndex((line) => line === "{");
  if (braceIndex === -1) {
    throw new Error("Tides artifact has no JSON object opening line.");
  }
  return lines.slice(0, braceIndex).join("\n");
}

/**
 * Apply an annotation edit to one tide and return the rewritten artifact text in
 * the canonical baked format. A non-empty value sets the field; an empty
 * displayName/displayDescription removes it. The result is re-parsed to guarantee
 * it stays valid JSONC.
 */
export function patchTideAnnotation(source, { tideId, field, value }) {
  const header = extractHeader(source);
  const parsed = JSON.parse(stripJsonComments(source));
  const tides = Array.isArray(parsed.tides) ? parsed.tides : [];
  const tide = tides.find((entry) => entry && entry.id === tideId);
  if (tide === undefined) {
    throw new Error(`Tide ${tideId} was not found in the artifact.`);
  }

  if (field === "color") {
    tide.color = value;
  } else if (value === "") {
    delete tide[field];
  } else {
    tide[field] = value;
  }

  const patched = serializeArtifact(parsed, header);
  JSON.parse(stripJsonComments(patched));
  return { source: patched, tide };
}

/** Refresh the served `public/<file>-data.json` from the committed artifact. */
export function refreshTidesDataJson({ rootDir = ROOT, jsoncPath, jsonPath }) {
  const jsonc = readFileSync(join(rootDir, jsoncPath), "utf8");
  const served = JSON.stringify(JSON.parse(stripJsonComments(jsonc)));
  mkdirSync(join(rootDir, PUBLIC_DIR), { recursive: true });
  writeFileSync(join(rootDir, jsonPath), served + "\n");
  return { path: join(rootDir, jsonPath) };
}

export { ROOT };
