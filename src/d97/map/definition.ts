// The committed D97 map module format (decision P11). A dream map names its
// source (a Tiled map in the LPC library, pinned by content hash, or a blank
// canvas for maps composed from stamps), an edit recipe of typed operations,
// named regions and landmarks for authoring, its anchors, and any
// deliberately narrow crossings exempt from the path-width rules (P33).
//
// Coordinates are tile coordinates `[x, y]` from the top-left. Each recipe
// operation reads the map as the operations before it left it, so operations
// after a crop use cropped coordinates. Regions, landmarks, anchors and
// narrow crossings use the final, compiled coordinates. Rectangles include
// both corners.

import type {
  D97StampId,
  D97TerrainId,
  DreamAnchorId,
  DreamMapId,
  DreamMapSourceHash,
} from "../../types/identifiers";

export type TilePoint = readonly [x: number, y: number];

/** A season of the LPC Revised sheets. */
export type D97Season = "spring" | "summer" | "autumn" | "winter";

/** A rectangle of tiles, both corners included. */
export interface TileRect {
  readonly from: TilePoint;
  readonly to: TilePoint;
}

/** Where a map starts before its recipe runs. */
export type DreamMapSource =
  | {
      readonly kind: "tiled";
      /** TMX or TMJ path inside the LPC library. */
      readonly path: string;
      /** SHA-256 of the source file's text, pinning the recipe to it. */
      readonly sha256: DreamMapSourceHash;
    }
  | {
      readonly kind: "blank";
      readonly width: number;
      readonly height: number;
      readonly tileWidth: number;
      readonly tileHeight: number;
    };

/** How the source's tiles decide walkability before recipe overrides. */
export interface DreamMapWalkability {
  /**
   * Tile layers whose non-empty cells block movement. They are never drawn.
   * Defaults to every layer named "collision" (any case).
   */
  readonly blockingLayers?: readonly string[];
  /**
   * Object layers whose rectangle shapes block the cells they overlap.
   * Defaults to every object layer named "collision" (any case).
   */
  readonly blockingObjectLayers?: readonly string[];
  /**
   * Boolean tile properties that make a tile block movement when true.
   * Defaults to `collides`, `collision` and `blocked`.
   */
  readonly blockingTileProperties?: readonly string[];
  /** Whether tiles with Tiled collision shapes block. Defaults to true. */
  readonly collisionShapesBlock?: boolean;
}

/** The cells a terrain paint covers. */
export type TerrainShape =
  | ({ readonly kind: "rect" } & TileRect)
  /** The cells whose centers lie in the ellipse inscribed in the rectangle: ponds, clearings. */
  | ({ readonly kind: "ellipse" } & TileRect)
  | {
      readonly kind: "path";
      /** Polyline corners; consecutive points must share a row or column. */
      readonly points: readonly TilePoint[];
      /** Cells across the path, centered on the line. Defaults to 1. */
      readonly width?: number;
    }
  | { readonly kind: "cells"; readonly cells: readonly TilePoint[] };

/** One typed edit of the map. */
export type DreamMapRecipeOp =
  | ({ readonly op: "crop" } & TileRect)
  | ({
      readonly op: "erase";
      /** Tile layers to clear; defaults to every tile layer. */
      readonly layers?: readonly string[];
    } & TileRect)
  | { readonly op: "stamp"; readonly stamp: D97StampId; readonly at: TilePoint }
  | {
      readonly op: "paintTerrain";
      readonly terrain: D97TerrainId;
      /** The tile layer painted; created on top when the map lacks it. */
      readonly layer: string;
      readonly shape: TerrainShape;
    }
  | {
      /**
       * Paint (or with `erase`, remove) an auto-tiled terrain over a shape,
       * re-tiling edges and corners against the terrain already on its layer.
       */
      readonly op: "brush";
      readonly terrain: D97TerrainId;
      readonly shape: TerrainShape;
      /** The tile layer painted; defaults to the terrain's catalog layer. */
      readonly layer?: string;
      /** Remove the terrain from the shape instead of painting it. */
      readonly erase?: boolean;
    }
  | ({
      /**
       * Redraw LPC Revised seasonal sheets (terrain, cliffs, plants, trees,
       * wildflowers) in another season, over the area or the whole map.
       */
      readonly op: "reseason";
      readonly season: D97Season;
    } & Partial<TileRect>)
  | { readonly op: "hideLayer"; readonly layer: string }
  | ({
      readonly op: "abovePlayer";
      readonly layer: string;
    } & Partial<TileRect>)
  | ({ readonly op: "block" } & TileRect)
  | ({ readonly op: "open" } & TileRect);

/**
 * The anchor kinds of Appendix B §B1, plus ambient townsfolk (P20) and the
 * building doors that join a dream's map to its rooms (P19).
 */
export type DreamAnchorKind =
  | "door"
  | "buildingDoor"
  | "waypoint"
  | "shop"
  | "guardian"
  | "challenger"
  | "friendly"
  | "chest"
  | "object"
  | "townsfolk";

/** An anchor's tile, given directly or by a landmark's name. */
export type DreamAnchorPlacement = TilePoint | { readonly landmark: string };

interface AnchorBase {
  readonly id: DreamAnchorId;
  readonly at: DreamAnchorPlacement;
}

export type DreamAnchorDefinition =
  | (AnchorBase & {
      readonly kind: "door";
      /** Where a player stepping through this door from elsewhere arrives. */
      readonly entry: DreamAnchorPlacement;
    })
  | (AnchorBase & {
      /**
       * An ordinary building door (P19), with no veil: on a dream's map it
       * leads into one of the dream's rooms, and in a room it leads back out.
       * The dream module pairs the two (`rooms` in
       * src/content/d97/dreams/schema.ts).
       */
      readonly kind: "buildingDoor";
      /** Where a player coming through the paired door arrives. */
      readonly entry: DreamAnchorPlacement;
    })
  | (AnchorBase & {
      readonly kind: "guardian";
      /** The door anchor this guardian blocks (Appendix B §B5). */
      readonly blocksDoor: DreamAnchorId;
    })
  | (AnchorBase & {
      readonly kind: "chest";
      /** The guardian anchor the chest sits behind, if any. */
      readonly behindGuardian?: DreamAnchorId;
    })
  | (AnchorBase & {
      readonly kind: "friendly";
      /** Friendly anchors sharing a tag gather like a small town. */
      readonly cluster?: string;
    })
  | (AnchorBase & {
      readonly kind:
        | "waypoint"
        | "shop"
        | "challenger"
        | "object"
        | "townsfolk";
    });

/** A named area for authoring, briefs and the inspector. */
export interface DreamMapRegion extends TileRect {
  readonly name: string;
  readonly note?: string;
}

/** A named tile for authoring and anchor placement. */
export interface DreamMapLandmark {
  readonly name: string;
  readonly at: TilePoint;
  readonly note?: string;
}

/**
 * A deliberately narrow crossing (decision P33), such as a plank bridge, in
 * compiled coordinates. Its cells are exempt from the path-width rules, and
 * the validator checks it is never the only route: every anchor it serves
 * must still be reached on wide paths with its cells blocked.
 */
export interface DreamMapNarrowCrossing {
  readonly name: string;
  readonly cells: readonly TilePoint[];
  readonly note?: string;
}

export interface DreamMapDefinition {
  readonly id: DreamMapId;
  readonly source: DreamMapSource;
  readonly walkability?: DreamMapWalkability;
  readonly recipe: readonly DreamMapRecipeOp[];
  readonly regions: readonly DreamMapRegion[];
  readonly landmarks: readonly DreamMapLandmark[];
  readonly anchors: readonly DreamAnchorDefinition[];
  /** Deliberately narrow crossings, exempt from the path-width rules. */
  readonly narrowCrossings?: readonly DreamMapNarrowCrossing[];
}

/** Declare a dream map module. */
export function defineDreamMap(definition: DreamMapDefinition): DreamMapDefinition {
  return definition;
}
