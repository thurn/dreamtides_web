import type { BattleCardInstance, BattleSide } from "../types";

/** Builds hidden-zone knowledge: the controller knows the card, the other side does not. */
export function createControllerVisibility(
  controller: BattleSide,
): Record<BattleSide, boolean> {
  return {
    player: controller === "player",
    enemy: controller === "enemy",
  };
}

/** Reads new state and coerces the former player-only field at replay boundaries. */
export function cardIsRevealedTo(
  instance: BattleCardInstance,
  viewer: BattleSide,
): boolean {
  const explicit = instance.revealedTo?.[viewer];
  if (typeof explicit === "boolean") return explicit;
  if (viewer === "player" && typeof instance.isRevealedToPlayer === "boolean") {
    return instance.isRevealedToPlayer;
  }
  return instance.controller === viewer;
}

/** Mutates a cloned instance into the current two-viewer representation. */
export function normalizeCardVisibility(
  instance: BattleCardInstance,
): void {
  instance.revealedTo = {
    player: cardIsRevealedTo(instance, "player"),
    enemy: cardIsRevealedTo(instance, "enemy"),
  };
  delete instance.isRevealedToPlayer;
}

export function setCardRevealedTo(
  instance: BattleCardInstance,
  viewer: BattleSide,
  revealed: boolean,
): boolean {
  normalizeCardVisibility(instance);
  if (instance.revealedTo?.[viewer] === revealed) return false;
  instance.revealedTo = {
    player: viewer === "player" ? revealed : instance.revealedTo?.player ?? false,
    enemy: viewer === "enemy" ? revealed : instance.revealedTo?.enemy ?? false,
  };
  return true;
}

export function revealCardPublicly(instance: BattleCardInstance): void {
  instance.revealedTo = { player: true, enemy: true };
  delete instance.isRevealedToPlayer;
}
