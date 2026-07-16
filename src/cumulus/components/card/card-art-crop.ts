import type { CSSProperties } from "react";
import type { ArtCrop } from "../../../types/cards";
import {
  ART_EXTENSION_FRACTION,
  ART_REGION_ASPECT_RATIO_VALUE,
} from "./card-aspect";

/** Centered fallback crop used when a card has no authored art setting. */
export const DEFAULT_ART_CROP = { x: 0, y: 0, scale: 1.17 } as const;

/** Bottom fraction of each card-art source occupied by its watermark strip. */
const ART_SOURCE_BOTTOM_CROP = 21 / 280;

function artMaxPanYFrac(renderH: number): number {
  return (renderH - 1) / (2 * renderH);
}

function artPanYLowerFrac(
  renderH: number,
  target: number,
  region: number = 1 - ART_EXTENSION_FRACTION,
): number {
  const imgH = renderH * region;
  const pMin = (target - region / 2) / imgH - 0.5 + ART_SOURCE_BOTTOM_CROP;
  return Math.min(pMin, artMaxPanYFrac(renderH));
}

function artCoverMetrics(
  art: ArtCrop,
  imageAspect: number,
  frameAspect: number,
  target: number,
  region: number = 1 - ART_EXTENSION_FRACTION,
): { renderW: number; renderH: number; panX: number; panY: number } {
  const ratio = imageAspect / frameAspect;
  const coverW = ratio >= 1 ? ratio : 1;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const renderW = art.scale * coverW;
  const renderH = art.scale * coverH;
  const panX =
    renderW > 1 ? ((art.x * (renderW - 1)) / (2 * renderW)) * 100 : 0;
  let panY = 0;
  if (renderH > 1) {
    const maxPanYFrac = artMaxPanYFrac(renderH);
    const lowerPanYFrac = artPanYLowerFrac(renderH, target, region);
    panY = Math.max(art.y * maxPanYFrac, lowerPanYFrac) * 100;
  }
  return { renderW, renderH, panX, panY };
}

/**
 * Lowest authored vertical offset that keeps the watermark-clipped source
 * covering down to the requested card-height target.
 */
export function minArtOffsetY(
  imageAspect: number,
  scale: number,
  target: number = 1 - ART_EXTENSION_FRACTION,
): number {
  const ratio = imageAspect / ART_REGION_ASPECT_RATIO_VALUE;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const renderH = scale * coverH;
  if (renderH <= 1) {
    return 0;
  }
  const maxPanYFrac = artMaxPanYFrac(renderH);
  const lowerPanYFrac = artPanYLowerFrac(renderH, target);
  return Math.max(-1, Math.min(1, lowerPanYFrac / maxPanYFrac));
}

/** Smallest zoom that keeps a watermark-clipped source covering its target. */
export function minArtScale(
  imageAspect: number,
  target: number,
  frameAspect: number = ART_REGION_ASPECT_RATIO_VALUE,
  region: number = 1 - ART_EXTENSION_FRACTION,
): number {
  const ratio = imageAspect / frameAspect;
  const coverW = ratio >= 1 ? ratio : 1;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const renderHForTarget = target / (region * (1 - ART_SOURCE_BOTTOM_CROP));
  const renderHMin = Math.max(1, renderHForTarget);
  return Math.max(1 / coverW, renderHMin / coverH);
}

/** Per-axis crop offset that moves the art by a fixed fraction of the card. */
export function artPanStep(
  imageAspect: number,
  scale: number,
  cardFraction: number,
): { x: number; y: number } {
  const ratio = imageAspect / ART_REGION_ASPECT_RATIO_VALUE;
  const coverW = ratio >= 1 ? ratio : 1;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const renderW = scale * coverW;
  const renderH = scale * coverH;
  const x = renderW > 1 ? Math.min(1, (2 * cardFraction) / (renderW - 1)) : 0;
  const y =
    renderH > 1
      ? Math.min(
          1,
          (2 * cardFraction) / ((renderH - 1) * (1 - ART_EXTENSION_FRACTION)),
        )
      : 0;
  return { x, y };
}

/**
 * Resolve a card's authored crop into image-box CSS for any rectangular art
 * viewport. Pan and zoom use the same normalized coordinate system as the card
 * editor, while the source watermark remains clipped below the visible frame.
 */
export function resolveCardArtImageStyle(
  art: ArtCrop,
  imageAspect: number | null,
  target: number,
  frameAspect: number = ART_REGION_ASPECT_RATIO_VALUE,
  region: number = 1 - ART_EXTENSION_FRACTION,
): CSSProperties {
  const clipPath = `inset(0 0 ${(ART_SOURCE_BOTTOM_CROP * 100).toFixed(3)}% 0)`;
  if (imageAspect === null) {
    return {
      position: "absolute",
      inset: 0,
      height: "100%",
      width: "100%",
      objectFit: "cover",
      transform: `scale(${String(art.scale)})`,
      clipPath,
    };
  }

  const safeScale = Math.max(
    art.scale,
    minArtScale(imageAspect, target, frameAspect, region),
  );
  const { renderW, renderH, panX, panY } = artCoverMetrics(
    { x: art.x, y: art.y, scale: safeScale },
    imageAspect,
    frameAspect,
    target,
    region,
  );
  return {
    position: "absolute",
    left: "50%",
    top: `${String((region / 2) * 100)}%`,
    width: `${String(renderW * 100)}%`,
    height: `${String(renderH * region * 100)}%`,
    maxWidth: "none",
    maxHeight: "none",
    objectFit: "cover",
    transform: `translate(-50%, -50%) translate(${String(panX)}%, ${String(panY)}%)`,
    clipPath,
  };
}
