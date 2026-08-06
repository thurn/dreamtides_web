// @vitest-environment node

import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPONENT_ROOT = resolve(ROOT, "src/cumulus/components");
const RHYTHM_DECLARATION =
  /(?:^|[;{])\s*(?:padding|margin)(?:-(?:top|right|bottom|left|inline|block))?\s*:\s*([^;}]+)|(?:^|[;{])\s*(?:gap|row-gap|column-gap)\s*:\s*([^;}]+)/gim;
const RAW_NONZERO_PX = /(?<![\w-])(?:[1-9]\d*(?:\.\d+)?|0?\.\d*[1-9]\d*)px\b/g;

function cssFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.isFile() && entry.name.endsWith(".css") ? [path] : [];
  });
}

describe("Cumulus component CSS spacing", () => {
  it("uses named spacing tokens for content rhythm", () => {
    const violations = [];

    for (const file of cssFiles(COMPONENT_ROOT)) {
      const source = readFileSync(file, "utf8");
      for (const declaration of source.matchAll(RHYTHM_DECLARATION)) {
        const value = declaration[1] ?? declaration[2] ?? "";
        const literals = value.match(RAW_NONZERO_PX) ?? [];
        if (literals.length > 0) {
          violations.push({
            file: relative(ROOT, file),
            value: value.trim(),
            literals,
          });
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
