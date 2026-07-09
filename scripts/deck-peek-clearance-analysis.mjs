// Empirical proof for the mobile deck viewer's press-zoom placement.
//
// The claim under test: when a card is pressed, the enlarged copy's rules-text
// band never overlaps the circle the finger occludes around the pressed card.
// This script sweeps every touch a finger can make — each grid column, at every
// height the scrolling grid can bring a tile to — across a range of phone
// widths, runs the real `computePeekBox`, and measures the gap between the
// finger circle and the rules band. It fails loudly if any gap goes negative,
// and writes an SVG that draws the circle and the rules band for a sample of
// presses so the clearance can be seen, not just asserted.
//
//   node scripts/deck-peek-clearance-analysis.mjs [out.svg]
//
// Layout constants below mirror the Tango tokens the screen renders against
// (--gutter, --space-4, --safe-top, --safe-bottom); the grid geometry mirrors
// MobileDeckViewer (4 columns, cards at 5:7).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  computePeekBox,
  peekWidthForViewport,
  rulesRegionOfPeek,
  circleRectGap,
  FINGER_RADIUS_PX,
  CLEARANCE_MARGIN_PX,
} from "../src/tango/components/card/mobile-card-peek-geometry.ts";

const GUTTER = 18; // --gutter (also the card's side margin)
const COLUMN_GAP = 8; // --space-4 (grid gap)
const GRID_TOP_PAD = 12; // --space-5 (grid top padding)
const SAFE_TOP = 59; // --safe-top
const SAFE_BOTTOM = 34; // --safe-bottom
const COLUMNS = 4;
const ASPECT = 5 / 7;

// Height of the fixed top band (title + count + reserved search field), from
// which the scrolling grid begins. Measured off the running screen; the exact
// value only bounds how high a tile center can be pressed and is not critical.
const TOP_BAND_H = 150;

const VIEWPORTS = [
  { name: "Galaxy S / small", width: 360, height: 800 },
  { name: "iPhone SE / mini", width: 375, height: 812 },
  { name: "iPhone 16", width: 393, height: 852 },
  { name: "iPhone Pro Max", width: 430, height: 932 },
];

/** Column-center x coordinates of the 4-across grid for a viewport width. */
function columnCenters(viewportWidth) {
  const gridWidth = viewportWidth - GUTTER * 2;
  const tileWidth = (gridWidth - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS;
  const centers = [];
  for (let i = 0; i < COLUMNS; i++) {
    centers.push(GUTTER + i * (tileWidth + COLUMN_GAP) + tileWidth / 2);
  }
  return { centers, tileWidth, tileHeight: (tileWidth * 7) / 5 };
}

/** Runs the placement for one press and returns its clearance geometry. */
function evaluatePress(viewport, fx, fy, width) {
  const box = computePeekBox({
    viewport: { width: viewport.width, height: viewport.height },
    safeTop: SAFE_TOP,
    safeBottom: SAFE_BOTTOM,
    sideMargin: GUTTER,
    aspect: ASPECT,
    width,
    finger: { x: fx, y: fy },
  });
  const rules = rulesRegionOfPeek(box);
  const gap = circleRectGap(fx, fy, FINGER_RADIUS_PX, rules);
  return { box, rules, gap };
}

// ---- Exhaustive sweep --------------------------------------------------------

let worst = { gap: Infinity };
const perViewport = [];
for (const viewport of VIEWPORTS) {
  const { centers, tileHeight } = columnCenters(viewport.width);
  const width = peekWidthForViewport({
    viewportWidth: viewport.width,
    sideMargin: GUTTER,
    columns: COLUMNS,
    columnGap: COLUMN_GAP,
  });
  // A tile center can sit anywhere from just under the top band (grid scrolled
  // to the bottom) to just above the bottom safe area (grid scrolled to top).
  const fyMin = TOP_BAND_H + GRID_TOP_PAD + tileHeight / 2;
  const fyMax = viewport.height - SAFE_BOTTOM - tileHeight / 2;
  let vpWorst = { gap: Infinity };
  for (const fx of centers) {
    for (let fy = fyMin; fy <= fyMax; fy += 1) {
      const { gap } = evaluatePress(viewport, fx, fy, width);
      if (gap < vpWorst.gap) vpWorst = { gap, fx, fy };
    }
  }
  perViewport.push({ viewport, width, vpWorst });
  if (vpWorst.gap < worst.gap) worst = { ...vpWorst, viewport: viewport.name };
}

console.log("Deck peek — rules-text vs finger-circle clearance");
console.log(
  `finger radius = ${FINGER_RADIUS_PX}px, clearance margin = ${CLEARANCE_MARGIN_PX}px\n`,
);
for (const { viewport, width, vpWorst } of perViewport) {
  const ok = vpWorst.gap >= 0;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${viewport.name.padEnd(18)} ` +
      `${String(viewport.width).padStart(3)}w  card=${width.toFixed(1)}px  ` +
      `min gap=${vpWorst.gap.toFixed(1)}px ` +
      `(worst at fx=${vpWorst.fx.toFixed(0)}, fy=${vpWorst.fy.toFixed(0)})`,
  );
}
const allPass = perViewport.every((p) => p.vpWorst.gap >= 0);
console.log(
  `\n${allPass ? "PROVEN" : "VIOLATED"}: worst gap across all presses = ` +
    `${worst.gap.toFixed(1)}px on ${worst.viewport}`,
);

// ---- SVG proof (small multiples for the iPhone 16 viewport) ------------------

function buildSvg() {
  const viewport = VIEWPORTS.find((v) => v.width === 393);
  const { centers, tileHeight, tileWidth } = columnCenters(viewport.width);
  const width = peekWidthForViewport({
    viewportWidth: viewport.width,
    sideMargin: GUTTER,
    columns: COLUMNS,
    columnGap: COLUMN_GAP,
  });
  const fyMin = TOP_BAND_H + GRID_TOP_PAD + tileHeight / 2;
  const fyMax = viewport.height - SAFE_BOTTOM - tileHeight / 2;
  const rowCount = 6;
  const fys = Array.from({ length: rowCount }, (_, r) =>
    Math.round(fyMin + ((fyMax - fyMin) * r) / (rowCount - 1)),
  );

  const scale = 0.34;
  const pw = viewport.width * scale;
  const ph = viewport.height * scale;
  const padX = 26;
  const padY = 54;
  const cellW = pw + padX;
  const cellH = ph + padY;
  const cols = centers.length;
  const rows = fys.length;
  const marginL = 20;
  const marginT = 70;
  const svgW = marginL * 2 + cols * cellW;
  const svgH = marginT + rows * cellH + 30;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" font-family="ui-sans-serif, system-ui, sans-serif">`,
  );
  parts.push(`<rect width="${svgW}" height="${svgH}" fill="#0e1016"/>`);
  parts.push(
    `<text x="${marginL}" y="30" fill="#e8e6f0" font-size="20" font-weight="700">Deck press-zoom: rules text never overlaps the finger circle</text>`,
  );
  parts.push(
    `<text x="${marginL}" y="52" fill="#9aa0b4" font-size="13">iPhone 16 (393×852). Columns left→right, press height top→bottom. Card width ${width.toFixed(0)}px, finger radius ${FINGER_RADIUS_PX}px. Green = rules text, red = finger, label = gap.</text>`,
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const fx = centers[c];
      const fy = fys[r];
      const { box, rules, gap } = evaluatePress(viewport, fx, fy, width);
      const ox = marginL + c * cellW + padX / 2;
      const oy = marginT + r * cellH + 8;
      const X = (x) => ox + x * scale;
      const Y = (y) => oy + y * scale;
      const ok = gap >= 0;

      parts.push(`<g>`);
      // phone body + safe areas + top band + grid
      parts.push(
        `<rect x="${X(0)}" y="${Y(0)}" width="${pw}" height="${ph}" rx="10" fill="#171a24" stroke="#2b2f3d"/>`,
      );
      parts.push(
        `<rect x="${X(0)}" y="${Y(0)}" width="${pw}" height="${SAFE_TOP * scale}" fill="#0f1119"/>`,
      );
      parts.push(
        `<rect x="${X(0)}" y="${Y(0)}" width="${pw}" height="${TOP_BAND_H * scale}" fill="#20242f"/>`,
      );
      // the pressed tile (finger's card) outline
      parts.push(
        `<rect x="${X(fx - tileWidth / 2)}" y="${Y(fy - tileHeight / 2)}" width="${tileWidth * scale}" height="${tileHeight * scale}" fill="none" stroke="#3a4152" stroke-dasharray="3 2"/>`,
      );
      // enlarged card box
      parts.push(
        `<rect x="${X(box.left)}" y="${Y(box.top)}" width="${box.width * scale}" height="${box.height * scale}" rx="4" fill="#232a3a" stroke="#4c5a6b"/>`,
      );
      // rules-text band (green)
      parts.push(
        `<rect x="${X(rules.left)}" y="${Y(rules.top)}" width="${rules.width * scale}" height="${rules.height * scale}" fill="${ok ? "#2e7d5b" : "#8a2f2f"}" fill-opacity="0.85" stroke="${ok ? "#57e0a0" : "#ff6b6b"}"/>`,
      );
      // finger circle (red)
      parts.push(
        `<circle cx="${X(fx)}" cy="${Y(fy)}" r="${FINGER_RADIUS_PX * scale}" fill="#e0484822" stroke="#ff6b6b" stroke-width="1.4"/>`,
      );
      parts.push(`<circle cx="${X(fx)}" cy="${Y(fy)}" r="2" fill="#ff6b6b"/>`);
      // gap label
      parts.push(
        `<text x="${ox + pw / 2}" y="${oy + ph + 18}" text-anchor="middle" fill="${ok ? "#7fe0b0" : "#ff8a8a"}" font-size="12" font-weight="600">gap ${gap.toFixed(0)}px</text>`,
      );
      parts.push(`</g>`);
    }
  }
  parts.push(`</svg>`);
  return parts.join("\n");
}

const outArg = process.argv[2];
const here = dirname(fileURLToPath(import.meta.url));
const outPath = outArg
  ? resolve(process.cwd(), outArg)
  : resolve(here, "..", "deck-peek-clearance.svg");
writeFileSync(outPath, buildSvg());
console.log(`\nSVG proof written to ${outPath}`);

if (!allPass) process.exit(1);
