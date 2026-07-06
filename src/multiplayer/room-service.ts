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
import { stripUndefinedForRtdb } from "./rtdb-sanitize";
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
import type {
  DraftState,
  Fresh20DraftState,
  PoolDraftState,
  ReplayDraftState,
} from "../types/draft";
import { FRESH20_DEFAULT_PACK_SIZE } from "../draft/fresh20/fresh20-offer";
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
  SiteState,
} from "../types/quest";
import { toLayerName } from "../types/layer-name";

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

/**
 * Coerce an RTDB-round-tripped value back into an array of values, preserving
 * each element as-is. Realtime Database stores arrays as numeric-keyed objects
 * and drops empty ones, so an array arrives as either an array, an object keyed
 * by index, or `undefined`. This is used for arrays whose elements are strings
 * or objects (site states, id lists, atlas layers) where no per-element
 * coercion is needed beyond rebuilding the array container.
 */
function coerceArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, T>);
  }
  return [];
}

function normalizeDreamscapeNode(node: DreamscapeNode): DreamscapeNode {
  return {
    ...node,
    // Revive the layer to a `LayerName`. Current snapshots already store the
    // string form; a snapshot from an earlier build stored a 0-based number,
    // which `toLayerName` maps back (`0` -> `LayerName.One`).
    layer: toLayerName(node.layer),
    // RTDB drops empty arrays and null on write and stores non-empty arrays as
    // numeric-keyed objects; coerce each array field back to a real array (empty
    // when missing) so the new node shape always round-trips intact and
    // downstream iteration never reads `undefined` or a plain object.
    sites: coerceArray<SiteState>(node.sites),
    enhancedSiteType: node.enhancedSiteType ?? null,
    dreamscapeId: node.dreamscapeId ?? null,
    forwardIds: coerceArray<string>(node.forwardIds),
    backwardIds: coerceArray<string>(node.backwardIds),
    knownDreamsignId: node.knownDreamsignId ?? null,
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
  // `layers` is a `string[][]`; both the outer list and each inner per-layer
  // list can arrive as numeric-keyed objects or be dropped when empty.
  const layers = coerceArray<unknown>(atlas.layers).map((layer) =>
    coerceArray<string>(layer),
  );
  return {
    layers: layers.length > 0 ? layers : defaults.layers,
    nodes,
    startingNodeId: atlas.startingNodeId ?? defaults.startingNodeId,
    bossNodeId: atlas.bossNodeId ?? defaults.bossNodeId,
    bossIncarnationId: atlas.bossIncarnationId ?? defaults.bossIncarnationId ?? null,
    currentNodeId: atlas.currentNodeId ?? defaults.currentNodeId,
    knownDreamsignCarrierIds: coerceArray<string>(
      atlas.knownDreamsignCarrierIds,
    ),
  };
}

/**
 * Restore fields on a `CardSourceDebugEntry` that RTDB silently dropped.
 *
 * Realtime Database strips boolean `false` and numeric `0` on write, so a
 * round-tripped entry for a draft-pool card with zero copies, or one outside
 * the starter decklist, arrives with `undefined` fields. Restore the defaults
 * so the overlay renders without crashing.
 */
function normalizeCardSourceDebugEntry(
  entry: CardSourceDebugEntry,
): CardSourceDebugEntry {
  return {
    ...entry,
    inStarterDecklist: entry.inStarterDecklist ?? false,
    draftPoolCopies: entry.draftPoolCopies ?? 0,
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

/**
 * Coerce an RTDB-round-tripped value back into a `number[]`. Realtime Database
 * stores arrays as numeric-keyed objects and drops empty ones, so an array
 * arrives as either an array, an object keyed by index, or `undefined`.
 */
function coerceNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
  }
  return [];
}

/**
 * Coerce an RTDB-round-tripped value back into a `number[][]` (e.g. a replay
 * pack sequence). Both the outer and inner arrays may arrive as numeric-keyed
 * objects; a missing value becomes `[]`.
 */
function coerceNumberMatrix(value: unknown): number[][] {
  if (Array.isArray(value)) {
    return value.map(coerceNumberArray);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(coerceNumberArray);
  }
  return [];
}

/**
 * Coerce an RTDB-round-tripped value back into a `Record<string, number[]>`
 * (the fresh20 show history). The top-level map and each pick list may arrive
 * as a numeric-keyed object; a missing value becomes `{}`, and empty lists are
 * dropped so the result matches the in-memory invariant (shown cards only).
 */
function coerceShownPicks(value: unknown): Record<string, number[]> {
  if (value === null || typeof value !== "object") {
    return {};
  }
  const result: Record<string, number[]> = {};
  for (const [key, picks] of Object.entries(value as Record<string, unknown>)) {
    const list = coerceNumberArray(picks);
    if (list.length > 0) {
      result[key] = list;
    }
  }
  return result;
}

function normalizeDraftState(draftState: DraftState | null | undefined): DraftState | null {
  if (draftState === null || draftState === undefined) {
    return null;
  }
  // RTDB drops the `mode` field on states persisted before the discriminated
  // union existed, so an absent mode means a pool draft.
  const raw = draftState as Partial<ReplayDraftState> &
    Partial<PoolDraftState> &
    Partial<Fresh20DraftState> & { mode?: unknown };
  const mode =
    raw.mode === "replay"
      ? "replay"
      : raw.mode === "fresh20"
        ? "fresh20"
        : "pool";
  const common = {
    currentOffer: coerceNumberArray(draftState.currentOffer),
    activeSiteId: draftState.activeSiteId ?? null,
    pickNumber: draftState.pickNumber ?? 1,
    sitePicksCompleted: draftState.sitePicksCompleted ?? 0,
    // RTDB strips the empty array on a fresh run or between site visits;
    // restore it so the within-visit dedup never reads `undefined`.
    siteShownCardNumbers: coerceNumberArray(draftState.siteShownCardNumbers),
  };
  if (mode === "replay") {
    return {
      ...common,
      mode: "replay",
      recordId: raw.recordId ?? "",
      signatureCardNumbers: coerceNumberArray(raw.signatureCardNumbers),
      packSequence: coerceNumberMatrix(raw.packSequence),
    };
  }
  if (mode === "fresh20") {
    return {
      ...common,
      mode: "fresh20",
      // RTDB strips a default/zero number; restore the standard pack size.
      packSize:
        typeof raw.packSize === "number" && raw.packSize > 0
          ? raw.packSize
          : FRESH20_DEFAULT_PACK_SIZE,
      // RTDB strips the empty `{}` on a fresh run; restore it.
      shownPicksByCard: coerceShownPicks(raw.shownPicksByCard),
    };
  }
  return {
    ...common,
    mode: "pool",
    draftPoolCopiesByCard:
      raw.draftPoolCopiesByCard ?? raw.remainingCopiesByCard ?? {},
    remainingCopiesByCard: raw.remainingCopiesByCard ?? {},
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
  if (entry.kind === "cardChoice") {
    // RTDB silently drops empty arrays, so a freshly created card-choice runtime
    // (whose `acceptedEntryIds` is empty until the player accepts) round-trips
    // back missing the field. Restore the array fields so the accept
    // transactions can read `.length` / `.includes` without crashing.
    const base = {
      entryIds: entry.entryIds ?? [],
      acceptedEntryIds: entry.acceptedEntryIds ?? [],
    };
    if (entry.choiceKind === "transfiguration") {
      return {
        ...entry,
        ...base,
        transfigurationOffers: entry.transfigurationOffers ?? [],
      };
    }
    return { ...entry, ...base };
  }
  if (entry.kind === "shop") {
    // RTDB silently drops empty arrays, so a shop runtime whose `slots` or
    // `remainingDreamsignPoolIds` was empty at write time round-trips back
    // missing the field. Restore both so `ShopScreen`'s `.map` and the
    // purchase/reroll transactions never read `.map`/`.length` on undefined.
    return {
      ...entry,
      slots: entry.slots ?? [],
      remainingDreamsignPoolIds: entry.remainingDreamsignPoolIds ?? [],
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

    await update(roomsRef, stripUndefinedForRtdb(updateMap));
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
  await enqueueRoomWrite(roomId, () =>
    update(ref(database), stripUndefinedForRtdb(updateMap)),
  );
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
      // RTDB rejects any returned tree containing `undefined`; strip it so a
      // stray optional field never aborts the whole transaction.
      return next === undefined ? current : stripUndefinedForRtdb(next);
    }),
  );
}

/**
 * Number of clients currently connected to the room, counted from `presence`
 * entries flagged `connected`. A single connected client is the single-player
 * quest flow; two or more clients are sharing the room.
 */
export function connectedClientCount(room: MultiplayerRoom): number {
  return Object.values(room.presence ?? {}).filter((entry) => entry.connected)
    .length;
}

/**
 * Whether `clientId` is the room's primary client — the single client
 * authorized to perform once-per-room authoritative work (currently the battle
 * init in {@link useEnsureBattleSession}). The room model has no host/owner
 * field, so "primary" is derived deterministically from presence: the
 * lexicographically smallest connected `clientId`. Because every client sees
 * the same synced `presence`, they all agree on the same primary.
 *
 * The caller's own `clientId` is always treated as a candidate even when its
 * presence write has not yet synced, so a client never defers to a set that
 * excludes itself. When no presence is known (the not-yet-synced or
 * single-client case) the sole candidate is `clientId`, so it is primary —
 * mirroring the presence-unknown-means-act-locally rule the battle AI uses
 * (see `aiMayRunHere`). The server-side `ensureBattleSession` transaction
 * remains the final guard against any residual race during presence
 * convergence.
 */
export function isPrimaryClient(
  room: MultiplayerRoom,
  clientId: string,
): boolean {
  const connected = Object.entries(room.presence ?? {})
    .filter(([, entry]) => entry.connected)
    .map(([id]) => id);
  const candidates = connected.includes(clientId)
    ? connected
    : [...connected, clientId];
  return candidates.every((id) => clientId <= id);
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
