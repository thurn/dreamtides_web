// The persisted D97 save, schema version 4 (decision P5), written out in full.
// Version 3 records the room of the run's last place (decision P19); every
// other field is version 2's.
//
// This module never imports the live run types: the persisted shape is its
// own contract. The converters in ./snapshot.ts tie the live state to it at
// compile time, so a change to the live state that is not also a schema
// change fails type checking; the fix is the next schema module, a migration
// and a golden fixture, never an edit here.
//
// `parseSnapshotV4` validates an untrusted, already-migrated snapshot field by
// field, branded identities included, and returns null for anything that
// does not match. A D97 battle in progress belongs to the build that wrote it
// (P5 restarts it from its recorded setup across builds), so it is checked as
// a D97 battle envelope and otherwise kept as written.

import type { D97BattleFoldState } from "../../rules/battle/fold";
import { cardIdFromUnknown, type CardId } from "../../types/card-identity";
import { buildGitRevisionFromUnknown, type BuildGitRevision } from "../../types/build-identity";
import {
  avatarIdFromUnknown,
  d97DreamIdFromUnknown,
  d97FlagIdFromUnknown,
  d97RoomIdFromUnknown,
  d97ItemIdFromUnknown,
  d97OwnedCopyIdFromUnknown,
  d97QuestIdFromUnknown,
  d97QuestStepIdFromUnknown,
  dreamAnchorIdFromUnknown,
  dreamsignIdFromUnknown,
  intentKeyFromUnknown,
  parseD97CharacterId,
  parseD97RunId,
  parseD97RunSeed,
  type AvatarId,
  type D97CharacterId,
  type D97DreamId,
  type D97FlagId,
  type D97ItemId,
  type D97OwnedCopyId,
  type D97QuestId,
  type D97QuestStepId,
  type D97RoomId,
  type D97RunId,
  type D97RunSeed,
  type DreamAnchorId,
  type DreamsignId,
  type IntentKey,
} from "../../types/identifiers";
import { parseReducerVersion, type ReducerVersion } from "../../types/reducer-version";

// --- The schema ---------------------------------------------------------------

export type D97ScreenV4 = { readonly type: "avatarSelect" } | { readonly type: "overworld" } | { readonly type: "sliceEnd" };

export interface D97PlaceV4 {
  readonly kind: "door" | "waypoint";
  readonly anchorId: DreamAnchorId;
  /** The room the place is in, or null on the dream's own map. */
  readonly roomId: D97RoomId | null;
}

export interface D97EncounterV4 {
  readonly anchorId: DreamAnchorId;
  readonly characterId: D97CharacterId;
  readonly role: "challenger" | "guardian";
  readonly kind: "generic" | "avatar";
  readonly tier: number;
  readonly avatarId: AvatarId;
  readonly abilityActive: boolean;
  readonly deck: readonly CardId[];
  readonly draftPool: readonly CardId[];
  readonly dreamsignIds: readonly DreamsignId[];
  readonly signatureCardIds: readonly CardId[];
  readonly scoreToWin: number;
  readonly playerAnteCopyId: D97OwnedCopyId | null;
  readonly opponentAnteCardId: CardId | null;
  readonly extra: { readonly kind: "essence"; readonly amount: number } | null;
  readonly battles: number;
  readonly beaten: boolean;
}

export interface D97CopyProvenanceV4 {
  readonly channel: "starting" | "bag" | "ante" | "bundle" | "shop";
  readonly battleCount: number;
  readonly price?: number;
}

export interface D97OwnedCopyV4 {
  readonly copyId: D97OwnedCopyId;
  readonly cardId: CardId;
  readonly zone: "deck" | "reserve";
  readonly modifications: readonly never[];
  readonly provenance: D97CopyProvenanceV4;
}

export interface D97CollectionV4 {
  readonly copies: readonly D97OwnedCopyV4[];
  readonly nextCopyOrdinal: number;
}

export interface D97RewardBagsV4 {
  readonly stage: number;
  readonly drawn: Readonly<Partial<Record<AvatarId, Readonly<Partial<Record<CardId, number>>>>>>;
}

export interface D97QuestStateV4 {
  readonly active: { readonly questId: D97QuestId; readonly completedStepIds: readonly D97QuestStepId[] } | null;
  readonly completedQuestIds: readonly D97QuestId[];
  readonly pendingReward: { readonly questId: D97QuestId; readonly cardIds: readonly CardId[] } | null;
  readonly items: readonly D97ItemId[];
}

export interface D97ShopV4 {
  readonly slots: readonly { readonly cardId: CardId; readonly price: number; readonly purchased: boolean }[];
  readonly restockedThisVisit: boolean;
  readonly rolls: number;
}

export interface D97RunV4 {
  readonly runId: D97RunId;
  readonly runSeed: D97RunSeed;
  readonly avatarId: AvatarId;
  readonly dreamId: D97DreamId;
  readonly startedAt: string;
  readonly essence: number;
  readonly battlesFought: number;
  readonly collection: D97CollectionV4;
  readonly bags: D97RewardBagsV4;
  readonly encounters: Readonly<Partial<Record<DreamAnchorId, D97EncounterV4>>>;
  readonly returnAnchorId: DreamAnchorId | null;
  readonly quests: D97QuestStateV4;
  readonly flags: readonly D97FlagId[];
  readonly activeWaypointIds: readonly DreamAnchorId[];
  readonly lastPlace: D97PlaceV4 | null;
  readonly shops: Readonly<Partial<Record<DreamAnchorId, D97ShopV4>>>;
}

export interface D97StateV4 {
  readonly screen: D97ScreenV4;
  readonly run: D97RunV4 | null;
}

export interface D97SaveBuildV4 {
  readonly reducerVersion: ReducerVersion;
  readonly gitRevision: BuildGitRevision;
}

export interface D97SnapshotV4 {
  readonly format: "dreamtides-97-save";
  readonly schemaVersion: 4;
  readonly build: D97SaveBuildV4;
  readonly seq: number;
  readonly intentKeys: readonly (readonly [IntentKey, number])[];
  readonly d97: D97StateV4;
  readonly battle: D97BattleFoldState | null;
}

// --- The parser ---------------------------------------------------------------------

type Json = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Thrown inside the parser for the first field that does not match; never escapes it. */
class Mismatch extends Error {}

function fail(): never {
  throw new Mismatch();
}

function record(value: unknown): Json {
  return isRecord(value) ? value : fail();
}

function int(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fail();
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fail();
}

function bool(value: unknown): boolean {
  return typeof value === "boolean" ? value : fail();
}

function str(value: unknown): string {
  return typeof value === "string" ? value : fail();
}

function oneOf<const T extends string>(value: unknown, options: readonly T[]): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fail();
}

function id<T>(decode: (value: unknown) => T | null): (value: unknown) => T {
  return (value) => decode(value) ?? fail();
}

function parsed<T>(parse: (value: unknown) => T): (value: unknown) => T {
  return (value) => {
    try {
      return parse(value);
    } catch {
      return fail();
    }
  };
}

function list<T>(value: unknown, item: (value: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(item) : fail();
}

function nullable<T>(value: unknown, item: (value: unknown) => T): T | null {
  return value === null ? null : item(value);
}

function byKey<K extends string, T>(value: unknown, key: (value: unknown) => K, item: (value: unknown) => T): Partial<Record<K, T>> {
  const entries = Object.entries(record(value)).map(([name, entry]) => [key(name), item(entry)] as const);
  return Object.fromEntries(entries) as Partial<Record<K, T>>;
}

function byAnchor<T>(value: unknown, item: (value: unknown) => T): Partial<Record<DreamAnchorId, T>> {
  return byKey(value, anchorId, item);
}

const anchorId = id(dreamAnchorIdFromUnknown);
const cardId = id(cardIdFromUnknown);
const avatarId = id(avatarIdFromUnknown);
const copyId = id(d97OwnedCopyIdFromUnknown);
const questId = id(d97QuestIdFromUnknown);

function encounter(value: unknown): D97EncounterV4 {
  const e = record(value);
  const extra = nullable(e.extra, (x) => {
    const v = record(x);
    return { kind: oneOf(v.kind, ["essence"] as const), amount: int(v.amount) };
  });
  return {
    anchorId: anchorId(e.anchorId),
    characterId: parsed(parseD97CharacterId)(e.characterId),
    role: oneOf(e.role, ["challenger", "guardian"] as const),
    kind: oneOf(e.kind, ["generic", "avatar"] as const),
    tier: int(e.tier),
    avatarId: avatarId(e.avatarId),
    abilityActive: bool(e.abilityActive),
    deck: list(e.deck, cardId),
    draftPool: list(e.draftPool, cardId),
    dreamsignIds: list(e.dreamsignIds, id(dreamsignIdFromUnknown)),
    signatureCardIds: list(e.signatureCardIds, cardId),
    scoreToWin: int(e.scoreToWin),
    playerAnteCopyId: nullable(e.playerAnteCopyId, copyId),
    opponentAnteCardId: nullable(e.opponentAnteCardId, cardId),
    extra,
    battles: int(e.battles),
    beaten: bool(e.beaten),
  };
}

function ownedCopy(value: unknown): D97OwnedCopyV4 {
  const c = record(value);
  const p = record(c.provenance);
  const provenance: D97CopyProvenanceV4 = {
    channel: oneOf(p.channel, ["starting", "bag", "ante", "bundle", "shop"] as const),
    battleCount: int(p.battleCount),
    ...(p.price === undefined ? {} : { price: num(p.price) }),
  };
  return {
    copyId: copyId(c.copyId),
    cardId: cardId(c.cardId),
    zone: oneOf(c.zone, ["deck", "reserve"] as const),
    modifications: list(c.modifications, () => fail()),
    provenance,
  };
}

function run(value: unknown): D97RunV4 {
  const r = record(value);
  const collection = record(r.collection);
  const bags = record(r.bags);
  const quests = record(r.quests);
  return {
    runId: parsed(parseD97RunId)(r.runId),
    runSeed: parsed(parseD97RunSeed)(r.runSeed),
    avatarId: avatarId(r.avatarId),
    dreamId: id(d97DreamIdFromUnknown)(r.dreamId),
    startedAt: str(r.startedAt),
    essence: int(r.essence),
    battlesFought: int(r.battlesFought),
    collection: { copies: list(collection.copies, ownedCopy), nextCopyOrdinal: int(collection.nextCopyOrdinal) },
    bags: {
      stage: int(bags.stage),
      drawn: byKey(bags.drawn, avatarId, (cards) => byKey(cards, cardId, int)),
    },
    encounters: byAnchor(r.encounters, encounter),
    returnAnchorId: nullable(r.returnAnchorId, anchorId),
    quests: {
      active: nullable(quests.active, (a) => {
        const q = record(a);
        return { questId: questId(q.questId), completedStepIds: list(q.completedStepIds, id(d97QuestStepIdFromUnknown)) };
      }),
      completedQuestIds: list(quests.completedQuestIds, questId),
      pendingReward: nullable(quests.pendingReward, (p) => {
        const q = record(p);
        return { questId: questId(q.questId), cardIds: list(q.cardIds, cardId) };
      }),
      items: list(quests.items, id(d97ItemIdFromUnknown)),
    },
    flags: list(r.flags, id(d97FlagIdFromUnknown)),
    activeWaypointIds: list(r.activeWaypointIds, anchorId),
    lastPlace: nullable(r.lastPlace, (p) => {
      const place = record(p);
      return {
        kind: oneOf(place.kind, ["door", "waypoint"] as const),
        anchorId: anchorId(place.anchorId),
        roomId: nullable(place.roomId, id(d97RoomIdFromUnknown)),
      };
    }),
    shops: byAnchor(r.shops, (s) => {
      const shop = record(s);
      return {
        slots: list(shop.slots, (slot) => {
          const v = record(slot);
          return { cardId: cardId(v.cardId), price: int(v.price), purchased: bool(v.purchased) };
        }),
        restockedThisVisit: bool(shop.restockedThisVisit),
        rolls: int(shop.rolls),
      };
    }),
  };
}

function battle(value: unknown): D97BattleFoldState {
  const b = record(value);
  if (record(b.mode).kind !== "d97") fail();
  record(b.init);
  record(b.engine);
  return value as D97BattleFoldState;
}

/** Validate an already-migrated snapshot as schema v4, or null when any field does not match. */
export function parseSnapshotV4(value: unknown): D97SnapshotV4 | null {
  try {
    const s = record(value);
    const build = record(s.build);
    const d97 = record(s.d97);
    return {
      format: oneOf(s.format, ["dreamtides-97-save"] as const),
      schemaVersion: s.schemaVersion === 4 ? 4 : fail(),
      build: {
        reducerVersion: parsed(parseReducerVersion)(build.reducerVersion),
        gitRevision: id(buildGitRevisionFromUnknown)(build.gitRevision),
      },
      seq: int(s.seq),
      intentKeys: list(s.intentKeys, (entry) => {
        if (!Array.isArray(entry) || entry.length !== 2) fail();
        return [id(intentKeyFromUnknown)(entry[0]), int(entry[1])] as const;
      }),
      d97: {
        screen: { type: oneOf(record(d97.screen).type, ["avatarSelect", "overworld", "sliceEnd"] as const) },
        run: nullable(d97.run, run),
      },
      battle: nullable(s.battle, battle),
    };
  } catch (error) {
    if (error instanceof Mismatch) return null;
    throw error;
  }
}
