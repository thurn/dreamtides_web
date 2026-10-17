// D97 tunables (decision P13 and the overworld visual guide). Logic reads
// these values; it never writes them as literals.

export interface D97OverworldTunables {
  /** Walking speed for keyboard steps and click walking (P13). */
  readonly walkTilesPerSecond: number;
  /** Camera zoom on desktop viewports. Whole numbers only. */
  readonly desktopZoom: number;
  /** Phone zooms, preferred first; the first showing enough tiles wins. */
  readonly phoneZooms: readonly number[];
  /** Fewest tiles a phone camera shows across. */
  readonly phoneMinTilesAcross: number;
}

export const D97_OVERWORLD_TUNABLES: D97OverworldTunables = {
  walkTilesPerSecond: 4,
  desktopZoom: 2,
  phoneZooms: [2, 1],
  phoneMinTilesAcross: 11,
};

/** Challenger tier `t` by act (Appendix B §B3), act 1 first. */
export const D97_ACT_CHALLENGER_TIERS: readonly number[] = [4, 7, 10, 13, 16];

export interface D97CharacterTunables {
  /** Walk-cycle frames per second while moving. */
  readonly walkFramesPerSecond: number;
  /** Idle frames per second while standing. */
  readonly idleFramesPerSecond: number;
  /** Idle characters face the player within this many tiles. */
  readonly faceRangeTiles: number;
  /** Character scale by role (the visual guide). */
  readonly scales: { readonly standard: number; readonly incarnation: number; readonly apollyon: number };
  /** Head-icon badge bob: its height in pixels and its cycle in seconds. */
  readonly badgeBobPixels: number;
  readonly badgeBobSeconds: number;
  /** Opacity of a badge overlapped by one nearer the player. */
  readonly badgeOverlapAlpha: number;
}

export const D97_CHARACTER_TUNABLES: D97CharacterTunables = {
  walkFramesPerSecond: 12,
  idleFramesPerSecond: 2,
  faceRangeTiles: 2,
  scales: { standard: 1, incarnation: 1.25, apollyon: 2 },
  badgeBobPixels: 2,
  badgeBobSeconds: 1.2,
  badgeOverlapAlpha: 0.5,
};
