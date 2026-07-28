/** Stable shared-layout identity for one physical battle-card instance. */
export function battleCardLayoutId(battleCardId: string): string {
  return `battle-card:${battleCardId}`;
}
