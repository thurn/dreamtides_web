/**
 * Scale of the full reading copy revealed when a face-up hand card is hovered
 * in battle. Adjust this value to tune the desktop hover-card size.
 */
export const BATTLE_HAND_CARD_HOVER_SCALE = 1;

/** Stable shared-layout identity for one physical battle-card instance. */
export function battleCardLayoutId(battleCardId: string): string {
  return `battle-card:${battleCardId}`;
}
