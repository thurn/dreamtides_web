/**
 * The Dream Atlas is a fixed run of seven layers, and every dreamscape node
 * lives on exactly one of them. `LayerName` names those layers so a layer is
 * always referred to by name — `LayerName.Three` — rather than by a bare
 * number that could be read as either a 0-based array index or a 1-based
 * player-facing "Layer 3". Only two helpers bridge the name to a number:
 * {@link layerOrdinal} for 0-based array/geometry math and
 * {@link layerDisplayNumber} for the 1-based number shown to the player.
 *
 * The string values (`"one"`..`"seven"`) are the persisted form: a saved
 * atlas records `"layer": "three"`, which reads the same in a save file, a log
 * line, and the code.
 */
export enum LayerName {
  One = "one",
  Two = "two",
  Three = "three",
  Four = "four",
  Five = "five",
  Six = "six",
  Seven = "seven",
}

/**
 * The layers in traversal order, from the {@link LayerName.One} starter to the
 * {@link LayerName.Seven} boss. The single source of truth for a layer's ordinal
 * position; array indices into a `DreamAtlas.layers` list line up with it.
 */
export const LAYER_ORDER: readonly LayerName[] = [
  LayerName.One,
  LayerName.Two,
  LayerName.Three,
  LayerName.Four,
  LayerName.Five,
  LayerName.Six,
  LayerName.Seven,
];

/** The number of layers in a Dream Atlas run. */
export const LAYER_COUNT = LAYER_ORDER.length;

/** Roman numeral shown for each layer in the Atlas UI. */
const LAYER_ROMAN: Record<LayerName, string> = {
  [LayerName.One]: "I",
  [LayerName.Two]: "II",
  [LayerName.Three]: "III",
  [LayerName.Four]: "IV",
  [LayerName.Five]: "V",
  [LayerName.Six]: "VI",
  [LayerName.Seven]: "VII",
};

/**
 * The 0-based ordinal of a layer (`One` -> 0 ... `Seven` -> 6). Use this for
 * indexing a `DreamAtlas.layers` array and for the generator's geometry and
 * threshold math, never for anything shown to the player.
 */
export function layerOrdinal(layer: LayerName): number {
  return LAYER_ORDER.indexOf(layer);
}

/**
 * The layer at a 0-based ordinal, or `undefined` when the ordinal is outside
 * the `0..LAYER_COUNT - 1` range. Inverse of {@link layerOrdinal}.
 */
export function layerAtOrdinal(ordinal: number): LayerName | undefined {
  return LAYER_ORDER[ordinal];
}

/**
 * The layer one step deeper toward the boss, or `undefined` past
 * {@link LayerName.Seven}.
 */
export function nextLayer(layer: LayerName): LayerName | undefined {
  return LAYER_ORDER[layerOrdinal(layer) + 1];
}

/**
 * The 1-based number shown to the player (`One` -> 1 ... `Seven` -> 7). This is
 * the only place a player-facing layer number is derived; it matches the
 * documentation's "Layer 1".."Layer 7" and the Atlas Roman numerals.
 */
export function layerDisplayNumber(layer: LayerName): number {
  return layerOrdinal(layer) + 1;
}

/** The Roman numeral shown for a layer in the Atlas UI (`One` -> "I"). */
export function layerRoman(layer: LayerName): string {
  return LAYER_ROMAN[layer];
}

/** Type guard: whether `value` is one of the {@link LayerName} string values. */
export function isLayerName(value: unknown): value is LayerName {
  return (
    typeof value === "string" &&
    (LAYER_ORDER as readonly string[]).includes(value)
  );
}

/**
 * Coerces a persisted layer value to a {@link LayerName}. Accepts a current
 * `LayerName` string unchanged, and revives a legacy save that stored the layer
 * as a 0-based number (`0` -> `One` ... `6` -> `Seven`). Falls back to
 * {@link LayerName.One} for any value it cannot interpret, so reviving a
 * malformed snapshot renders a safe layer instead of crashing.
 */
export function toLayerName(value: unknown): LayerName {
  if (isLayerName(value)) {
    return value;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return layerAtOrdinal(value) ?? LayerName.One;
  }
  return LayerName.One;
}
