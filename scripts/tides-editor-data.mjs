// Data layer for the tides editor dev API. Reads the generated compatibility
// TOML projection and validates closed semantic edits applied to canonical RON.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";

import { compileTidesData } from "./tides-data.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA_DIR = "data";

export const DEFAULT_TIDES_FILE = "tides";
export const DREAM_AVATARS_TOML_PATH = join(DATA_DIR, "dream_avatars.toml");
export const RESONANCES = ["ember", "valor", "vision", "wild", "shadow"];
export const EDITABLE_TIDE_FIELDS = new Set([
  "displayName",
  "displayDescription",
  "resonance",
]);

export function resolveTidesFile(rootDir, requested) {
  const name =
    requested === null ||
    requested === undefined ||
    String(requested).trim() === ""
      ? DEFAULT_TIDES_FILE
      : String(requested).trim();
  if (name !== DEFAULT_TIDES_FILE) {
    return { ok: false, message: "The file parameter must be tides." };
  }
  return {
    ok: true,
    file: name,
    ronPath: join(DATA_DIR, `${name}.ron`),
    tomlPath: join(DATA_DIR, `${name}.toml`),
  };
}

export function readTidesArtifact({
  rootDir = ROOT,
  tomlPath,
  dreamAvatarsTomlPath = DREAM_AVATARS_TOML_PATH,
} = {}) {
  return compileTidesData(
    parse(readFileSync(join(rootDir, tomlPath), "utf8")),
    parse(readFileSync(join(rootDir, dreamAvatarsTomlPath), "utf8")),
  );
}

export function validateTideEdit(field, rawValue) {
  if (!EDITABLE_TIDE_FIELDS.has(field)) {
    return { ok: false, field, message: "This field is not editable." };
  }
  if (field === "resonance") {
    const value =
      typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
    if (!RESONANCES.includes(value)) {
      return {
        ok: false,
        field,
        message: `Resonance must be one of: ${RESONANCES.join(", ")}.`,
      };
    }
    return { ok: true, field, value };
  }
  if (typeof rawValue !== "string") {
    return { ok: false, field, message: "Value must be text." };
  }
  return { ok: true, field, value: rawValue.trim() };
}

export { ROOT };
