// Camera contract: a fixed desktop zoom; a phone zoom at or above the phone
// minimum that is a whole number of device pixels per map pixel and keeps
// at least the minimum tiles across; a view that follows the focus and
// clamps to the map, a medium map never fitting in common viewports, and
// culling ranges.

import { describe, expect, it } from "vitest";
import type { D97OverworldTunables } from "../../content/d97/tunables";
import { chooseZoom, followCamera, visibleTiles } from "./camera";

const TUNABLES: D97OverworldTunables = {
  walkTilesPerSecond: 4,
  desktopZoom: 2,
  phoneMinZoom: 1.5,
  phoneMinTilesAcross: 7,
  hudClearancePx: 12,
  roomFadeSeconds: 0.3,
};
const MEDIUM = { width: 110, height: 110, tileWidth: 32, tileHeight: 32 };

describe("chooseZoom", () => {
  it("uses the desktop zoom on desktop", () => {
    expect(chooseZoom({ width: 1440, height: 900 }, 32, true, TUNABLES, 2)).toBe(2);
  });

  it("draws each map pixel as whole device pixels at or above the phone minimum", () => {
    expect(chooseZoom({ width: 390, height: 844 }, 32, false, TUNABLES, 2)).toBe(1.5);
    expect(chooseZoom({ width: 390, height: 844 }, 32, false, TUNABLES, 3)).toBeCloseTo(5 / 3);
    for (const ratio of [1, 2, 2.625, 3]) {
      for (const width of [320, 360, 390, 430, 700]) {
        const zoom = chooseZoom({ width, height: 800 }, 32, false, TUNABLES, ratio);
        const devicePixels = zoom * ratio;
        expect(Math.abs(devicePixels - Math.round(devicePixels))).toBeLessThan(1e-9);
        expect(devicePixels).toBeGreaterThanOrEqual(1);
        if (zoom * ratio > 1) expect(width / (32 * zoom)).toBeGreaterThanOrEqual(TUNABLES.phoneMinTilesAcross);
      }
    }
  });

  it("steps down a device pixel at a time to keep the minimum tiles across", () => {
    // 360 px at 3x: 5/3 shows 6.75 tiles, so 4/3 (8.4 tiles) wins.
    expect(chooseZoom({ width: 360, height: 800 }, 32, false, TUNABLES, 3)).toBeCloseTo(4 / 3);
    // Nothing fits: one device pixel per map pixel is the floor.
    expect(chooseZoom({ width: 100, height: 400 }, 32, false, TUNABLES, 2)).toBe(0.5);
  });
});

describe("followCamera", () => {
  const viewport = { width: 1440, height: 900 };

  it("centers on the focus inside the map", () => {
    const view = followCamera({ x: 1760, y: 1760 }, viewport, MEDIUM, 2);
    expect(view.x).toBe(1760 - 1440 / 4);
    expect(view.y).toBe(1760 - 900 / 4);
  });

  it("clamps at the map's edges", () => {
    expect(followCamera({ x: 0, y: 0 }, viewport, MEDIUM, 2)).toMatchObject({ x: 0, y: 0 });
    const far = followCamera({ x: 99999, y: 99999 }, viewport, MEDIUM, 2);
    expect(far.x).toBe(110 * 32 - 720);
    expect(far.y).toBe(110 * 32 - 450);
  });

  it("frames the view above a bottom inset, keeping the map's bottom row above it", () => {
    const inset = { bottom: 100 };
    const centered = followCamera({ x: 1760, y: 1760 }, viewport, MEDIUM, 2, inset);
    expect(centered.y).toBe(1760 - (900 - 100) / 4);
    const bottom = followCamera({ x: 1760, y: 110 * 32 - 16 }, viewport, MEDIUM, 2, inset);
    // The map's bottom edge sits exactly at the inset's top edge on screen.
    expect((110 * 32 - bottom.y) * 2).toBe(900 - 100);
    // Without the inset it would sit at the viewport's bottom, under the HUD.
    expect((110 * 32 - followCamera({ x: 1760, y: 110 * 32 - 16 }, viewport, MEDIUM, 2).y) * 2).toBe(900);
    expect(followCamera({ x: 0, y: 0 }, viewport, MEDIUM, 2, inset).y).toBe(0);
  });

  it("centers a map smaller than the view", () => {
    const small = { width: 10, height: 10, tileWidth: 32, tileHeight: 32 };
    const view = followCamera({ x: 0, y: 0 }, viewport, small, 2);
    expect(view.x).toBe((320 - 720) / 2);
  });

  it("rounds the origin to whole screen pixels", () => {
    const view = followCamera({ x: 1000.3, y: 1000.7 }, viewport, MEDIUM, 2);
    expect((view.x * 2) % 1).toBe(0);
    expect((view.y * 2) % 1).toBe(0);
  });

  it("never shows a whole medium map in common viewports", () => {
    for (const [width, height, desktop] of [
      [1280, 720, true],
      [1920, 1080, true],
      [2560, 1440, true],
      [390, 844, false],
      [768, 1024, false],
    ] as const) {
      const zoom = chooseZoom({ width, height }, 32, desktop, TUNABLES, 2);
      const tilesAcross = width / (32 * zoom);
      const tilesDown = height / (32 * zoom);
      expect(tilesAcross < MEDIUM.width || tilesDown < MEDIUM.height).toBe(true);
      expect(tilesAcross).toBeLessThan(MEDIUM.width);
    }
  });
});

describe("visibleTiles", () => {
  it("covers the view plus the margin, clamped to the map", () => {
    const view = { x: 320, y: 320, zoom: 2 };
    expect(visibleTiles(view, { width: 640, height: 320 }, MEDIUM, 1)).toEqual({ x0: 9, y0: 9, x1: 21, y1: 16 });
    expect(visibleTiles({ x: 0, y: 0, zoom: 2 }, { width: 640, height: 320 }, MEDIUM, 2)).toMatchObject({ x0: 0, y0: 0 });
  });
});
