#!/usr/bin/env node
// One-off data migration: pull any art crop in a cards TOML that falls outside
// the safe-area envelope back into range. The card renderer (`artCoverMetrics` /
// `minArtScale` in CardView.tsx) keeps the watermark-clipped art bottom covering
// down to under the rules box, both by flooring zoom-out (`minArtScale`) and by
// bounding the up-pan (`minArtOffsetY`), so the fill band never opens a gap above
// the rules box. Crops authored before that envelope existed may store a zoom
// below the floor or a `y` above the up-pan bound; those render correctly (the
// renderer clamps them) but the stored value is misleading. This rewrites such
// crops to the clamped value.
//
// Because the script cannot measure each card's rules-box height, it clamps
// against the box-less target (the art-region seam), a conservative floor that
// guarantees coverage for every box size. The live renderer uses the tighter
// box-relative target, so it may hold a short-box card a little more zoomed in
// than this migration does; that is intended (the renderer is the final guard).
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
// Box-less coverage target: keep the art covering down to the art-region seam.
const SEAM_TARGET = 1 - ART_EXTENSION_FRACTION;

// Skip corrections smaller than this (in `art.y` units): a crop sitting a hair
// below its limit renders identically and only adds churn. Roughly 0.05 in `y`
// is well under 1% of card height of exposed band, i.e. not visible.
const MIN_CORRECTION = 0.05;
// Skip zoom corrections smaller than this (in `scale` units): the editor stores
// scale to two decimals, so a sub-0.02 bump is noise.
const MIN_SCALE_CORRECTION = 0.02;

/** Mirror of `minArtOffsetY` in CardView.tsx. */
function minArtOffsetY(imageAspect, scale, target = SEAM_TARGET) {
  const ratio = imageAspect / ART_REGION_ASPECT_RATIO_VALUE;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const renderH = scale * coverH;
  if (renderH <= 1) {
    return 0;
  }
  const region = 1 - ART_EXTENSION_FRACTION;
  const maxPanYFrac = (renderH - 1) / (2 * renderH);
  const pMin = (target - region / 2) / (renderH * region) - 0.5 + ART_SOURCE_BOTTOM_CROP;
  const lowerPanYFrac = Math.min(pMin, maxPanYFrac);
  return Math.max(-1, Math.min(1, lowerPanYFrac / maxPanYFrac));
}

/** Mirror of `minArtScale` in CardView.tsx. */
function minArtScale(imageAspect, target = SEAM_TARGET) {
  const ratio = imageAspect / ART_REGION_ASPECT_RATIO_VALUE;
  const coverW = ratio >= 1 ? ratio : 1;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const region = 1 - ART_EXTENSION_FRACTION;
  const renderHForTarget = target / (region * (1 - ART_SOURCE_BOTTOM_CROP));
  const renderHMin = Math.max(1, renderHForTarget);
  return Math.max(1 / coverW, renderHMin / coverH);
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
  ? "data/tabula/cards.toml"
  : process.argv[2] ?? "data/tabula/cards.toml";
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
  // Raise zoom to the safe-area floor first: a larger zoom adds overscan, which
  // in turn lowers the up-pan floor the `y` is then clamped against.
  const scaleFloor = minArtScale(aspect);
  let newScale = scale;
  if (scaleFloor - scale > MIN_SCALE_CORRECTION) {
    newScale = round3(scaleFloor);
  }
  const minY = minArtOffsetY(aspect, newScale);
  let newY = y;
  if (minY - y > MIN_CORRECTION) {
    newY = round3(minY);
  }
  if (newScale === scale && newY === y) {
    return block;
  }
  const name = block.match(/^name = "(.*)"$/m)?.[1] ?? "(unknown)";
  changes.push({ name, y, newY, scale, newScale });
  const newLine = `art = { x = ${xStr}, y = ${newY}, scale = ${newScale} }`;
  return block.replace(art[0], newLine);
});

if (changes.length === 0) {
  console.log("No out-of-range art crops found.");
  process.exit(0);
}

console.log(`${apply ? "Fixing" : "Would fix"} ${changes.length} crop(s):`);
for (const c of changes) {
  const yPart = c.newY === c.y ? `y ${c.y}` : `y ${c.y} -> ${c.newY}`;
  const scalePart =
    c.newScale === c.scale ? `scale ${c.scale}` : `scale ${c.scale} -> ${c.newScale}`;
  console.log(`  ${c.name.padEnd(28)} ${yPart}  (${scalePart})`);
}

if (apply) {
  writeFileSync(path, newBlocks.join(""));
  console.log(`\nWrote ${path}.`);
} else {
  console.log("\nDry run. Re-run with --apply to write changes.");
}
