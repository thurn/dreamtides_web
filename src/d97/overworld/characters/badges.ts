// Head-icon badges (the visual guide): a speech bubble over a character's
// head whose color and icon sort them at a glance. Drawn with Pixi Graphics
// at 19×22 pixels at 1×. When two badges overlap, the one nearer the player
// draws on top and the other fades.

import { Graphics } from "pixi.js";

export type BadgeKind =
  | "challenger"
  | "boss"
  | "prizeDuel"
  | "shop"
  | "amuletMerchant"
  | "amuletChanger"
  | "guide"
  | "enhancedGuide"
  | "questOffer"
  | "questStep"
  | "sage";

/** Badge size at 1×, bubble tail included. */
export const BADGE_WIDTH = 19;
export const BADGE_HEIGHT = 22;

const BADGE_COLORS: Readonly<Record<BadgeKind, number>> = {
  challenger: 0xd64545,
  boss: 0xd9a520,
  prizeDuel: 0x3cc6d9,
  shop: 0x3fae5a,
  amuletMerchant: 0x3fae5a,
  amuletChanger: 0x3fae5a,
  guide: 0x8a5cd6,
  enhancedGuide: 0x8a5cd6,
  questOffer: 0xf2c94c,
  questStep: 0xf2c94c,
  sage: 0x3f7ad9,
};
const ICON = 0xffffff;
const OUTLINE = 0x15191d;
const SPARKLE = 0xffe58a;

/** Draw `kind`'s badge with its top-left at the origin. */
export function drawBadge(graphics: Graphics, kind: BadgeKind): Graphics {
  const w = BADGE_WIDTH;
  const body = 17;
  graphics
    .roundRect(0, 0, w, body, 5)
    .poly([w / 2 - 3, body - 1, w / 2 + 3, body - 1, w / 2, BADGE_HEIGHT])
    .fill(BADGE_COLORS[kind])
    .stroke({ color: OUTLINE, width: 1 });
  const cx = w / 2;
  const cy = body / 2;
  switch (kind) {
    case "challenger":
      graphics.moveTo(cx - 5, cy - 5).lineTo(cx + 5, cy + 5).moveTo(cx + 5, cy - 5).lineTo(cx - 5, cy + 5).stroke({ color: ICON, width: 2 });
      break;
    case "boss":
      graphics.poly([cx - 6, cy + 4, cx - 6, cy - 3, cx - 3, cy, cx, cy - 5, cx + 3, cy, cx + 6, cy - 3, cx + 6, cy + 4]).fill(ICON);
      break;
    case "prizeDuel":
      graphics.poly([cx, cy - 6, cx + 5, cy - 1, cx, cy + 6, cx - 5, cy - 1]).fill(ICON);
      break;
    case "shop":
      graphics.circle(cx, cy + 1, 5).fill(ICON).rect(cx - 2, cy - 6, 4, 3).fill(ICON);
      break;
    case "amuletMerchant":
      graphics.circle(cx, cy + 1, 4).stroke({ color: ICON, width: 2 }).moveTo(cx - 3, cy - 6).lineTo(cx, cy - 3).lineTo(cx + 3, cy - 6).stroke({ color: ICON, width: 1 });
      break;
    case "amuletChanger":
      graphics.moveTo(cx, cy - 6).lineTo(cx, cy + 5).moveTo(cx - 6, cy - 3).lineTo(cx + 6, cy - 3).stroke({ color: ICON, width: 2 }).circle(cx - 5, cy + 2, 2).circle(cx + 5, cy + 2, 2).fill(ICON);
      break;
    case "guide":
    case "enhancedGuide": {
      const points: number[] = [];
      for (let i = 0; i < 10; i += 1) {
        const radius = i % 2 === 0 ? 6 : 2.6;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        points.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      }
      graphics.poly(points).fill(ICON);
      if (kind === "enhancedGuide") {
        graphics.circle(3, 3, 1.5).circle(w - 3, 4, 1.5).circle(w - 4, body - 3, 1.2).fill(SPARKLE);
      }
      break;
    }
    case "questOffer":
      graphics.rect(cx - 1.5, cy - 6, 3, 8).rect(cx - 1.5, cy + 4, 3, 2.5).fill(OUTLINE);
      break;
    case "questStep":
      graphics
        .moveTo(cx - 3.5, cy - 3)
        .arc(cx, cy - 3, 3.5, Math.PI, 0)
        .lineTo(cx, cy + 1.5)
        .stroke({ color: OUTLINE, width: 2.2 })
        .rect(cx - 1.2, cy + 3.5, 2.4, 2.5)
        .fill(OUTLINE);
      break;
    case "sage":
      graphics.ellipse(cx, cy, 6.5, 4).fill(ICON).circle(cx, cy, 2.2).fill(OUTLINE);
      break;
  }
  return graphics;
}

export interface BadgePlacement {
  /** World pixel of the badge's top-left. */
  readonly x: number;
  readonly y: number;
  /** Distance to the player, nearer first on top. */
  readonly distance: number;
}

export interface BadgeOrder {
  /** Draw order: higher draws later (on top). */
  readonly zIndex: number;
  /** Faded when a nearer badge overlaps it. */
  readonly faded: boolean;
}

/** Stack and fade badges: nearer the player on top; overlapped ones fade. */
export function orderBadges(
  badges: readonly BadgePlacement[],
  width: number,
  height: number,
): BadgeOrder[] {
  const byNearness = badges
    .map((badge, index) => ({ badge, index }))
    .sort((a, b) => a.badge.distance - b.badge.distance || a.index - b.index);
  const out = new Array<BadgeOrder>(badges.length);
  byNearness.forEach(({ badge, index }, rank) => {
    const faded = byNearness.slice(0, rank).some(
      ({ badge: nearer }) =>
        Math.abs(nearer.x - badge.x) < width && Math.abs(nearer.y - badge.y) < height,
    );
    out[index] = { zIndex: badges.length - rank, faded };
  });
  return out;
}
