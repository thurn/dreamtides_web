// The character manifest parser: a manifest of the current format parses
// (a layer's idle sheet may be null); one of another format, or malformed,
// parses to null so the overworld draws capsules.

import { describe, expect, it } from "vitest";
import { parseD97CharacterId } from "../../../types/identifiers";
import { CHARACTER_MANIFEST_FORMAT, parseCharacterManifest } from "./manifest";

const ID = parseD97CharacterId("d9710000-0000-4000-8000-0000000000d1");
const BODY = { zPos: 10, sheets: { walk: "/body/walk.png", idle: "/body/idle.png" }, recolor: [["#111111", "#222222"]] };
const PROP = { zPos: 140, sheets: { walk: "/prop/walk.png", idle: null }, recolor: [] };

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { format: CHARACTER_MANIFEST_FORMAT, characters: { [ID]: { layers: [BODY, PROP], missing: [] } }, ...overrides };
}

describe("parseCharacterManifest", () => {
  it("parses layers, an idle-less layer included", () => {
    const parsed = parseCharacterManifest(JSON.parse(JSON.stringify(manifest())));
    expect(parsed?.characters[ID]?.layers.map((layer) => layer.sheets)).toEqual([BODY.sheets, PROP.sheets]);
    expect(parsed?.characters[ID]?.layers[0]?.recolor).toEqual([["#111111", "#222222"]]);
  });

  it("rejects another format and malformed entries", () => {
    expect(parseCharacterManifest(manifest({ format: CHARACTER_MANIFEST_FORMAT - 1 }))).toBeNull();
    expect(parseCharacterManifest(null)).toBeNull();
    const noWalk = { zPos: 1, sheets: { idle: "/i.png" }, recolor: [] };
    expect(parseCharacterManifest(manifest({ characters: { [ID]: { layers: [noWalk], missing: [] } } }))).toBeNull();
    expect(parseCharacterManifest(manifest({ characters: { "not-a-uuid": { layers: [], missing: [] } } }))).toBeNull();
  });
});
