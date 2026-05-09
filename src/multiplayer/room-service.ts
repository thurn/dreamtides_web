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
import type {
  DreamAtlas,
  DreamscapeNode,
  QuestState,
} from "../types/quest";

export type RoomSubscriptionSnapshot =
  | { status: "ready"; room: MultiplayerRoom }
  | { status: "missing" }
  | { status: "error"; message: string };

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
    nexusId: atlas.nexusId ?? defaults.nexusId,
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

function normalizeQuestState(questState: QuestState | null | undefined): QuestState | null {
  if (questState === null || questState === undefined) {
    return null;
  }

  const defaults = createDefaultState();
  return {
    essence: questState.essence ?? defaults.essence,
    deck: questState.deck ?? defaults.deck,
    dreamcaller: questState.dreamcaller ?? null,
    resolvedPackage: questState.resolvedPackage ?? null,
    cardSourceDebug: questState.cardSourceDebug ?? null,
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
  };
}

function normalizeRoomSnapshot(room: MultiplayerRoom): MultiplayerRoom {
  return {
    ...room,
    questState: normalizeQuestState(room.questState),
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
