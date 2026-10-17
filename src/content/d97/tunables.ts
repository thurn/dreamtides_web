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
