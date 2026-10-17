// LPC character sheets outside the overworld canvas: loading a layer sheet,
// recoloring it by its palette swaps, and compositing a D97 character's
// standing front-facing frame from the character manifest workspace
// preparation writes to `public/d97/characters/manifest.json`. The overworld
// (src/d97/overworld/characters/character-looks.ts) cuts its Pixi textures
// from the same recolored sheets. A character the manifest cannot draw has no
// frame. Pixi-free, so DOM surfaces can show a character without loading the
// canvas renderer.

import { assetUrl } from "../../runtime/asset-url";
import type { D97CharacterId } from "../../types/identifiers";

/** LPC frames are square, this many pixels on a side. */
export const LPC_FRAME_SIZE = 64;

/** The idle sheet's row of front-facing frames (rows run up, left, down, right). */
const FRONT_ROW = 2;

/** One `[base, target]` color swap, lowercase `#rrggbb`. */
export type LpcColorSwap = readonly [string, string];

/** The part of a manifest layer a standing frame reads. */
interface ManifestFrameLayer {
  readonly zPos: number;
  readonly sheets: { readonly idle: string };
  readonly recolor: readonly LpcColorSwap[];
}

interface ManifestFrameCharacter {
  readonly layers: readonly ManifestFrameLayer[];
  readonly missing: readonly string[];
}

interface ManifestFrames {
  readonly characters: Readonly<Partial<Record<D97CharacterId, ManifestFrameCharacter>>>;
}

/** Decode the sheet at root-relative `url`. */
export async function loadSheetImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = assetUrl(url);
  await image.decode();
  return image;
}

function hexColor(hex: string): number {
  return Number.parseInt(hex.slice(1, 7), 16);
}

/** The sheet with every base color swapped for its target. */
export function recolorSheet(image: HTMLImageElement, swaps: readonly LpcColorSwap[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: swaps.length > 0 });
  if (context === null) throw new Error("no 2D canvas context");
  context.drawImage(image, 0, 0);
  if (swaps.length === 0) return canvas;
  const table = new Map(swaps.map(([from, to]) => [hexColor(from), hexColor(to)]));
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const target = table.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (target === undefined) continue;
    data[i] = (target >> 16) & 0xff;
    data[i + 1] = (target >> 8) & 0xff;
    data[i + 2] = target & 0xff;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

let manifest: Promise<ManifestFrames | null> | null = null;

function frameManifest(): Promise<ManifestFrames | null> {
  manifest ??= fetch(assetUrl("/d97/characters/manifest.json"))
    .then((response) => (response.ok ? (response.json() as Promise<ManifestFrames>) : null))
    .catch(() => null);
  return manifest;
}

const frames = new Map<D97CharacterId, Promise<string | null>>();

async function composeFrame(id: D97CharacterId): Promise<string | null> {
  const entry = (await frameManifest())?.characters[id];
  if (entry === undefined || entry.missing.length > 0 || entry.layers.length === 0) return null;
  const sheets = await Promise.all(
    [...entry.layers]
      .sort((a, b) => a.zPos - b.zPos)
      .map(async (layer) => recolorSheet(await loadSheetImage(layer.sheets.idle), layer.recolor)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = LPC_FRAME_SIZE;
  canvas.height = LPC_FRAME_SIZE;
  const context = canvas.getContext("2d");
  if (context === null) return null;
  const top = FRONT_ROW * LPC_FRAME_SIZE;
  for (const sheet of sheets) {
    context.drawImage(sheet, 0, top, LPC_FRAME_SIZE, LPC_FRAME_SIZE, 0, 0, LPC_FRAME_SIZE, LPC_FRAME_SIZE);
  }
  return canvas.toDataURL("image/png");
}

/**
 * The image URL of `id`'s standing front-facing frame, composited once per
 * character; null when the manifest cannot draw it. Never rejects.
 */
export function lpcCharacterFrame(id: D97CharacterId): Promise<string | null> {
  let frame = frames.get(id);
  if (frame === undefined) {
    frame = composeFrame(id).catch(() => null);
    frames.set(id, frame);
  }
  return frame;
}
