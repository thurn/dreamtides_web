// The overworld camera: whole-number zoom chosen per viewport, a view that
// follows the player and clamps to the map, and the tile range on screen for
// culling. Pure; all lengths are CSS pixels unless named in tiles.

import type { D97OverworldTunables } from "../../content/d97/tunables";

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface MapMetrics {
  /** In tiles. */
  readonly width: number;
  readonly height: number;
  /** Tile size in map pixels. */
  readonly tileWidth: number;
  readonly tileHeight: number;
}

/**
 * The camera zoom: the desktop zoom on a desktop viewport; on a phone, the
 * first preferred zoom that keeps at least the minimum tiles across, else the
 * smallest.
 */
export function chooseZoom(
  viewport: Viewport,
  tileWidth: number,
  desktop: boolean,
  tunables: D97OverworldTunables,
): number {
  if (desktop) return tunables.desktopZoom;
  const fitting = tunables.phoneZooms.find(
    (zoom) => viewport.width / (tileWidth * zoom) >= tunables.phoneMinTilesAcross,
  );
  return fitting ?? Math.min(...tunables.phoneZooms);
}

export interface CameraView {
  /** World pixel at the viewport's top-left. */
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/**
 * Screen pixels at the viewport's bottom edge covered by HUD controls. The
 * camera frames the world in the viewport above them, so the player stays
 * visible above the controls even at the map's bottom edge; the world still
 * draws under them.
 */
export interface CameraInsets {
  readonly bottom: number;
}

/**
 * Center the camera on `focus` (world pixels) within the viewport above
 * `insets.bottom`, clamped so that framed view stays on the map; on an axis
 * where the map is smaller than the framed view it centers the map. The
 * origin rounds to whole screen pixels.
 */
export function followCamera(
  focus: { readonly x: number; readonly y: number },
  viewport: Viewport,
  map: MapMetrics,
  zoom: number,
  insets: CameraInsets = { bottom: 0 },
): CameraView {
  const axis = (center: number, viewSize: number, mapSize: number) => {
    const span = viewSize / zoom;
    const origin =
      mapSize <= span
        ? (mapSize - span) / 2
        : Math.min(Math.max(center - span / 2, 0), mapSize - span);
    return Math.round(origin * zoom) / zoom;
  };
  return {
    x: axis(focus.x, viewport.width, map.width * map.tileWidth),
    y: axis(focus.y, Math.max(viewport.height - Math.max(insets.bottom, 0), 0), map.height * map.tileHeight),
    zoom,
  };
}

export interface TileRange {
  readonly x0: number;
  readonly y0: number;
  /** Inclusive. */
  readonly x1: number;
  readonly y1: number;
}

/** The tiles the view shows, widened by `margin` tiles and clamped to the map. */
export function visibleTiles(
  view: CameraView,
  viewport: Viewport,
  map: MapMetrics,
  margin: number,
): TileRange {
  const x0 = Math.floor(view.x / map.tileWidth) - margin;
  const y0 = Math.floor(view.y / map.tileHeight) - margin;
  const x1 = Math.ceil((view.x + viewport.width / view.zoom) / map.tileWidth) + margin;
  const y1 = Math.ceil((view.y + viewport.height / view.zoom) / map.tileHeight) + margin;
  return {
    x0: Math.max(0, x0),
    y0: Math.max(0, y0),
    x1: Math.min(map.width - 1, x1),
    y1: Math.min(map.height - 1, y1),
  };
}
