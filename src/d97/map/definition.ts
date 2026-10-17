// The committed D97 map module format (decision P11). A dream map names its
// source (a Tiled map in the LPC library, pinned by content hash, or a blank
// canvas for maps composed from stamps), an edit recipe of typed operations,
// named regions and landmarks for authoring, and its anchors.
//
// Coordinates are tile coordinates `[x, y]` from the top-left. Each recipe
// operation reads the map as the operations before it left it, so operations
// after a crop use cropped coordinates. Regions, landmarks and anchors use the
// final, compiled coordinates. Rectangles include both corners.

import type {
  D97StampId,
  D97TerrainId,
  DreamAnchorId,
  DreamMapId,
  DreamMapSourceHash,
} from "../../types/identifiers";

export type TilePoint = readonly [x: number, y: number];

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
  | { readonly op: "hideLayer"; readonly layer: string }
  | ({
      readonly op: "abovePlayer";
      readonly layer: string;
    } & Partial<TileRect>)
  | ({ readonly op: "block" } & TileRect)
  | ({ readonly op: "open" } & TileRect);

/** The anchor kinds of Appendix B §B1, plus ambient townsfolk (P20). */
export type DreamAnchorKind =
  | "door"
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

export interface DreamMapDefinition {
  readonly id: DreamMapId;
  readonly source: DreamMapSource;
  readonly walkability?: DreamMapWalkability;
  readonly recipe: readonly DreamMapRecipeOp[];
  readonly regions: readonly DreamMapRegion[];
  readonly landmarks: readonly DreamMapLandmark[];
  readonly anchors: readonly DreamAnchorDefinition[];
}

/** Declare a dream map module. */
export function defineDreamMap(definition: DreamMapDefinition): DreamMapDefinition {
  return definition;
}
