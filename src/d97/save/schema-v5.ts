// The persisted D97 save, schema version 5 (decision P5), written out in full.
// Version 5 adds the run's assembled acts (Appendix B §B4, `acts`); every
// other field is version 4's.
//
// This module never imports the live run types: the persisted shape is its
// own contract. The converters in ./snapshot.ts tie the live state to it at
// compile time, so a change to the live state that is not also a schema
// change fails type checking; the fix is the next schema module, a migration
// and a golden fixture, never an edit here.
//
// `parseSnapshotV5` validates an untrusted, already-migrated snapshot field by
// field, branded identities included, and returns null for anything that
// does not match. A D97 battle in progress belongs to the build that wrote it
// (P5 restarts it from its recorded setup across builds), so it is checked as
// a D97 battle envelope and otherwise kept as written.

import type { D97BattleFoldState } from "../../rules/battle/fold";
import { cardIdFromUnknown, type CardId } from "../../types/card-identity";
import { buildGitRevisionFromUnknown, type BuildGitRevision } from "../../types/build-identity";
import {
  avatarIdFromUnknown,
  d97ActIdFromUnknown,
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
  parseD97DialogueId,
  parseD97RunId,
  parseD97RunSeed,
  type AvatarId,
  type D97ActId,
  type D97CharacterId,
  type D97DialogueId,
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

export type D97ScreenV5 = { readonly type: "avatarSelect" } | { readonly type: "overworld" } | { readonly type: "sliceEnd" };

export interface D97PlaceV5 {
  readonly kind: "door" | "waypoint";
  readonly anchorId: DreamAnchorId;
  /** The room the place is in, or null on the dream's own map. */
  readonly roomId: D97RoomId | null;
}

export interface D97EncounterV5 {
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

export interface D97CopyProvenanceV5 {
  readonly channel: "starting" | "bag" | "ante" | "bundle" | "shop";
  readonly battleCount: number;
  readonly price?: number;
}

export interface D97OwnedCopyV5 {
  readonly copyId: D97OwnedCopyId;
  readonly cardId: CardId;
  readonly zone: "deck" | "reserve";
  readonly modifications: readonly never[];
  readonly provenance: D97CopyProvenanceV5;
}

export interface D97CollectionV5 {
  readonly copies: readonly D97OwnedCopyV5[];
  readonly nextCopyOrdinal: number;
}

export interface D97RewardBagsV5 {
  readonly stage: number;
  readonly drawn: Readonly<Partial<Record<AvatarId, Readonly<Partial<Record<CardId, number>>>>>>;
}

export interface D97QuestStateV5 {
  readonly active: { readonly questId: D97QuestId; readonly completedStepIds: readonly D97QuestStepId[] } | null;
  readonly completedQuestIds: readonly D97QuestId[];
  readonly pendingReward: { readonly questId: D97QuestId; readonly cardIds: readonly CardId[] } | null;
  readonly items: readonly D97ItemId[];
}

export interface D97ShopV5 {
  readonly slots: readonly { readonly cardId: CardId; readonly price: number; readonly purchased: boolean }[];
  readonly restockedThisVisit: boolean;
  readonly rolls: number;
}

export interface D97DoorEndV5 {
  readonly dreamId: D97DreamId;
  readonly anchorId: DreamAnchorId;
}

export interface D97DoorLinkV5 {
  readonly kind: "tree" | "loop";
  readonly from: D97DoorEndV5;
  readonly to: D97DoorEndV5;
}

export interface D97GuardianSeatV5 {
  readonly dreamId: D97DreamId;
  readonly anchorId: DreamAnchorId;
  readonly seat: "incarnation" | "chokepoint" | "optional" | "empty";
  readonly authored: boolean;
}

export type D97ChallengerOccupantV5 =
  | { readonly kind: "resident" }
  | {
      readonly kind: "generic";
      readonly characterId: D97CharacterId;
      readonly dialogueId: D97DialogueId | null;
      readonly deckSourceAvatarId: AvatarId;
    };

export interface D97ChallengerSeatV5 {
  readonly dreamId: D97DreamId;
  readonly anchorId: DreamAnchorId;
  readonly occupant: D97ChallengerOccupantV5;
}

export interface D97QuestRoleBindingV5 {
  readonly role: "giver" | "turnIn" | "step";
  readonly stepId: D97QuestStepId | null;
  readonly dreamId: D97DreamId;
  readonly anchorId: DreamAnchorId;
}

export interface D97QuestBindingV5 {
  readonly questId: D97QuestId;
  readonly roles: readonly D97QuestRoleBindingV5[];
}

export interface D97ActV5 {
  readonly actId: D97ActId;
  readonly number: number;
  readonly salt: number;
  readonly fallback: "shortCatalog" | "startOutsideCatalog" | "preAssemblySave" | null;
  readonly entryDreamId: D97DreamId;
  readonly incarnationDreamId: D97DreamId;
  readonly dreamIds: readonly D97DreamId[];
  readonly doors: readonly D97DoorLinkV5[];
  readonly exitDoor: D97DoorEndV5;
  readonly guardians: readonly D97GuardianSeatV5[];
  readonly challengers: readonly D97ChallengerSeatV5[];
  readonly quests: readonly D97QuestBindingV5[];
}

export interface D97RunV5 {
  readonly runId: D97RunId;
  readonly runSeed: D97RunSeed;
  readonly avatarId: AvatarId;
  readonly dreamId: D97DreamId;
  readonly acts: readonly D97ActV5[];
  readonly startedAt: string;
  readonly essence: number;
  readonly battlesFought: number;
  readonly collection: D97CollectionV5;
  readonly bags: D97RewardBagsV5;
  readonly encounters: Readonly<Partial<Record<DreamAnchorId, D97EncounterV5>>>;
  readonly returnAnchorId: DreamAnchorId | null;
  readonly quests: D97QuestStateV5;
  readonly flags: readonly D97FlagId[];
  readonly activeWaypointIds: readonly DreamAnchorId[];
  readonly lastPlace: D97PlaceV5 | null;
  readonly shops: Readonly<Partial<Record<DreamAnchorId, D97ShopV5>>>;
}

export interface D97StateV5 {
  readonly screen: D97ScreenV5;
  readonly run: D97RunV5 | null;
}

export interface D97SaveBuildV5 {
  readonly reducerVersion: ReducerVersion;
  readonly gitRevision: BuildGitRevision;
}

export interface D97SnapshotV5 {
  readonly format: "dreamtides-97-save";
  readonly schemaVersion: 5;
  readonly build: D97SaveBuildV5;
  readonly seq: number;
  readonly intentKeys: readonly (readonly [IntentKey, number])[];
  readonly d97: D97StateV5;
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

function encounter(value: unknown): D97EncounterV5 {
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

const dreamId = id(d97DreamIdFromUnknown);

function doorEnd(value: unknown): D97DoorEndV5 {
  const end = record(value);
  return { dreamId: dreamId(end.dreamId), anchorId: anchorId(end.anchorId) };
}

function act(value: unknown): D97ActV5 {
  const a = record(value);
  return {
    actId: id(d97ActIdFromUnknown)(a.actId),
    number: int(a.number),
    salt: int(a.salt),
    fallback: nullable(a.fallback, (f) => oneOf(f, ["shortCatalog", "startOutsideCatalog", "preAssemblySave"] as const)),
    entryDreamId: dreamId(a.entryDreamId),
    incarnationDreamId: dreamId(a.incarnationDreamId),
    dreamIds: list(a.dreamIds, dreamId),
    doors: list(a.doors, (d) => {
      const door = record(d);
      return { kind: oneOf(door.kind, ["tree", "loop"] as const), from: doorEnd(door.from), to: doorEnd(door.to) };
    }),
    exitDoor: doorEnd(a.exitDoor),
    guardians: list(a.guardians, (g) => {
      const seat = record(g);
      return {
        dreamId: dreamId(seat.dreamId),
        anchorId: anchorId(seat.anchorId),
        seat: oneOf(seat.seat, ["incarnation", "chokepoint", "optional", "empty"] as const),
        authored: bool(seat.authored),
      };
    }),
    challengers: list(a.challengers, (c) => {
      const seat = record(c);
      const o = record(seat.occupant);
      const occupant: D97ChallengerOccupantV5 =
        oneOf(o.kind, ["resident", "generic"] as const) === "resident"
          ? { kind: "resident" }
          : {
              kind: "generic",
              characterId: parsed(parseD97CharacterId)(o.characterId),
              dialogueId: nullable(o.dialogueId, parsed(parseD97DialogueId)),
              deckSourceAvatarId: avatarId(o.deckSourceAvatarId),
            };
      return { dreamId: dreamId(seat.dreamId), anchorId: anchorId(seat.anchorId), occupant };
    }),
    quests: list(a.quests, (q) => {
      const binding = record(q);
      return {
        questId: questId(binding.questId),
        roles: list(binding.roles, (r) => {
          const role = record(r);
          return {
            role: oneOf(role.role, ["giver", "turnIn", "step"] as const),
            stepId: nullable(role.stepId, id(d97QuestStepIdFromUnknown)),
            dreamId: dreamId(role.dreamId),
            anchorId: anchorId(role.anchorId),
          };
        }),
      };
    }),
  };
}

function ownedCopy(value: unknown): D97OwnedCopyV5 {
  const c = record(value);
  const p = record(c.provenance);
  const provenance: D97CopyProvenanceV5 = {
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

function run(value: unknown): D97RunV5 {
  const r = record(value);
  const collection = record(r.collection);
  const bags = record(r.bags);
  const quests = record(r.quests);
  return {
    runId: parsed(parseD97RunId)(r.runId),
    runSeed: parsed(parseD97RunSeed)(r.runSeed),
    avatarId: avatarId(r.avatarId),
    dreamId: dreamId(r.dreamId),
    acts: list(r.acts, act),
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

/** Validate an already-migrated snapshot as schema v5, or null when any field does not match. */
export function parseSnapshotV5(value: unknown): D97SnapshotV5 | null {
  try {
    const s = record(value);
    const build = record(s.build);
    const d97 = record(s.d97);
    return {
      format: oneOf(s.format, ["dreamtides-97-save"] as const),
      schemaVersion: s.schemaVersion === 5 ? 5 : fail(),
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
