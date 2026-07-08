import { assetUrl } from "../../../runtime/asset-url";
import { GLYPHS } from "../../primitives/glyph";

/**
 * Visual presentation data for the redesigned Dream Atlas screen. The Atlas
 * renders the run graph as circular dreamscape-icon nodes in an ornate frame,
 * with rich hover-preview cards (scene art + resident Dream Guide). The art
 * resolves directly from ids; this module centralises the id -> URL mapping and
 * the fixed Layer-VII boss (Limbo) copy.
 *
 * Assets are produced by `scripts/setup-assets.mjs` and served from `public/`:
 *   - `/dreamscapes/<id>.png`       rectangular scene art (hover-card header)
 *   - `/dreamscape-icons/<id>.png`  circular node icon
 *   - `/dream-guides/<guideId>.png` Dream Guide character render
 *   - `/atlas/Round_frame_main.png` ornate frame for unrevealed nodes
 */

/** Rectangular scene art for a dreamscape, shown in the hover-preview header. */
export function dreamscapeSceneUrl(dreamscapeId: string): string {
  return assetUrl(`/dreamscapes/${dreamscapeId}.png`);
}

/** Circular node icon for a dreamscape, shown inside the atlas node frame. */
export function dreamscapeIconUrl(dreamscapeId: string): string {
  return assetUrl(`/dreamscape-icons/${dreamscapeId}.png`);
}

/** Character render of a Dream Guide, shown standing over the preview seam. */
export function guidePortraitUrl(guideId: string): string {
  return assetUrl(`/dream-guides/${guideId}.png`);
}

/** A dreamsign's icon art (its `imageName`), shown on the badge and sign card. */
export function dreamsignIconUrl(imageName: string): string {
  return assetUrl(`/dreamsigns/${imageName}`);
}

/** Ornate round frame used as the face of an unrevealed atlas node. */
export const ROUND_FRAME_URL = assetUrl("/atlas/Round_frame_main.png");

/**
 * Node diameters (stage pixels) for the atlas layout, in one in-Tango home so
 * both the layout adapter (`src/screens/tango_adapters/atlas-view-model.ts`) and
 * the Tango demos read the same production numbers. The layout profiles live in
 * the adapter, which the Tango boundary may not import, so the sizes live here.
 *
 * Desktop draws smaller nodes across a wide landscape stage; mobile draws them
 * larger so icons and badges stay legible once the narrow portrait viewport
 * scales the whole stage down. The starter and boss read a touch larger than a
 * regular node.
 */
export const ATLAS_NODE_SIZE_DESKTOP = 132;
/** Desktop starter / boss anchor-node diameter (stage pixels). */
export const ATLAS_ANCHOR_NODE_SIZE_DESKTOP = 150;
/** Mobile regular-node diameter (stage pixels). */
export const ATLAS_NODE_SIZE_MOBILE = 200;
/** Mobile starter / boss anchor-node diameter (stage pixels). */
export const ATLAS_ANCHOR_NODE_SIZE_MOBILE = 224;
/**
 * Multiplier applied to the site / dreamsign badge sizes on the mobile atlas, so
 * they stay legible once the narrow portrait viewport scales the whole stage
 * down. Desktop keeps its badges at their node-relative size (an implicit 1).
 */
export const ATLAS_BADGE_SCALE_MOBILE = 1.5;

/**
 * The portrait design canvas the vertical (mobile) atlas stage scales to fit
 * (letterboxed). Homed here in-Tango, alongside the node sizes, so both the
 * layout adapter (`src/screens/tango_adapters/atlas-view-model.ts`) and the
 * Tango atlas mockup read the same production numbers; the adapter may not be
 * imported across the Tango boundary, so the shared numbers live here. The
 * layer axis climbs the height bottom→top (starter at the bottom, boss at the
 * top).
 */
export const ATLAS_STAGE_WIDTH = 1080;
export const ATLAS_STAGE_HEIGHT = 1920;

/** Boxicons class used for the "Card Affiliation" row in the preview card. */
export const AFFILIATION_ROW_ICON_CLASS = GLYPHS.affiliationRow;

/** Font Awesome flag glyph the starting dreamscape shows as its site mark. */
export const STARTER_FLAG_ICON_CLASS = "fa-solid fa-flag";

/**
 * The dreamscape id the atlas always presents the boss node as (Limbo), used to
 * resolve its scene art through {@link artRef.dreamscapeScene}.
 */
export const BOSS_DREAMSCAPE_ID = "limbo";

/**
 * The Layer-VII boss dream. The atlas always presents the boss node as Limbo,
 * guarded by Apollyon, independent of which dreamscape the generator assigned
 * the boss node for its battle. Copy is player-facing flavour for the boss
 * hover card.
 */
export const BOSS_DISPLAY = {
  place: "Limbo",
  name: "Apollyon",
  title: "Apollyon, the Doom of Humanity",
  /** The Dream Guide id resolving Apollyon's character render (`/dream-guides/apollyon.png`). */
  guideId: "apollyon",
  sceneUrl: assetUrl("/dreamscapes/limbo.png"),
  iconUrl: assetUrl("/dreamscape-icons/limbo.png"),
  figureUrl: assetUrl("/dream-guides/apollyon.png"),
  intro:
    "A Dreamcaller of annihilating power — his own deck, dreamsigns, and abilities bend the dream toward ruin.",
} as const;
