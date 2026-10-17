// The capsule fallback: a character draws as layers only when the manifest
// has its recipe resolved with no missing sheets; otherwise the reasons are
// returned (and logged by the loader).

import { describe, expect, it } from "vitest";
import { parseD97CharacterId } from "../../../types/identifiers";
import { manifestEntry } from "./character-looks";
import { CHARACTER_MANIFEST_FORMAT, type CharacterManifest } from "./manifest";

const OK = parseD97CharacterId("d9710000-0000-4000-8000-0000000000e1");
const BROKEN = parseD97CharacterId("d9710000-0000-4000-8000-0000000000e2");
const ABSENT = parseD97CharacterId("d9710000-0000-4000-8000-0000000000e3");
const LAYER = { zPos: 10, sheets: { walk: "/w.png", idle: "/i.png" }, recolor: [] };
const MANIFEST: CharacterManifest = {
  format: CHARACTER_MANIFEST_FORMAT,
  characters: {
    [OK]: { layers: [LAYER], missing: [] },
    [BROKEN]: { layers: [LAYER], missing: ["torso_x lacks walk sheets"] },
  },
};

describe("manifestEntry", () => {
  it("draws a fully resolved recipe and falls back for the rest", () => {
    expect(manifestEntry(MANIFEST, OK)).toEqual({ layers: [LAYER] });
    expect(manifestEntry(MANIFEST, BROKEN)).toEqual({ missing: ["torso_x lacks walk sheets"] });
    expect("missing" in manifestEntry(MANIFEST, ABSENT)).toBe(true);
    expect("missing" in manifestEntry(null, OK)).toBe(true);
  });
});
