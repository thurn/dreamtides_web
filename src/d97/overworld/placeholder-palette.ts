// Flat placeholder colors for the overworld when art is missing (the visual
// guide's asset pipeline): ground by walkability, and capsule characters and
// markers by anchor kind. Canvas colors, not Cumulus tokens.

import type { DreamAnchorKind } from "../map/definition";

export const PLACEHOLDER_GROUND = {
  walkable: 0x5d8a4a,
  walkableAlternate: 0x66934f,
  blocked: 0x2f3b45,
} as const;

export const PLACEHOLDER_PLAYER = { body: 0xf2c94c, ring: 0xffe58a } as const;

export const PLACEHOLDER_ANCHORS: Readonly<Record<DreamAnchorKind, number>> = {
  door: 0x9b6bff,
  waypoint: 0x5ad1e6,
  shop: 0xf29e4c,
  guardian: 0xd64545,
  challenger: 0xe0705a,
  friendly: 0x6fcf97,
  chest: 0xc9a227,
  object: 0xf2f2f2,
  townsfolk: 0xb8c4cc,
};

/** The outline drawn around every placeholder shape. */
export const PLACEHOLDER_OUTLINE = 0x15191d;
