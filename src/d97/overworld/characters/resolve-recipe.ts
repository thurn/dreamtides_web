// Resolves a character sprite recipe against the Universal LPC generator's
// sheet definitions and palettes: the layers to stack (each with its z-order,
// its walk and idle sheets, and the color swaps that recolor it) and anything
// the recipe names that the library lacks. Pure; workspace preparation
// supplies the library reads (scripts/d97/link-characters.ts).

import type { CharacterSprite, CharacterSpritePart } from "../../../content/d97/characters/schema";
import { parseLpcSheetKey, type D97CharacterId, type LpcSheetKey } from "../../../types/identifiers";

/** The animations the overworld draws. */
export const CHARACTER_ANIMATIONS = ["walk", "idle"] as const;
export type CharacterAnimation = (typeof CHARACTER_ANIMATIONS)[number];

/** What the resolver reads from the generator's checkout. */
export interface LpcLibrary {
  /** A sheet definition's JSON, or null when there is none. */
  readonly definition: (key: LpcSheetKey) => unknown;
  /** A palette file (`palette_definitions/<material>/<material>_<set>.json`). */
  readonly palettes: (material: string, set: string) => Readonly<Record<string, readonly string[]>> | null;
  /** A material's meta: its default palette set and base palette. */
  readonly material: (material: string) => { readonly default: string; readonly base: string } | null;
  /** Whether `spritesheets/<path>` exists. */
  readonly sheetExists: (path: string) => boolean;
}

export interface ResolvedLayer {
  /** The generator's z-order; lower draws first. */
  readonly zPos: number;
  /** Spritesheets-relative paths per animation. */
  readonly sheets: Readonly<Record<CharacterAnimation, string>>;
  /** Color swaps, `[base, target]` lowercase `#rrggbb`. */
  readonly recolor: readonly (readonly [string, string])[];
}

export interface ResolvedCharacter {
  readonly id: D97CharacterId;
  readonly layers: readonly ResolvedLayer[];
  /** Why parts could not resolve; any entry makes the character a capsule. */
  readonly missing: readonly string[];
}

const BODY_SHEET = parseLpcSheetKey("body");

type Json = Record<string, unknown>;

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** A palette spec: `set` (the slot's material) or `material.set`. */
function paletteFile(spec: string, material: string): [string, string] {
  const dot = spec.indexOf(".");
  return dot === -1 ? [material, spec] : [spec.slice(0, dot), spec.slice(dot + 1)];
}

interface ColorSlot {
  readonly material: string;
  readonly base: string | undefined;
  readonly palettes: readonly string[];
}

function colorSlots(definition: Json): readonly ColorSlot[] {
  const recolors = definition.recolors;
  if (!isJson(recolors)) return [];
  const slot = (value: Json, fallback: Json): ColorSlot => ({
    material: typeof value.material === "string" ? value.material : "",
    base: typeof value.base === "string" ? value.base : typeof fallback.base === "string" ? fallback.base : undefined,
    palettes: strings(value.palettes).length > 0 ? strings(value.palettes) : strings(fallback.palettes),
  });
  if (typeof recolors.material === "string") return [slot(recolors, recolors)];
  return Object.keys(recolors)
    .filter((key) => /^color_\d+$/u.test(key))
    .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)))
    .flatMap((key) => {
      const value = recolors[key];
      return isJson(value) ? [slot(value, recolors)] : [];
    });
}

function ramp(library: LpcLibrary, material: string, set: string, name: string): readonly string[] | null {
  return library.palettes(material, set)?.[name] ?? null;
}

/** The base ramp a slot's sheets are drawn in. */
function baseRamp(library: LpcLibrary, slot: ColorSlot): readonly string[] | null {
  const meta = library.material(slot.material);
  if (meta === null) return null;
  const base = slot.base ?? meta.base;
  const [set, name] = base.includes(".") ? base.split(".", 2) : [meta.default, base];
  return ramp(library, slot.material, set ?? meta.default, name ?? base);
}

/** The named palette from the slot's palette sets, in order. */
function targetRamp(library: LpcLibrary, slot: ColorSlot, name: string): readonly string[] | null {
  for (const spec of slot.palettes) {
    const [material, set] = paletteFile(spec, slot.material);
    const found = ramp(library, material, set, name);
    if (found !== null) return found;
  }
  return null;
}

function resolvePart(
  recipe: CharacterSprite,
  part: CharacterSpritePart,
  library: LpcLibrary,
  missing: string[],
): ResolvedLayer[] {
  const definition = library.definition(part.sheet);
  if (!isJson(definition)) {
    missing.push(`unknown sheet ${part.sheet}`);
    return [];
  }
  const variants = strings(definition.variants);
  const slots = colorSlots(definition);
  const recolor: (readonly [string, string])[] = [];
  let variant: string | null = null;
  if (variants.length > 0) {
    variant = part.colors?.[0] ?? variants[0] ?? null;
    if (variant === null || !variants.includes(variant)) {
      missing.push(`${part.sheet} has no variant ${String(variant)}`);
      return [];
    }
  } else {
    slots.forEach((slot, index) => {
      const name = part.colors?.[index] ?? (slot.material === "body" ? recipe.skin : undefined);
      if (name === undefined) return;
      const from = baseRamp(library, slot);
      const to = targetRamp(library, slot, name);
      if (from === null || to === null) {
        missing.push(`${part.sheet} has no ${slot.material} palette ${name}`);
        return;
      }
      for (let i = 0; i < Math.min(from.length, to.length); i += 1) {
        const pair = [from[i].toLowerCase(), to[i].toLowerCase()] as const;
        if (pair[0] !== pair[1]) recolor.push(pair);
      }
    });
  }
  const layers: ResolvedLayer[] = [];
  const layerKeys = Object.keys(definition)
    .filter((key) => /^layer_\d+$/u.test(key))
    .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
  for (const key of layerKeys) {
    const layer = definition[key];
    if (!isJson(layer)) continue;
    const path = layer[recipe.body];
    if (typeof path !== "string") {
      missing.push(`${part.sheet} has no ${recipe.body} body layer`);
      continue;
    }
    const sheets = Object.fromEntries(
      CHARACTER_ANIMATIONS.map((animation) => [
        animation,
        variant === null ? `${path}${animation}.png` : `${path}${animation}/${variant}.png`,
      ]),
    ) as Record<CharacterAnimation, string>;
    const absent = CHARACTER_ANIMATIONS.filter((animation) => !library.sheetExists(sheets[animation]));
    if (absent.length > 0) {
      missing.push(`${part.sheet} lacks ${absent.join(", ")} sheets at ${path}`);
      continue;
    }
    layers.push({ zPos: typeof layer.zPos === "number" ? layer.zPos : 0, sheets, recolor });
  }
  return layers;
}

/** Resolve `recipe`: its body and parts, stacked by the generator's z-order. */
export function resolveCharacterSprite(recipe: CharacterSprite, library: LpcLibrary): ResolvedCharacter {
  const missing: string[] = [];
  const parts: CharacterSpritePart[] = [{ sheet: BODY_SHEET }, ...recipe.parts];
  const layers = parts
    .flatMap((part, order) => resolvePart(recipe, part, library, missing).map((layer) => ({ layer, order })))
    .sort((a, b) => a.layer.zPos - b.layer.zPos || a.order - b.order)
    .map(({ layer }) => layer);
  return { id: recipe.id, layers, missing };
}
