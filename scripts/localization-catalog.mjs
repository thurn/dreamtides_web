import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const ENGLISH_LOCALE_DIRECTORY = resolve(ROOT, "data/locales/en-US");
export const ENGLISH_LOCALE_MANIFEST_PATH = resolve(
  ENGLISH_LOCALE_DIRECTORY,
  "manifest.json",
);

export function readLocalizationManifest(
  manifestPath = ENGLISH_LOCALE_MANIFEST_PATH,
) {
  const value = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(
      (fileName) =>
        typeof fileName !== "string" ||
        extname(fileName) !== ".ftl" ||
        fileName.includes("/") ||
        fileName.includes("\\"),
    )
  ) {
    throw new Error(`Invalid Fluent locale manifest: ${manifestPath}`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(
      `Duplicate file in Fluent locale manifest: ${manifestPath}`,
    );
  }
  return value;
}

export function loadEnglishLocalizationResources(
  localeDirectory = ENGLISH_LOCALE_DIRECTORY,
  manifestPath = resolve(localeDirectory, "manifest.json"),
) {
  const manifest = readLocalizationManifest(manifestPath);
  const discovered = readdirSync(localeDirectory)
    .filter((fileName) => extname(fileName) === ".ftl")
    .sort();
  const expected = [...manifest].sort();
  if (JSON.stringify(discovered) !== JSON.stringify(expected)) {
    throw new Error(
      `Fluent locale manifest does not match ${localeDirectory}: expected ${expected.join(", ")}; found ${discovered.join(", ")}`,
    );
  }
  return manifest.map((fileName) => ({
    fileName,
    path: resolve(localeDirectory, fileName),
    source: readFileSync(resolve(localeDirectory, fileName), "utf8"),
  }));
}

export function combineLocalizationResources(resources) {
  return resources.map(({ source }) => source).join("\n");
}
