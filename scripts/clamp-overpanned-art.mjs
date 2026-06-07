#!/usr/bin/env node
// One-off data migration: pull any over-panned art crop in a cards TOML back
// into the valid range. The card renderer (`artCoverMetrics` in CardView.tsx)
// bounds the vertical pan so the watermark strip clipped off the bottom of every
// source image can never rise into the art region and expose the fill band above
// the rules box. Crops authored before that bound was added may store a `y` below
// the valid minimum; those render correctly (the bound clamps them) but the
// stored value is misleading. This rewrites such crops to the clamped value.
//
//   node scripts/clamp-overpanned-art.mjs [path]            # dry run (report only)
//   node scripts/clamp-overpanned-art.mjs [path] --apply    # write changes
//
// Image dimensions come from `sips` (macOS); `public/cards/<n>.webp` must be
// present (run `npm run setup-assets` first).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// --- Constants mirrored from the renderer (keep in sync with CardView.tsx /
//     card-aspect.ts). ---
const ART_SOURCE_BOTTOM_CROP = 21 / 280;
const CARD_ASPECT_RATIO_VALUE = 5 / 7;
const ART_EXTENSION_FRACTION = 0.1;
const ART_REGION_ASPECT_RATIO_VALUE =
  CARD_ASPECT_RATIO_VALUE / (1 - ART_EXTENSION_FRACTION);

// Skip corrections smaller than this (in `art.y` units): a crop sitting a hair
// below its limit renders identically and only adds churn. Roughly 0.05 in `y`
// is well under 1% of card height of exposed band, i.e. not visible.
const MIN_CORRECTION = 0.05;

/** Mirror of `minArtOffsetY` in CardView.tsx. */
function minArtOffsetY(imageAspect, scale) {
  const ratio = imageAspect / ART_REGION_ASPECT_RATIO_VALUE;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const renderH = scale * coverH;
  if (renderH <= 1) {
    return 0;
  }
  const maxPanYFrac = (renderH - 1) / (2 * renderH);
  const lowerPanYFrac = Math.min(
    ART_SOURCE_BOTTOM_CROP - maxPanYFrac,
    maxPanYFrac,
  );
  return Math.max(-1, Math.min(1, lowerPanYFrac / maxPanYFrac));
}

const aspectCache = new Map();
function aspectFor(imageNumber) {
  if (aspectCache.has(imageNumber)) {
    return aspectCache.get(imageNumber);
  }
  let aspect = null;
  try {
    const out = execFileSync(
      "sips",
      ["-g", "pixelWidth", "-g", "pixelHeight", `public/cards/${imageNumber}.webp`],
      { encoding: "utf8" },
    );
    const w = Number(out.match(/pixelWidth:\s*(\d+)/)?.[1]);
    const h = Number(out.match(/pixelHeight:\s*(\d+)/)?.[1]);
    if (w > 0 && h > 0) {
      aspect = w / h;
    }
  } catch {
    aspect = null;
  }
  aspectCache.set(imageNumber, aspect);
  return aspect;
}

const round3 = (v) => Math.round(v * 1000) / 1000;

const path = process.argv[2]?.startsWith("--")
  ? "data/tabula/cards_v2.toml"
  : process.argv[2] ?? "data/tabula/cards_v2.toml";
const apply = process.argv.includes("--apply");

const text = readFileSync(path, "utf8");
// Split into per-card blocks, keeping the `[[cards]]` header on each block.
const blocks = text.split(/(?=^\[\[cards\]\]$)/m);
const changes = [];

const artLine = /^art = \{ x = (-?[\d.]+), y = (-?[\d.]+), scale = (-?[\d.]+) \}$/m;

const newBlocks = blocks.map((block) => {
  const art = block.match(artLine);
  const img = block.match(/^image-number = (\d+)/m);
  if (art === null || img === null) {
    return block;
  }
  const imageNumber = img[1];
  const [, xStr, yStr, scaleStr] = art;
  const y = Number(yStr);
  const scale = Number(scaleStr);
  const aspect = aspectFor(imageNumber);
  if (aspect === null) {
    return block;
  }
  const minY = minArtOffsetY(aspect, scale);
  if (y >= minY) {
    return block;
  }
  const newY = round3(minY);
  if (Math.abs(newY - y) < MIN_CORRECTION) {
    return block;
  }
  const name = block.match(/^name = "(.*)"$/m)?.[1] ?? "(unknown)";
  changes.push({ name, y, newY, scale });
  const newLine = `art = { x = ${xStr}, y = ${newY}, scale = ${scaleStr} }`;
  return block.replace(art[0], newLine);
});

if (changes.length === 0) {
  console.log("No over-panned art crops found.");
  process.exit(0);
}

console.log(`${apply ? "Fixing" : "Would fix"} ${changes.length} crop(s):`);
for (const c of changes) {
  console.log(
    `  ${c.name.padEnd(28)} y ${c.y}  ->  ${c.newY}  (scale ${c.scale})`,
  );
}

if (apply) {
  writeFileSync(path, newBlocks.join(""));
  console.log(`\nWrote ${path}.`);
} else {
  console.log("\nDry run. Re-run with --apply to write changes.");
}
