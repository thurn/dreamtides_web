import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type Database } from "firebase/database";
import type { ContentConfig, Genesis, LogNode } from "../eventlog/types";
import {
  createRoomEvictingStale,
  generateRoomId,
  mintClientId,
  RoomExistsError,
  writePresence,
} from "../eventlog/room";
import { subscribeToLog } from "../eventlog/subscribe";
import {
  contentConfigFromRuntime,
  contentConfigsEqual,
  type RuntimeConfig,
} from "../runtime/runtime-config";
import { getBuildHash } from "./build-hash";
import type { FrontDoorPhase } from "../rules/fold-state";
import { installQuestLogSink, type QuestLogSinkHandle } from "./quest-log-sink";
import { ConfigGateScreen } from "./ConfigGateScreen";
import { UnreadableRoomScreen } from "./UnreadableRoomScreen";
import { VersionGateScreen } from "./VersionGateScreen";
import { ApplicationStateScreen } from "../cumulus/screens/ApplicationStateScreen";

// How long to wait for the first log snapshot before treating the room as
// unreachable/missing. Firebase emits its initial value within a couple of
// seconds on a healthy connection, so this is generous headroom.
const ROOM_LOAD_TIMEOUT_MS = 15_000;

/**
 * Everything a mounted coop game needs from a ready room. RoomGate hands this
 * to `children` once the room's log node exists and its `reducerVersion`
 * matches this build. Task 25's `CoopProvider` consumes it: it builds a
 * `LogClient` from `db` + `roomId` (subscribing via `subscribeToLog`, appending
 * via the eventlog append path) and wires the client's `onEventOutcome` /
 * `onDivergence` callbacks to `logSink`'s record helpers.
 */
export interface RoomReadyContext {
  db: Database;
  roomId: string;
  clientId: string;
  genesis: Genesis;
  logSink: QuestLogSinkHandle;
}

interface RoomGateProps {
  db: Database;
  /** The `?game=` room id, or `null` to auto-create a fresh room. */
  gameId: string | null;
  /** This client's runtime config; its content slice is pinned into a new room's genesis. */
  runtimeConfig: RuntimeConfig;
  /** Scene stamped into genesis only when this mount creates a fresh room. */
  frontDoorEntry?: Exclude<FrontDoorPhase, "mainExiting">;
  children: (context: RoomReadyContext) => ReactNode;
}

type GateState =
  | { status: "creating" }
  | { status: "loading"; roomId: string }
  | { status: "unreachable"; roomId: string }
  | { status: "ready"; roomId: string; genesis: Genesis }
  | { status: "versionGate"; roomId: string; genesis: Genesis }
  | { status: "configGate"; roomId: string; genesis: Genesis }
  | { status: "unreadable"; roomId: string }
  | { status: "error"; message: string };

/** Fresh random seed for a new room's genesis. */
function freshSeed(): string {
  const cryptoSource = globalThis.crypto;
  if (typeof cryptoSource?.randomUUID === "function") {
    return cryptoSource.randomUUID();
  }
  const bytes = new Uint8Array(16);
  cryptoSource.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Build the genesis for a brand-new room: fresh seed, this build's hash, now,
 * and the fold-relevant content parameters pinned from this client's config so
 * every joiner folds the same content.
 */
export function createFreshGenesis(
  contentConfig: ContentConfig,
  frontDoorEntry?: Exclude<FrontDoorPhase, "mainExiting">,
): Genesis {
  return {
    seed: freshSeed(),
    reducerVersion: getBuildHash(),
    createdAt: Date.now(),
    contentConfig,
    ...(frontDoorEntry === undefined ? {} : { frontDoorEntry }),
  };
}

/**
 * Number of fresh-id attempts before giving up on a room-id collision. A
 * `generateRoomId()` collision at the default 6-character length is
 * astronomically unlikely; this bounds the retry loop rather than looping
 * forever against a persistently misbehaving database.
 */
const CREATE_ROOM_MAX_ATTEMPTS = 3;

/**
 * Create a fresh room and navigate the URL to `?game=<id>`; returns the id.
 * `createRoomEvictingStale` now rejects with {@link RoomExistsError} instead
 * of overwriting an existing room on an id collision (audit finding P2-7);
 * this retries with a FRESH `generateRoomId()` up to
 * {@link CREATE_ROOM_MAX_ATTEMPTS} times before giving up. Any other failure
 * (e.g. a network error) propagates immediately without retrying.
 */
export async function createAndNavigateToRoom(
  db: Database,
  contentConfig: ContentConfig,
  frontDoorEntry?: Exclude<FrontDoorPhase, "mainExiting">,
): Promise<string> {
  for (let attempt = 0; attempt < CREATE_ROOM_MAX_ATTEMPTS; attempt++) {
    const roomId = generateRoomId();
    try {
      await createRoomEvictingStale(
        db,
        roomId,
        createFreshGenesis(contentConfig, frontDoorEntry),
      );
      navigateToRoom(roomId);
      return roomId;
    } catch (error) {
      const isLastAttempt = attempt === CREATE_ROOM_MAX_ATTEMPTS - 1;
      if (!(error instanceof RoomExistsError) || isLastAttempt) {
        throw error;
      }
    }
  }
  // Unreachable: the loop above always either returns or throws.
  throw new Error("createAndNavigateToRoom: exhausted retry attempts");
}

/**
 * Decides how a delivered genesis gates against this client: a reducer-version
 * mismatch (fatal, checked first) shows the version gate; a content-config
 * mismatch — including a genesis with no `contentConfig` at all — shows the
 * recoverable config gate; otherwise the room is ready. Pure, so it is unit
 * testable without rendering.
 */
export function gateStatusFor(
  genesis: Genesis,
  localContentConfig: ContentConfig,
): "ready" | "versionGate" | "configGate" {
  if (genesis.reducerVersion !== getBuildHash()) {
    return "versionGate";
  }
  const roomContentConfig = genesis.contentConfig as ContentConfig | undefined;
  if (
    roomContentConfig === undefined ||
    !contentConfigsEqual(roomContentConfig, localContentConfig)
  ) {
    return "configGate";
  }
  return "ready";
}

function navigateToRoom(roomId: string): void {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("game", roomId);
  window.history.pushState(
    null,
    "",
    `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
  );
}

/**
 * Coop room gate: parse `?game=`, create/join, subscribe to the room log,
 * write presence, install the quest-log sink, and gate on
 * `genesis.reducerVersion === getBuildHash()`. On a match it renders
 * `children` with the ready room context; on a mismatch it renders the
 * read-only `VersionGateScreen`.
 */
export function RoomGate({
  db,
  gameId,
  runtimeConfig,
  frontDoorEntry,
  children,
}: RoomGateProps): ReactNode {
  const clientId = useMemo(mintClientId, []);
  const localContentConfig = useMemo(
    () => contentConfigFromRuntime(runtimeConfig),
    [runtimeConfig],
  );
  const autoCreateFiredRef = useRef(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(gameId);
  const [gateState, setGateState] = useState<GateState>(
    gameId === null
      ? { status: "creating" }
      : { status: "loading", roomId: gameId },
  );
  const [logSink, setLogSinkHandle] = useState<QuestLogSinkHandle | null>(null);

  const readyRoomId = gateState.status === "ready" ? gateState.roomId : null;

  // Re-sync when the `?game=` prop changes (e.g. a client-side navigation).
  useEffect(() => {
    setActiveRoomId(gameId);
    setGateState(
      gameId === null
        ? { status: "creating" }
        : { status: "loading", roomId: gameId },
    );
  }, [gameId]);

  const handleCreateGame = useCallback(async (): Promise<void> => {
    setGateState({ status: "creating" });
    try {
      const roomId = await createAndNavigateToRoom(
        db,
        localContentConfig,
        frontDoorEntry,
      );
      setActiveRoomId(roomId);
      setGateState({ status: "loading", roomId });
    } catch (error) {
      setGateState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to create game.",
      });
    }
  }, [db, frontDoorEntry, localContentConfig]);

  // Auto-create a room when no `?game=` is present so the coop entry always
  // lands on a room. Fires once per mount; once it navigates to `?game=<id>`
  // a reload resumes that room instead of creating another.
  useEffect(() => {
    if (gameId !== null || autoCreateFiredRef.current) {
      return;
    }
    autoCreateFiredRef.current = true;
    void handleCreateGame();
  }, [gameId, handleCreateGame]);

  // Subscribe to the room log. The first decoded node carries genesis, which
  // decides ready vs. version-gate. `subscribeToLog` emits nothing while the
  // node is null (room not yet created / missing), so a deadline surfaces an
  // unreachable state rather than spinning forever.
  useEffect(() => {
    if (activeRoomId === null) {
      return undefined;
    }

    setGateState({ status: "loading", roomId: activeRoomId });

    let resolved = false;
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        setGateState({ status: "unreachable", roomId: activeRoomId });
      }
    }, ROOM_LOAD_TIMEOUT_MS);

    const unsubscribe = subscribeToLog(
      db,
      activeRoomId,
      (node: LogNode) => {
        resolved = true;
        clearTimeout(timeoutId);
        // Gate order: a reducer-version mismatch (a deploy landed) is fatal and
        // checked first. A content-config mismatch is recoverable — the client
        // can adopt the room's pinned params — so it gates only when the version
        // matches. A genesis missing `contentConfig` (never written by this
        // build) is treated as a mismatch.
        const status = gateStatusFor(node.genesis, localContentConfig);
        setGateState({ status, roomId: activeRoomId, genesis: node.genesis });
      },
      () => {
        // The room exists but its log node is unreadable (corrupt genesis /
        // snapshot). There is no safe fold, so surface a terminal state.
        resolved = true;
        clearTimeout(timeoutId);
        setGateState({ status: "unreadable", roomId: activeRoomId });
      },
    );

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [activeRoomId, db, localContentConfig]);

  // Write this client's presence once the room is ready.
  useEffect(() => {
    if (readyRoomId === null) {
      return undefined;
    }
    const handleError = (error: unknown): void => {
      setGateState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to write presence.",
      });
    };
    try {
      const maybeCleanup: unknown = writePresence(
        db,
        readyRoomId,
        clientId,
        undefined,
        handleError,
      );
      if (typeof maybeCleanup !== "function") {
        return undefined;
      }
      const cleanup = maybeCleanup as () => void;
      return cleanup;
    } catch (error) {
      handleError(error);
      return undefined;
    }
  }, [db, readyRoomId, clientId]);

  // Install the quest-log sink for the ready room: stamps `gameId` onto every
  // log event, mirrors the log into `rooms/{id}/logs`, and exposes the coop
  // record helpers the CoopProvider wires to the LogClient callbacks. A
  // `visibilitychange` flush captures the tail when the tab is backgrounded.
  useEffect(() => {
    if (readyRoomId === null) {
      setLogSinkHandle(null);
      return undefined;
    }

    const handle = installQuestLogSink(db, { gameId: readyRoomId, clientId });
    setLogSinkHandle(handle);

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        void handle.flushNow();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void handle.dispose();
      setLogSinkHandle(null);
    };
  }, [db, readyRoomId, clientId]);

  if (gateState.status === "versionGate") {
    return <VersionGateScreen db={db} contentConfig={localContentConfig} />;
  }

  if (gateState.status === "unreadable") {
    return <UnreadableRoomScreen db={db} contentConfig={localContentConfig} />;
  }

  if (gateState.status === "configGate") {
    return (
      <ConfigGateScreen
        roomContentConfig={
          gateState.genesis.contentConfig
        }
        localContentConfig={localContentConfig}
      />
    );
  }

  if (gateState.status === "ready") {
    // Wait for the sink install effect to publish the handle before mounting
    // children so the ready context is complete.
    if (logSink === null || readyRoomId !== gateState.roomId) {
      return (
        <ApplicationStateScreen
          view={{
            kind: "loading",
            title: "Joining Game",
            message: `Preparing ${gateState.roomId}.`,
            busyLabel: "Joining Game",
          }}
        />
      );
    }
    return (
      children({
          db,
          roomId: gateState.roomId,
          clientId,
          genesis: gateState.genesis,
          logSink,
        })
    );
  }

  if (gateState.status === "creating") {
    return (
      <ApplicationStateScreen
        view={{
          kind: "roomCreation",
          title: "Creating Game",
          message: "We are preparing a shared dream.",
          busyLabel: "Creating Game",
        }}
      />
    );
  }

  if (gateState.status === "loading") {
    return (
      <ApplicationStateScreen
        view={{
          kind: "loading",
          title: "Joining Game",
          message: `Loading ${gateState.roomId}.`,
          busyLabel: "Joining Game",
        }}
      />
    );
  }

  if (gateState.status === "unreachable") {
    return (
      <ApplicationStateScreen
        view={{
          kind: "unreachableRoom",
          title: "Game Not Found",
          message: `Could not load ${gateState.roomId}. The game may not exist, or the database is unreachable.`,
          actions: [{
            id: "primary",
            label: "Create New Game",
            onPress: () => void handleCreateGame(),
          }],
        }}
      />
    );
  }

  return (
    <ApplicationStateScreen
      view={{
        kind: "recoverableError",
        title: "Something Went Wrong",
        message: "The game could not finish its room setup.",
        detail: gateState.message,
        actions: [{
          id: "primary",
          label: "Try Again",
          onPress: () => void handleCreateGame(),
        }],
      }}
    />
  );
}
