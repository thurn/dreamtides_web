// D97 tunables (decision P13 and the overworld visual guide). Logic reads
// these values; it never writes them as literals.

export interface D97OverworldTunables {
  /** Walking speed for keyboard steps and click walking (P13). */
  readonly walkTilesPerSecond: number;
  /** Camera zoom on desktop viewports. Whole numbers only. */
  readonly desktopZoom: number;
  /**
   * The smallest CSS zoom a phone camera aims for. The camera rounds it up to
   * a whole number of device pixels per map pixel, so the art stays crisp.
   */
  readonly phoneMinZoom: number;
  /** Fewest tiles a phone camera shows across; the zoom steps down to keep them. */
  readonly phoneMinTilesAcross: number;
  /** Screen pixels the camera keeps between the HUD control bar and the world it frames. */
  readonly hudClearancePx: number;
  /**
   * Seconds each half of the plain fade between a dream's map and one of its
   * rooms takes (decision P19): out of the map left, then into the map entered.
   */
  readonly roomFadeSeconds: number;
}

export const D97_OVERWORLD_TUNABLES: D97OverworldTunables = {
  walkTilesPerSecond: 4,
  desktopZoom: 2,
  // 1.5× draws a standing character about 48 CSS pixels tall on a phone,
  // over the 44-pixel touch minimum; 1× drew it about 32.
  phoneMinZoom: 1.5,
  phoneMinTilesAcross: 7,
  hudClearancePx: 12,
  // About as long as the dream veil's fade (the overworld visual guide).
  roomFadeSeconds: 0.3,
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
  /** Seconds a badge takes to fade fully in or out (over the player's body, or from an overlap). */
  readonly badgeFadeSeconds: number;
}

export const D97_CHARACTER_TUNABLES: D97CharacterTunables = {
  walkFramesPerSecond: 12,
  idleFramesPerSecond: 2,
  faceRangeTiles: 2,
  scales: { standard: 1, incarnation: 1.25, apollyon: 2 },
  badgeBobPixels: 2,
  badgeBobSeconds: 1.2,
  badgeOverlapAlpha: 0.5,
  badgeFadeSeconds: 0.15,
};
