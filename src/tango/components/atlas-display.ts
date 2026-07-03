import { assetUrl } from "../../runtime/asset-url";

/**
 * Visual presentation data for the redesigned Dream Atlas screen. The Atlas
 * renders the run graph as circular dreamscape-icon nodes in an ornate frame,
 * with rich hover-preview cards (scene art + resident Dream Guide). The art
 * resolves directly from ids; this module centralises the id -> URL mapping and
 * the fixed Layer-VII final-dream copy.
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

/** Boxicons class used for the "Card Affiliation" row in the preview card. */
export const AFFILIATION_ROW_ICON_CLASS = "bxf bx-rectangle-vertical";

/** Font Awesome flag glyph the starting dreamscape shows as its site mark. */
export const STARTER_FLAG_ICON_CLASS = "fa-solid fa-flag";

/**
 * The Layer-VII final dream. The atlas always presents the boss node as Limbo,
 * guarded by Apollyon, independent of which dreamscape the generator assigned
 * the boss node for its battle. Copy is player-facing flavour for the boss
 * hover card.
 */
export const BOSS_DISPLAY = {
  place: "Limbo",
  name: "Apollyon",
  title: "Apollyon, the Doom of Humanity",
  sceneUrl: assetUrl("/dreamscapes/limbo.png"),
  iconUrl: assetUrl("/dreamscape-icons/limbo.png"),
  figureUrl: assetUrl("/dream-guides/apollyon.png"),
  intro:
    "A Dreamcaller of annihilating power — his own deck, dreamsigns, and abilities bend the dream toward ruin.",
} as const;
