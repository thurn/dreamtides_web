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

/** An instance's creation number: instances are numbered in the order they were created for the battle. */
export function instanceNumber(id: InstanceId): number {
  return Number(id.slice(1));
}

export type { CardId } from "../../types/card-identity";
import type { DreamwellCardId } from "../../types/identifiers";
export type { AvatarId, DreamsignId, DreamwellCardId } from "../../types/identifiers";

/**
 * A side's avatar or one of its dreamsigns. Emblems are not characters and
 * not card instances (P4): they have no position, spark, or zone.
 */
export type EmblemRef =
  | { readonly kind: "avatar"; readonly side: Side }
  | { readonly kind: "dreamsign"; readonly side: Side; readonly index: number };

/** What an ability belongs to: a card instance or an emblem. */
export interface DreamwellSource {
  readonly kind: "dreamwell";
  readonly side: Side;
  readonly id: DreamwellCardId;
}

export type AbilitySource = InstanceId | EmblemRef | DreamwellSource;

/** A stable key for an ability source: `i12`, `avatar:player`, `dreamsign:enemy:0`. */
export type SourceKey = InstanceId | `avatar:${Side}` | `dreamsign:${Side}:${number}` | `dreamwell:${Side}:${DreamwellCardId}`;

export function sourceKey(source: AbilitySource): SourceKey {
  if (typeof source === "string") return source;
  if (source.kind === "dreamwell") return `dreamwell:${source.side}:${source.id}`;
  return source.kind === "avatar" ? `avatar:${source.side}` : `dreamsign:${source.side}:${source.index}`;
}

/** Names one ability of one source: `<source key>#<ability index>`, with an optional `@<zone timestamp>` for static play permissions. */
export type OncePerTurnKey = `${SourceKey}#${number}` | `${SourceKey}#${number}@${number}`;

/** Reads an ability record's source, index, and optional physical zone entry. */
export function oncePerTurnParts(key: OncePerTurnKey): { source: SourceKey; ability: number; enteredZoneAt: number | null } {
  const separator = key.indexOf("#");
  const entry = key.indexOf("@", separator);
  return {
    // eslint-disable-next-line dreamtides/no-raw-string-identity -- decode the SourceKey already carried by the typed OncePerTurnKey
    source: key.slice(0, separator) as SourceKey,
    ability: Number(key.slice(separator + 1, entry === -1 ? undefined : entry)),
    enteredZoneAt: entry === -1 ? null : Number(key.slice(entry + 1)),
  };
}

/** The instance an ability source names, or `null` for an emblem. */
export function sourceInstance(source: AbilitySource): InstanceId | null {
  return typeof source === "string" ? source : null;
}

/** An effect registered on the battle state, such as one a player may pay to end (C7). */
export type EffectId = `e${number}`;

/** A figment type in the figment catalog (rules § Figments), by its UUID. */
export type FigmentId = string & { readonly __brand: "FigmentId" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Validates a figment catalog UUID. */
export function parseFigmentId(text: string): FigmentId {
  if (!UUID.test(text)) throw new Error(`Invalid figment id ${text}`);
  // eslint-disable-next-line dreamtides/no-raw-string-identity -- private minting boundary; the UUID shape is validated above
  return text as FigmentId;
}

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
