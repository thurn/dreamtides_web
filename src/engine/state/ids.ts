/**
 * Identities and small value types shared by every engine module.
 *
 * Instance IDs are minted per battle (`i1`, `i2`, …) and stay stable across
 * zone changes. Card and Dreamwell identities are catalog UUIDs; the engine
 * never reads names.
 */

export type Side = "player" | "enemy";

export const SIDES: readonly Side[] = ["player", "enemy"];

export function opponent(side: Side): Side {
  return side === "player" ? "enemy" : "player";
}

/** A card instance in one battle; stable across zone changes. */
export type InstanceId = `i${number}`;

export type { CardId } from "../../types/card-identity";
export type { DreamwellCardId } from "../../types/identifiers";

/** A battle's seed, derived by the host from the game seed and battle index. */
export type BattleSeed = string & { readonly __brand: "BattleSeed" };

export function battleSeed(text: string): BattleSeed {
  return text as BattleSeed;
}

/** The eight phases of a turn, in order (rules § Turn Structure). */
export type Phase =
  | "dreamwell"
  | "draw"
  | "dawn"
  | "day"
  | "dusk"
  | "night"
  | "challenge"
  | "ending";

export const PHASES: readonly Phase[] = [
  "dreamwell",
  "draw",
  "dawn",
  "day",
  "dusk",
  "night",
  "challenge",
  "ending",
];

export type Rank = "front" | "back";

/** A play-area position: `F0`–`F8` or `B0`–`B9`. */
export interface Slot {
  readonly rank: Rank;
  readonly index: number;
}

export const FRONT_RANK_SIZE = 9;
export const BACK_RANK_SIZE = 10;

export function rankSize(rank: Rank): number {
  return rank === "front" ? FRONT_RANK_SIZE : BACK_RANK_SIZE;
}

/** The zone an instance is in. `stack` holds played cards awaiting resolution. */
export type Zone = "deck" | "hand" | "stack" | "play" | "void" | "banished";
