import { assetUrl } from "../../../runtime/asset-url";
import type { DreamscapeId } from "../../../types/identifiers";
import type { GuideId } from "../../../types/identifiers";

/**
 * Visual presentation data for the redesigned Dream Atlas screen. The Atlas
 * renders the run graph as circular dreamscape-icon nodes in an ornate frame,
 * with rich hover-preview cards (scene art + resident Dream Guide). The art
 * resolves directly from ids; this module centralises the generic id-to-URL
 * mapping and renderer geometry. Authored boss and frame data arrives through
 * the Atlas view model.
 *
 * Assets are produced by `scripts/setup-assets.mjs` and served from `public/`:
 *   - `/dreamscapes/<id>.png`       rectangular scene art (hover-card header)
 *   - `/dreamscape-icons/<id>.png`  circular node icon
 *   - `/dream-guides/<guideId>.png` Dream Guide character render
 *   - `/atlas/<asset-key>`           Atlas-specific authored assets
 */

/** Rectangular scene art for a dreamscape, shown in the hover-preview header. */
export function dreamscapeSceneUrl(dreamscapeId: DreamscapeId): string {
  return assetUrl(`/dreamscapes/${dreamscapeId}.png`);
}

/** Circular node icon for a dreamscape, shown inside the atlas node frame. */
export function dreamscapeIconUrl(dreamscapeId: DreamscapeId): string {
  return assetUrl(`/dreamscape-icons/${dreamscapeId}.png`);
}

/** Character render of a Dream Guide, shown standing over the preview seam. */
export function guidePortraitUrl(guideId: GuideId): string {
  return assetUrl(`/dream-guides/${guideId}.png`);
}

/** A dreamsign's icon art (its `imageName`), shown on the badge and sign card. */
export function dreamsignIconUrl(imageName: string): string {
  return assetUrl(`/dreamsigns/${imageName}`);
}

/**
 * Node diameters (stage pixels) for the atlas layout, in one in-Cumulus home so
 * both the layout adapter (`src/screens/cumulus_adapters/atlas-view-model.ts`) and
 * the Cumulus demos read the same production numbers. The layout profiles live in
 * the adapter, which the Cumulus boundary may not import, so the sizes live here.
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
 * The portrait design canvas the vertical (mobile) atlas stage scales to fit
 * (letterboxed). Homed here in-Cumulus, alongside the node sizes, so both the
 * layout adapter (`src/screens/cumulus_adapters/atlas-view-model.ts`) and the
 * Cumulus atlas mockup read the same production numbers; the adapter may not be
 * imported across the Cumulus boundary, so the shared numbers live here. The
 * layer axis climbs the height bottom→top (starter at the bottom, boss at the
 * top).
 */
export const ATLAS_STAGE_WIDTH = 1080;
export const ATLAS_STAGE_HEIGHT = 1920;
