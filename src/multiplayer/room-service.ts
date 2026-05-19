import {
  get,
  onDisconnect,
  onValue,
  ref,
  runTransaction,
  set,
  update,
  type Database,
  type Unsubscribe,
} from "firebase/database";
import { pruneActionLog } from "./action-log";
import { normalizeBattleStateSnapshot } from "./battle-normalize";
import { presencePath, roomPath, type FirebaseUpdateMap } from "./room-paths";
import {
  ACTION_LOG_LIMIT,
  ROOM_SCHEMA_VERSION,
  type ActionLogEntry,
  type MultiplayerRoom,
  type PresenceEntry,
  type RoomMetadata,
} from "./room-types";
import { createDefaultState } from "../state/quest-context";
import type { DraftState } from "../types/draft";
import {
  DEFAULT_STARTING_ESSENCE,
  type ResolvedDreamcallerPackage,
} from "../types/content";
import type {
  CardSourceDebugEntry,
  CardSourceDebugState,
  DeckEntry,
  Dreamcaller,
  DreamAtlas,
  Dreamsign,
  DreamscapeNode,
  QuestState,
  RewardSiteRuntime,
  SiteRuntimeState,
} from "../types/quest";

export type RoomSubscriptionSnapshot =
  | { status: "ready"; room: MultiplayerRoom }
  | { status: "missing" }
  | { status: "error"; message: string };

function normalizeDeckEntry(entry: DeckEntry): DeckEntry {
  return {
    ...entry,
    transfiguration: entry.transfiguration ?? null,
    typeChange: entry.typeChange ?? null,
    keywordModification: entry.keywordModification ?? null,
    isBane: entry.isBane ?? false,
  };
}

function normalizeDeck(deck: readonly DeckEntry[] | undefined): DeckEntry[] {
  if (deck === undefined) {
    return [];
  }
  return deck.map(normalizeDeckEntry);
}

function normalizeDreamscapeNode(node: DreamscapeNode): DreamscapeNode {
  return {
    ...node,
    sites: node.sites ?? [],
    enhancedSiteType: node.enhancedSiteType ?? null,
  };
}

function normalizeAtlas(atlas: DreamAtlas | undefined): DreamAtlas {
  const defaults = createDefaultState().atlas;
  if (atlas === undefined) {
    return defaults;
  }
  const rawNodes = atlas.nodes ?? defaults.nodes;
  const nodes: Record<string, DreamscapeNode> = {};
  for (const [id, node] of Object.entries(rawNodes)) {
    nodes[id] = normalizeDreamscapeNode(node);
  }
  return {
    nodes,
    edges: atlas.edges ?? defaults.edges,
    startingNodeId: atlas.startingNodeId ?? defaults.startingNodeId,
  };
}

/**
 * Restore arrays on a `CardSourceDebugEntry` that RTDB silently dropped.
 *
 * A fallback entry has empty `matchedMandatoryTides` and `matchedOptionalTides`
 * arrays; a card with no tides has an empty `cardTides` array; legacy and
 * fallback entries can have an empty `sourceTides` array. Realtime
 * Database strips all four on write, so the round-tripped entry arrives
 * with `undefined` fields and the overlay crashes when it iterates them.
 */
function normalizeCardSourceDebugEntry(
  entry: CardSourceDebugEntry,
): CardSourceDebugEntry {
  return {
    ...entry,
    cardTides: entry.cardTides ?? [],
    matchedMandatoryTides: entry.matchedMandatoryTides ?? [],
    matchedOptionalTides: entry.matchedOptionalTides ?? [],
    sourceTides: entry.sourceTides ?? [],
    isFallback: entry.isFallback ?? false,
  };
}

function normalizeCardSourceDebug(
  cardSourceDebug: CardSourceDebugState | null | undefined,
): CardSourceDebugState | null {
  if (cardSourceDebug === null || cardSourceDebug === undefined) {
    return null;
  }
  return {
    ...cardSourceDebug,
    entries: (cardSourceDebug.entries ?? []).map(normalizeCardSourceDebugEntry),
  };
}

function normalizeDraftState(draftState: DraftState | null | undefined): DraftState | null {
  if (draftState === null || draftState === undefined) {
    return null;
  }
  return {
    ...draftState,
    draftPoolCopiesByCard:
      draftState.draftPoolCopiesByCard
      ?? draftState.remainingCopiesByCard
      ?? {},
    remainingCopiesByCard: draftState.remainingCopiesByCard ?? {},
    currentOffer: draftState.currentOffer ?? [],
    activeSiteId: draftState.activeSiteId ?? null,
  };
}

/**
 * Drop any unrecognized `awakening` field from a Dreamcaller record so RTDB
 * rooms that carry it are silently sanitized into the current runtime shape.
 * Also restores `startingEssence` to the default when missing — older rooms
 * predate the field and Firebase strips numeric fields that match the
 * default `0` if the writer ever set it that way.
 */
function normalizeDreamcaller(
  dreamcaller: Dreamcaller | null | undefined,
): Dreamcaller | null {
  if (dreamcaller === null || dreamcaller === undefined) {
    return null;
  }
  const { awakening: _awakening, ...rest } = dreamcaller as Dreamcaller & {
    awakening?: unknown;
  };
  return {
    ...rest,
    startingEssence: rest.startingEssence ?? DEFAULT_STARTING_ESSENCE,
  };
}

function normalizeResolvedPackage(
  resolvedPackage: ResolvedDreamcallerPackage | null | undefined,
): ResolvedDreamcallerPackage | null {
  if (resolvedPackage === null || resolvedPackage === undefined) {
    return null;
  }
  const { awakening: _awakening, ...rawDreamcaller } =
    resolvedPackage.dreamcaller as ResolvedDreamcallerPackage["dreamcaller"] & {
      awakening?: unknown;
    };
  const dreamcaller = {
    ...rawDreamcaller,
    startingEssence: rawDreamcaller.startingEssence ?? DEFAULT_STARTING_ESSENCE,
  };
  return {
    ...resolvedPackage,
    dreamcaller,
  };
}

/**
 * Build a valid `Dreamsign` for a reward runtime, reconstructing the record
 * for snapshots written before reward runtimes carried the full `Dreamsign`
 * object and coercing `isBane` to `false` when RTDB stripped a stored `false`.
 *
 * Pre-restructure reward snapshots stored only `dreamsignId`/`dreamsignName`/
 * `dreamsignEffect`; this helper reconstructs the matching `Dreamsign`
 * shape with conservative defaults so `DreamsignArtTile` can render its glyph
 * fallback and the reward screen never crashes on undefined fields.
 */
function normalizeRewardDreamsign(
  reward: Record<string, unknown>,
): Dreamsign {
  const candidate = reward.dreamsign as Partial<Dreamsign> | undefined;
  if (candidate && typeof candidate === "object") {
    return {
      ...candidate,
      name: candidate.name ?? "Unknown Dreamsign",
      effectDescription: candidate.effectDescription ?? "",
      isBane: candidate.isBane ?? false,
    } as Dreamsign;
  }
  const legacyId = reward.dreamsignId;
  const legacyName = reward.dreamsignName;
  const legacyEffect = reward.dreamsignEffect;
  return {
    id: typeof legacyId === "string" ? legacyId : "unknown",
    name: typeof legacyName === "string" ? legacyName : "Unknown Dreamsign",
    effectDescription: typeof legacyEffect === "string" ? legacyEffect : "",
    imageName: "",
    imageAlt: "",
    isBane: false,
  };
}

/**
 * Normalize one entry of `siteRuntime`. The reward branch reconstructs the
 * `Dreamsign` object on dreamsign rewards so legacy snapshots (which stored
 * flat `dreamsignId`/`dreamsignName`/`dreamsignEffect` fields) round-trip
 * into the current shape. All other branches are passed through unchanged.
 */
function normalizeSiteRuntimeEntry(
  entry: SiteRuntimeState,
): SiteRuntimeState {
  if (entry.kind === "shop") {
    // RTDB strips `restrictedTide: null`, so restore it for regular shops.
    return {
      ...entry,
      restrictedTide: entry.restrictedTide ?? null,
    };
  }
  if (entry.kind !== "reward") {
    return entry;
  }
  const reward = entry.reward as RewardSiteRuntime["reward"] &
    Record<string, unknown>;
  if (reward.rewardType !== "dreamsign") {
    return entry;
  }
  const dreamsign = normalizeRewardDreamsign(reward);
  return {
    ...entry,
    reward: { rewardType: "dreamsign", dreamsign },
  };
}

function normalizeSiteRuntime(
  siteRuntime: Record<string, SiteRuntimeState> | undefined,
): Record<string, SiteRuntimeState> {
  if (siteRuntime === undefined) {
    return {};
  }
  const normalized: Record<string, SiteRuntimeState> = {};
  for (const [id, entry] of Object.entries(siteRuntime)) {
    normalized[id] = normalizeSiteRuntimeEntry(entry);
  }
  return normalized;
}

function normalizeQuestState(questState: QuestState | null | undefined): QuestState | null {
  if (questState === null || questState === undefined) {
    return null;
  }

  const defaults = createDefaultState();
  // Per-quest seed. RTDB silently drops empty strings, so a snapshot whose
  // writer left the seed unset arrives without the field. Backfill from
  // `createDefaultState()` so the journey adapter always receives a non-empty
  // string and downstream hashes do not collide on `undefined`.
  const seed =
    typeof questState.seed === "string" && questState.seed.length > 0
      ? questState.seed
      : defaults.seed;
  return {
    seed,
    essence: questState.essence ?? defaults.essence,
    essenceCap: questState.essenceCap ?? defaults.essenceCap,
    omens: questState.omens ?? defaults.omens,
    maxDreamsigns: questState.maxDreamsigns ?? defaults.maxDreamsigns,
    deck: normalizeDeck(questState.deck),
    dreamcaller: normalizeDreamcaller(questState.dreamcaller),
    resolvedPackage: normalizeResolvedPackage(questState.resolvedPackage),
    cardSourceDebug: normalizeCardSourceDebug(questState.cardSourceDebug),
    remainingDreamsignPool: questState.remainingDreamsignPool ?? defaults.remainingDreamsignPool,
    dreamsigns: questState.dreamsigns ?? defaults.dreamsigns,
    completionLevel: questState.completionLevel ?? defaults.completionLevel,
    atlas: normalizeAtlas(questState.atlas),
    currentDreamscape: questState.currentDreamscape ?? null,
    visitedSites: questState.visitedSites ?? defaults.visitedSites,
    siteRuntime: normalizeSiteRuntime(questState.siteRuntime),
    draftState: normalizeDraftState(questState.draftState),
    screen: questState.screen ?? defaults.screen,
    activeSiteId: questState.activeSiteId ?? null,
    failureSummary: questState.failureSummary ?? null,
    hasSeenStartingDeckPopup:
      questState.hasSeenStartingDeckPopup ?? defaults.hasSeenStartingDeckPopup,
    battleModifiers: questState.battleModifiers ?? defaults.battleModifiers,
    shopModifiers: questState.shopModifiers ?? defaults.shopModifiers,
    dreamscapeModifiers:
      questState.dreamscapeModifiers ?? defaults.dreamscapeModifiers,
  };
}

function normalizeRoomSnapshot(room: MultiplayerRoom): MultiplayerRoom {
  return {
    ...room,
    questState: normalizeQuestState(room.questState),
    battleState: normalizeBattleStateSnapshot(room.battleState ?? null),
    presence: room.presence ?? {},
    actionLog: room.actionLog ?? {},
  };
}

export function createRoomRecord(nowIso: string = new Date().toISOString()): MultiplayerRoom {
  const metadata: RoomMetadata = {
    schemaVersion: ROOM_SCHEMA_VERSION,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    metadata,
    questState: null,
    battleState: null,
    presence: {},
    actionLog: {},
  };
}

const roomWriteQueues = new Map<string, Promise<void>>();

function enqueueRoomWrite<T>(
  roomId: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = roomWriteQueues.get(roomId) ?? Promise.resolve();
  const result = previous.then(
    () => task(),
    () => task(),
  );
  const chainTail = result.then(
    () => undefined,
    () => undefined,
  );
  roomWriteQueues.set(roomId, chainTail);
  return result;
}

export async function createRoom(
  database: Database,
  roomId: string,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  await enqueueRoomWrite(roomId, () =>
    set(ref(database, roomPath(roomId)), createRoomRecord(nowIso)),
  );
}

/**
 * How long a room is preserved after creation, in milliseconds.
 *
 * Rooms older than this window are evicted by `createRoomEvictingStale`
 * whenever a fresh room is created. Rooms whose `metadata.createdAt` is
 * within the window — or whose `metadata.createdAt` is missing or
 * unparseable — are preserved. This lets concurrent QA sessions and
 * sibling backlog tasks coexist without clobbering each other's rooms,
 * while still trimming long-abandoned rooms over time.
 */
export const ROOM_PRESERVATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Decide whether a sibling room should be evicted when a new room is
 * being created. A room is stale (and therefore evictable) only when its
 * `metadata.createdAt` parses as a finite timestamp older than the
 * 24-hour preservation window. Rooms missing or carrying an unparseable
 * `metadata.createdAt` are preserved so legacy rooms predating this
 * eviction policy are not silently wiped.
 */
export function isRoomStale(
  room: unknown,
  nowMs: number,
  windowMs: number = ROOM_PRESERVATION_WINDOW_MS,
): boolean {
  if (room === null || typeof room !== "object") {
    return false;
  }
  const metadata = (room as { metadata?: { createdAt?: unknown } }).metadata;
  if (metadata === null || metadata === undefined) {
    return false;
  }
  const createdAt = metadata.createdAt;
  if (typeof createdAt !== "string" || createdAt.length === 0) {
    return false;
  }
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) {
    return false;
  }
  return nowMs - createdAtMs > windowMs;
}

/**
 * Create a new room while preserving every other room created within the
 * last 24 hours.
 *
 * Implementation: read the current `/rooms` snapshot, build a single
 * multi-path `update()` that writes the new room at `rooms/<id>` and
 * `null`s out only the sibling rooms whose `metadata.createdAt` is older
 * than `ROOM_PRESERVATION_WINDOW_MS`. Rooms inside the preservation
 * window — and any room whose `createdAt` is missing or unparseable —
 * are left untouched.
 */
export async function createRoomEvictingStale(
  database: Database,
  roomId: string,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  await enqueueRoomWrite(roomId, async () => {
    const roomsRef = ref(database, "rooms");
    const snapshot = await get(roomsRef);
    const existingRooms = snapshot.exists()
      ? (snapshot.val() as Record<string, unknown> | null)
      : null;
    const nowMs = Date.parse(nowIso);
    const cutoffMs = Number.isFinite(nowMs) ? nowMs : Date.now();

    const updateMap: Record<string, unknown> = {
      [roomId]: createRoomRecord(nowIso),
    };
    if (existingRooms !== null) {
      for (const [existingId, existingRoom] of Object.entries(existingRooms)) {
        if (existingId === roomId) {
          continue;
        }
        if (isRoomStale(existingRoom, cutoffMs)) {
          updateMap[existingId] = null;
        }
      }
    }

    await update(roomsRef, updateMap);
  });
}

export function subscribeToRoom(
  database: Database,
  roomId: string,
  listener: (snapshot: RoomSubscriptionSnapshot) => void,
): Unsubscribe {
  return onValue(
    ref(database, roomPath(roomId)),
    (snapshot) => {
      if (!snapshot.exists()) {
        listener({ status: "missing" });
        return;
      }

      listener({ status: "ready", room: normalizeRoomSnapshot(snapshot.val() as MultiplayerRoom) });
    },
    (error) => {
      listener({ status: "error", message: error.message });
    },
  );
}

export async function writeRoomUpdate(
  database: Database,
  roomId: string,
  updateMap: FirebaseUpdateMap,
): Promise<void> {
  await enqueueRoomWrite(roomId, () => update(ref(database), updateMap));
}

export async function pruneRoomActionLog(
  database: Database,
  roomId: string,
  limit: number = ACTION_LOG_LIMIT,
): Promise<void> {
  await enqueueRoomWrite(roomId, () =>
    runTransaction(ref(database, `${roomPath(roomId)}/actionLog`), (current) => {
      const actionLog = (current ?? {}) as Record<string, ActionLogEntry>;
      if (Object.keys(actionLog).length <= limit + 10) {
        return current;
      }

      return pruneActionLog(actionLog, limit);
    }),
  );
}

export async function runRoomTransaction(
  database: Database,
  roomId: string,
  updater: (current: MultiplayerRoom | null) => MultiplayerRoom | null | undefined,
): Promise<void> {
  await enqueueRoomWrite(roomId, () =>
    runTransaction(ref(database, roomPath(roomId)), (current) => {
      const normalized =
        current === null || current === undefined
          ? null
          : normalizeRoomSnapshot(current as MultiplayerRoom);
      const next = updater(normalized);
      return next === undefined ? current : next;
    }),
  );
}

export async function writePresence(
  database: Database,
  roomId: string,
  clientId: string,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  await enqueueRoomWrite(roomId, async () => {
    const entryRef = ref(database, presencePath(roomId, clientId));
    const entry: PresenceEntry = { connected: true, lastSeenAt: nowIso };

    await onDisconnect(entryRef).remove();
    await set(entryRef, entry);
  });
}
