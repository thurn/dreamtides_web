import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  CONTAINER_COMPONENTS,
  CONTAINER_PRIMITIVES,
} from "./cumulus-containers.js";
import { CONTAINER_PROPS_TYPES } from "./no-escape-hatch-props.js";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("Cumulus container allowlist (single source of truth)", () => {
  it("derives the escape-hatch rule's *Props allowlist from the shared list", () => {
    // The AST rule keys the container exemption by `${name}Props`. If this
    // drifts, a wrapper would wrongly lose (or gain) its children/node-slot
    // exemption.
    expect([...CONTAINER_PROPS_TYPES].sort()).toEqual(
      CONTAINER_COMPONENTS.map((n) => `${n}Props`).sort(),
    );
  });

  it("keeps Pressable as a primitive, out of the components-scoped rule", () => {
    // Pressable forwards DOM props and lives in primitives/, so it must NOT be
    // in the components allowlist (the AST rule never scans it) but MUST be a
    // recognized container primitive for the contract test.
    expect(CONTAINER_COMPONENTS).not.toContain("Pressable");
    expect(CONTAINER_PRIMITIVES).toContain("Pressable");
  });
});
