// @vitest-environment node
//
// Contract backstop for the "Strict, Controlled APIs" principle (commit
// a7cd8d76 + the /tango Design Philosophy). The `tango/no-escape-hatch-props`
// ESLint rule catches escape-hatch props at authoring time by reading source;
// this test catches them on the RESOLVED public surface via react-docgen, so an
// arbitrary-customization prop that leaks in through an extended/aliased type
// (which the AST rule might not see) still fails the build.
//
// It regenerates the surface from the live component/primitive sources — the
// exact directories generate-tango-metadata.mjs scans — rather than reading the
// committed tango-metadata.json, so it can never go stale against the sources.

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractPropMeta } from "./generate-tango-metadata.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The two directories that hold the real design-system surface, matching
// generate-tango-metadata.mjs's COMPONENT_ROOTS.
const COMPONENT_ROOTS = [
  resolve(ROOT, "src/tango/components"),
  resolve(ROOT, "src/tango/primitives"),
];

/** Collect `.tsx` sources, skipping `__*__` fixtures (mirrors the generator). */
function collectComponentFiles(dir) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const name = entry.name;
    if (/^__.*__/.test(name)) continue;
    const full = join(dir, name);
    if (entry.isDirectory()) {
      files.push(...collectComponentFiles(full));
    } else if (entry.isFile() && name.endsWith(".tsx")) {
      files.push(full);
    }
  }
  return files;
}

const files = COMPONENT_ROOTS.flatMap((dir) => collectComponentFiles(dir)).sort();
const surface = extractPropMeta(files);

/** Props whose very presence re-opens an arbitrary-customization escape hatch. */
const BANNED_PROP_NAMES = new Set(["style", "className"]);

describe("Tango strict-API contract (resolved surface)", () => {
  it("finds a non-trivial component surface to check", () => {
    // Guard against extractPropMeta silently returning nothing (which would make
    // every assertion below vacuously pass).
    expect(Object.keys(surface).length).toBeGreaterThan(5);
  });

  it("no component exposes a `style` or `className` prop", () => {
    const offenders = [];
    for (const [component, props] of Object.entries(surface)) {
      for (const prop of props ?? []) {
        if (BANNED_PROP_NAMES.has(prop.name)) {
          offenders.push(`${component}.${prop.name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no component exposes a raw CSSProperties passthrough prop", () => {
    const offenders = [];
    for (const [component, props] of Object.entries(surface)) {
      for (const prop of props ?? []) {
        if (/CSSProperties/.test(prop.tsType ?? "")) {
          offenders.push(`${component}.${prop.name}: ${prop.tsType}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
