import type { EditorTag } from "./types";

const HEX_PATTERN = /^#([0-9a-fA-F]{6})$/u;

/** Neutral color used to render a tag that has no registry entry yet. */
export const FALLBACK_TAG_COLOR = "#475569";

/** Suggested swatches offered when creating a new tag. */
export const DEFAULT_TAG_PALETTE = [
  "#c2410c",
  "#15803d",
  "#1d4ed8",
  "#7c3aed",
  "#b91c1c",
  "#0f766e",
  "#a16207",
  "#be185d",
  "#4338ca",
  "#3f6212",
  "#0e7490",
  "#9333ea",
];

export function isValidTagColor(color: string): boolean {
  return HEX_PATTERN.test(color.trim());
}

function parseHex(color: string): { r: number; g: number; b: number } | null {
  const match = HEX_PATTERN.exec(color.trim());
  if (match === null) {
    return null;
  }

  const value = Number.parseInt(match[1], 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

/**
 * Choose a legible text color (near-black or near-white) for a chip painted
 * with the given background color, using the YIQ perceived-brightness formula.
 */
export function readableTextColor(background: string): string {
  const rgb = parseHex(background);
  if (rgb === null) {
    return "#ffffff";
  }

  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness >= 140 ? "#0b0f12" : "#ffffff";
}

/** Look up a tag's registry color, falling back to a neutral slate. */
export function tagColor(name: string, tags: readonly EditorTag[]): string {
  return tags.find((tag) => tag.name === name)?.color ?? FALLBACK_TAG_COLOR;
}
