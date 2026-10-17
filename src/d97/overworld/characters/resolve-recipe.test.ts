// Recipe resolution over a synthetic generator library: layers stack by the
// generator's z-order (a back hair layer under the body), sheets resolve per
// body type and animation, palette swaps map base ramps to targets (skin
// slots follow the recipe's skin), variants pick variant files, and missing
// sheets, layers, palettes and variants are reported.

import { describe, expect, it } from "vitest";
import { characterSprite } from "../../../content/d97/characters/schema";
import { parseD97CharacterId, parseLpcSheetKey } from "../../../types/identifiers";
import { resolveCharacterSprite, type LpcLibrary } from "./resolve-recipe";

const DEFINITIONS: Record<string, unknown> = {
  body: {
    layer_1: { zPos: 10, male: "body/male/", female: "body/female/" },
    recolors: { material: "body", palettes: ["ulpc"] },
  },
  hair_long: {
    layer_1: { zPos: 120, male: "hair/long/fg/", female: "hair/long/fg/" },
    layer_2: { zPos: 9, male: "hair/long/bg/", female: "hair/long/bg/" },
    recolors: { material: "hair", palettes: ["ulpc", "all.lpcr"] },
  },
  heads_human: {
    layer_1: { zPos: 100, male: "head/male/", female: "head/female/" },
    recolors: {
      color_1: { material: "body", palettes: ["ulpc"] },
      color_2: { material: "eye", palettes: ["ulpc"] },
    },
  },
  mask: {
    layer_1: { zPos: 114, male: "mask/", female: "mask/" },
    variants: ["white", "black"],
  },
  skirt: { layer_1: { zPos: 20, female: "skirt/" }, recolors: { material: "cloth", palettes: ["ulpc"] } },
  ghost: { layer_1: { zPos: 30, male: "ghost/" } },
};

const PALETTES: Record<string, Record<string, string[]>> = {
  "body/body_ulpc": { light: ["#111111", "#222222"], olive: ["#333333", "#444444"] },
  "hair/hair_ulpc": { orange: ["#AA0000", "#BB0000", "#CC0000"], red: ["#AA0000", "#DD0000"] },
  "all/all_lpcr": { teal: ["#00AAAA", "#00BBBB", "#00CCCC"] },
  "eye/eye_ulpc": { blue: ["#0000AA"], green: ["#00AA00"] },
  "cloth/cloth_ulpc": { white: ["#FFFFFF"], navy: ["#000080"] },
};

const MATERIALS: Record<string, { default: string; base: string }> = {
  body: { default: "ulpc", base: "light" },
  hair: { default: "ulpc", base: "orange" },
  eye: { default: "ulpc", base: "blue" },
  cloth: { default: "ulpc", base: "white" },
};

const FILES = new Set(
  [
    "body/male/", "body/female/", "hair/long/fg/", "hair/long/bg/", "head/male/", "head/female/", "skirt/",
  ].flatMap((path) => [`${path}walk.png`, `${path}idle.png`]).concat(["mask/walk/black.png", "mask/idle/black.png", "ghost/walk.png"]),
);

const LIBRARY: LpcLibrary = {
  definition: (key) => DEFINITIONS[key] ?? null,
  palettes: (material, set) => PALETTES[`${material}/${material}_${set}`] ?? null,
  material: (material) => MATERIALS[material] ?? null,
  sheetExists: (path) => FILES.has(path),
};

const sheet = parseLpcSheetKey;
const ID = parseD97CharacterId("d9710000-0000-4000-8000-0000000000f1");

describe("resolveCharacterSprite", () => {
  it("stacks the body and parts by z-order with per-body sheets", () => {
    const resolved = resolveCharacterSprite(
      characterSprite({ id: ID, body: "female", skin: "olive", parts: [{ sheet: sheet("hair_long"), colors: ["red"] }, { sheet: sheet("skirt") }] }),
      LIBRARY,
    );
    expect(resolved.missing).toEqual([]);
    expect(resolved.layers.map((layer) => [layer.zPos, layer.sheets.walk, layer.sheets.idle])).toEqual([
      [9, "hair/long/bg/walk.png", "hair/long/bg/idle.png"],
      [10, "body/female/walk.png", "body/female/idle.png"],
      [20, "skirt/walk.png", "skirt/idle.png"],
      [120, "hair/long/fg/walk.png", "hair/long/fg/idle.png"],
    ]);
  });

  it("swaps base ramps for target palettes, skin slots following the recipe", () => {
    const resolved = resolveCharacterSprite(
      characterSprite({
        id: ID,
        body: "male",
        skin: "olive",
        parts: [{ sheet: sheet("hair_long"), colors: ["teal"] }],
      }),
      LIBRARY,
    );
    const byZ = new Map(resolved.layers.map((layer) => [layer.zPos, layer.recolor]));
    expect(byZ.get(10)).toEqual([["#111111", "#333333"], ["#222222", "#444444"]]);
    expect(byZ.get(120)).toEqual([["#aa0000", "#00aaaa"], ["#bb0000", "#00bbbb"], ["#cc0000", "#00cccc"]]);
    // A head's first slot is its skin and its second its eyes.
    const head = resolveCharacterSprite(
      characterSprite({ id: ID, body: "male", skin: "olive", parts: [{ sheet: sheet("heads_human"), colors: ["olive", "green"] }] }),
      LIBRARY,
    ).layers.find((layer) => layer.zPos === 100);
    expect(head?.recolor).toEqual([["#111111", "#333333"], ["#222222", "#444444"], ["#0000aa", "#00aa00"]]);
  });

  it("picks variant files and keeps base colors for unnamed slots", () => {
    const resolved = resolveCharacterSprite(
      characterSprite({ id: ID, body: "male", skin: "light", parts: [{ sheet: sheet("mask"), colors: ["black"] }] }),
      LIBRARY,
    );
    const mask = resolved.layers.find((layer) => layer.zPos === 114);
    expect(mask?.sheets.walk).toBe("mask/walk/black.png");
    expect(mask?.recolor).toEqual([]);
    expect(resolved.layers.find((layer) => layer.zPos === 10)?.recolor).toEqual([]);
  });

  it("reports unknown sheets, missing body layers, sheets, palettes and variants", () => {
    const resolved = resolveCharacterSprite(
      characterSprite({
        id: ID,
        body: "male",
        skin: "light",
        parts: [
          { sheet: sheet("nonexistent") },
          { sheet: sheet("skirt") },
          { sheet: sheet("ghost") },
          { sheet: sheet("hair_long"), colors: ["plaid"] },
          { sheet: sheet("mask"), colors: ["red"] },
        ],
      }),
      LIBRARY,
    );
    expect(resolved.missing).toHaveLength(5);
  });
});
