// Typed media-treatment values for the strict Tango API.
//
// The design system owns appearance, so the CSS knobs a media card exposes —
// the filter over an image, the wash painted on it, how it is cropped, and the
// warning pill after a title — are named, enumerated values rather than raw CSS
// strings. Each type below is a small union; the string it resolves to lives in
// one table here, so a treatment reads the same wherever it is used.

import { token } from "./tokens";

/* ── MediaFilter ─────────────────────────────────────────────────────────── */

/**
 * A named CSS `filter` for a piece of media. `dreamsign-portrait` is the soft
 * drop-shadow + violet bloom that grounds a transparent dreamsign portrait;
 * its `-bane` variant adds the desaturation a bane sign reads with. The `*-glow`
 * entries are emitted-light blooms for a resource-mark glyph.
 */
export type MediaFilter =
  | "dreamsign-portrait"
  | "dreamsign-portrait-bane"
  | "spark-glow"
  | "energy-glow";

const DREAMSIGN_PORTRAIT_SHADOW =
  "drop-shadow(0 3px 6px rgba(0,0,0,0.55)) drop-shadow(0 0 14px rgba(147,51,234,0.30))";

const MEDIA_FILTERS: Record<MediaFilter, string> = {
  "dreamsign-portrait": DREAMSIGN_PORTRAIT_SHADOW,
  "dreamsign-portrait-bane": `${DREAMSIGN_PORTRAIT_SHADOW} grayscale(0.5)`,
  "spark-glow": "drop-shadow(0 0 6px rgba(243,195,63,0.65))",
  "energy-glow": "drop-shadow(0 0 6px rgba(14,165,233,0.60))",
};

/** Resolve a {@link MediaFilter} to its CSS `filter` string. */
export function resolveMediaFilter(filter: MediaFilter): string {
  return MEDIA_FILTERS[filter];
}

/* ── Wash ────────────────────────────────────────────────────────────────── */

/**
 * A named CSS background painted over a media block to seat it in the card's
 * material. `journey` is the deep radial dream wash; `dusk` a soft top-down
 * darkening for legibility under overlaid text.
 */
export type Wash = "journey" | "dusk";

const WASHES: Record<Wash, string> = {
  journey: token("--dt-wash-journey"),
  dusk: "linear-gradient(to bottom, rgba(5,3,10,0) 0%, rgba(5,3,10,0.55) 100%)",
};

/** Resolve a {@link Wash} to its CSS background string. */
export function resolveWash(wash: Wash): string {
  return WASHES[wash];
}

/* ── ImageCrop ───────────────────────────────────────────────────────────── */

/**
 * How a media image is cropped within its frame, as a named `object-position`.
 * `top` biases toward the upper part of the art (faces / headers); `center`
 * centers it.
 */
export type ImageCrop = "top" | "center";

const IMAGE_CROP_POSITIONS: Record<ImageCrop, string> = {
  top: "50% 6%",
  center: "50% 50%",
};

/** Resolve an {@link ImageCrop} to its CSS `object-position` string. */
export function resolveImageCrop(crop: ImageCrop): string {
  return IMAGE_CROP_POSITIONS[crop];
}

/* ── TitleBadge ──────────────────────────────────────────────────────────── */

/**
 * A named warning-toned pill shown right after a card title. `bane` marks a
 * dreamsign whose ability is a drawback. The label rendered for each badge
 * lives in one table so the wording stays consistent.
 */
export type TitleBadge = "bane";

const TITLE_BADGE_LABELS: Record<TitleBadge, string> = {
  bane: "Bane",
};

/** Resolve a {@link TitleBadge} to the short label shown in its pill. */
export function resolveTitleBadge(badge: TitleBadge): string {
  return TITLE_BADGE_LABELS[badge];
}
