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
import {
  CONTAINER_COMPONENTS,
  CONTAINER_PRIMITIVES,
} from "../eslint-rules/tango-containers.js";

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

/**
 * The CONTAINER components — a card / pressable / panel wrapper whose job is to
 * hold and frame caller-supplied content — that may legitimately take `children`
 * and raw node slots. Keyed by react-docgen DISPLAY NAME. The membership is
 * shared with the AST rule via `eslint-rules/tango-containers.js` (the rule keys
 * the same allowlist by `*Props` type name) so the two can't drift. The
 * primitive `Pressable` — a transparent interaction mechanism that forwards
 * `children` onto the element it wraps — is covered here (the resolved surface
 * includes primitives) though the components-scoped AST rule never scans it.
 * Every other component must render copy from strict, typed props.
 */
const CONTAINERS = new Set([...CONTAINER_COMPONENTS, ...CONTAINER_PRIMITIVES]);

/** Matches a React-node family type anywhere in a resolved tsType string. */
const REACT_NODE_TYPE = /\b(ReactNode|ReactElement|ReactChild|ReactPortal)\b|JSX\.Element/;

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

  it("only container components take `children` or a raw ReactNode slot", () => {
    // The AST rule catches this on the source; this asserts on the RESOLVED
    // surface, so a node slot that leaks in through an extended/aliased type
    // (or a primitive the AST rule doesn't scan, like Pressable) still fails.
    // A render prop that RETURNS a node is a function type, not a raw slot — its
    // resolved tsType reads `(...) => ReactNode` at the top level, so we exempt
    // any prop whose type is a bare arrow/function signature.
    const offenders = [];
    for (const [component, props] of Object.entries(surface)) {
      if (CONTAINERS.has(component)) {
        continue;
      }
      for (const prop of props ?? []) {
        const tsType = prop.tsType ?? "";
        const isFunctionType = /=>/.test(tsType.split("|")[0]);
        if (prop.name === "children") {
          offenders.push(`${component}.children`);
        } else if (REACT_NODE_TYPE.test(tsType) && !isFunctionType) {
          offenders.push(`${component}.${prop.name}: ${tsType}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
