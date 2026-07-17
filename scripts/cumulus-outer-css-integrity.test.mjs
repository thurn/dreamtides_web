// @vitest-environment node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OUTER_UI_CSS_BASELINES } from "../eslint-rules/ui-boundary-baselines.js";
import { OUTER_UI_FILE_ROLES, OUTER_UI_ROLES } from "../eslint-rules/ui-boundary-roles.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_SOURCE = readFileSync(resolve(ROOT, "src/cumulus/primitives/cumulus-tokens.css"), "utf8");
const KNOWN_TOKENS = new Set([...TOKEN_SOURCE.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
const COMPONENT_LOCAL_PREFIXES = ["--cv-", "--draft-", "--dt-", "--hover-zoom-"];

function counted(rule, source) {
  const patterns = {
    "raw-color": /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\([^()]*\)/g,
    "raw-length": /(?<![\w-])\d+(?:\.\d+)?px\b/g,
    "raw-radius": /border-radius\s*:\s*(?!var\()[^;}]+/g,
    "inline-glass": /(?:backdrop-)?filter\s*:\s*[^;]*(?:blur\(\s*\d|saturate\(\s*\d)/g,
    "cumulus-card-selector": /\.card-view\b/g,
  };
  return (source.match(patterns[rule]) ?? []).length;
}

describe("outer CSS integrity", () => {
  it("keeps token references resolvable and pins all temporary CSS debt", () => {
    const actual = [];
    for (const [file, role] of Object.entries(OUTER_UI_FILE_ROLES)) {
      if (!file.endsWith(".css") || role === OUTER_UI_ROLES.VENDOR_ASSET) continue;
      const source = readFileSync(resolve(ROOT, file), "utf8");
      const unknown = [...source.matchAll(/var\(\s*(--[\w-]+)/g)]
        .map((match) => match[1])
        .filter((name) =>
          !KNOWN_TOKENS.has(name) && !COMPONENT_LOCAL_PREFIXES.some((prefix) => name.startsWith(prefix)),
        );
      if (unknown.length > 0) actual.push({ file, rule: "unknown-token", count: unknown.length });
      for (const rule of ["raw-color", "raw-length", "raw-radius", "inline-glass", "cumulus-card-selector"]) {
        const count = counted(rule, source);
        if (count > 0) actual.push({ file, rule, count });
      }
    }
    const byFileAndRule = (a, b) => `${a.file}:${a.rule}`.localeCompare(`${b.file}:${b.rule}`);
    expect(actual.sort(byFileAndRule)).toEqual([...OUTER_UI_CSS_BASELINES].sort(byFileAndRule));
  });
});
