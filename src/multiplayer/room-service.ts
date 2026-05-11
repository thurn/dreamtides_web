import {
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
  DreamscapeNode,
  QuestState,
} from "../types/quest";

export type RoomSubscriptionSnapshot =
  | { status: "ready"; room: MultiplayerRoom }
  | { status: "missing" }
  | { status: "error"; message: string };

function normalizeDeckEntry(entry: DeckEntry): DeckEntry {
  return {
    ...entry,
    transfiguration: entry.transfiguration ?? null,
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
 * arrays; a card with no tides has an empty `cardTides` array. Realtime
 * Database strips all three on write, so the round-tripped entry arrives
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

function normalizeQuestState(questState: QuestState | null | undefined): QuestState | null {
  if (questState === null || questState === undefined) {
    return null;
  }

  const defaults = createDefaultState();
  return {
    essence: questState.essence ?? defaults.essence,
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
    siteRuntime: questState.siteRuntime ?? defaults.siteRuntime,
    draftState: normalizeDraftState(questState.draftState),
    screen: questState.screen ?? defaults.screen,
    activeSiteId: questState.activeSiteId ?? null,
    failureSummary: questState.failureSummary ?? null,
    hasSeenStartingDeckPopup:
      questState.hasSeenStartingDeckPopup ?? defaults.hasSeenStartingDeckPopup,
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

export async function createRoomReplacingAll(
  database: Database,
  roomId: string,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  await enqueueRoomWrite(roomId, () =>
    set(ref(database, "rooms"), { [roomId]: createRoomRecord(nowIso) }),
  );
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
