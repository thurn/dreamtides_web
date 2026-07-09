import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onValue, ref, type Database } from "firebase/database";
import type { ContentConfig, Genesis, LogNode } from "../eventlog/types";
import {
  connectedClientCount,
  createRoomEvictingStale,
  generateRoomId,
  mintClientId,
  writePresence,
  type PresenceEntry,
} from "../eventlog/room";
import { subscribeToLog } from "../eventlog/subscribe";
import {
  contentConfigFromRuntime,
  contentConfigsEqual,
  type RuntimeConfig,
} from "../runtime/runtime-config";
import { getBuildHash } from "./build-hash";
import { installQuestLogSink, type QuestLogSinkHandle } from "./quest-log-sink";
import { ConfigGateScreen } from "./ConfigGateScreen";
import { VersionGateScreen } from "./VersionGateScreen";

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
  children: (context: RoomReadyContext) => ReactNode;
}

type GateState =
  | { status: "creating" }
  | { status: "loading"; roomId: string }
  | { status: "unreachable"; roomId: string }
  | { status: "ready"; roomId: string; genesis: Genesis }
  | { status: "versionGate"; roomId: string; genesis: Genesis }
  | { status: "configGate"; roomId: string; genesis: Genesis }
  | { status: "error"; message: string };

/** Fresh random seed for a new room's genesis. */
function freshSeed(): string {
  const cryptoSource = globalThis.crypto;
  if (typeof cryptoSource?.randomUUID === "function") {
    return cryptoSource.randomUUID();
  }
  const bytes = new Uint8Array(16);
  cryptoSource.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Build the genesis for a brand-new room: fresh seed, this build's hash, now,
 * and the fold-relevant content parameters pinned from this client's config so
 * every joiner folds the same content.
 */
export function createFreshGenesis(contentConfig: ContentConfig): Genesis {
  return {
    seed: freshSeed(),
    reducerVersion: getBuildHash(),
    createdAt: Date.now(),
    contentConfig,
  };
}

/** Create a fresh room and navigate the URL to `?game=<id>`; returns the id. */
export async function createAndNavigateToRoom(
  db: Database,
  contentConfig: ContentConfig,
): Promise<string> {
  const roomId = generateRoomId();
  await createRoomEvictingStale(db, roomId, createFreshGenesis(contentConfig));
  navigateToRoom(roomId);
  return roomId;
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
  window.history.pushState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
}

/**
 * Coop room gate: parse `?game=`, create/join, subscribe to the room log,
 * write presence, install the quest-log sink, and gate on
 * `genesis.reducerVersion === getBuildHash()`. On a match it renders
 * `children` with the ready room context; on a mismatch it renders the
 * read-only `VersionGateScreen`.
 */
export function RoomGate({ db, gameId, runtimeConfig, children }: RoomGateProps): ReactNode {
  const clientId = useMemo(mintClientId, []);
  const localContentConfig = useMemo(
    () => contentConfigFromRuntime(runtimeConfig),
    [runtimeConfig],
  );
  const autoCreateFiredRef = useRef(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(gameId);
  const [gateState, setGateState] = useState<GateState>(
    gameId === null ? { status: "creating" } : { status: "loading", roomId: gameId },
  );
  const [presence, setPresence] = useState<Record<string, PresenceEntry> | null>(null);
  const [logSink, setLogSinkHandle] = useState<QuestLogSinkHandle | null>(null);

  const readyRoomId = gateState.status === "ready" ? gateState.roomId : null;

  // Re-sync when the `?game=` prop changes (e.g. a client-side navigation).
  useEffect(() => {
    setActiveRoomId(gameId);
    setGateState(
      gameId === null ? { status: "creating" } : { status: "loading", roomId: gameId },
    );
  }, [gameId]);

  const handleCreateGame = useCallback(async (): Promise<void> => {
    setGateState({ status: "creating" });
    try {
      const roomId = await createAndNavigateToRoom(db, localContentConfig);
      setActiveRoomId(roomId);
      setGateState({ status: "loading", roomId });
    } catch (error) {
      setGateState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to create game.",
      });
    }
  }, [db, localContentConfig]);

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

    const unsubscribe = subscribeToLog(db, activeRoomId, (node: LogNode) => {
      resolved = true;
      clearTimeout(timeoutId);
      // Gate order: a reducer-version mismatch (a deploy landed) is fatal and
      // checked first. A content-config mismatch is recoverable — the client
      // can adopt the room's pinned params — so it gates only when the version
      // matches. A genesis missing `contentConfig` (never written by this
      // build) is treated as a mismatch.
      const status = gateStatusFor(node.genesis, localContentConfig);
      setGateState({ status, roomId: activeRoomId, genesis: node.genesis });
    });

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [activeRoomId, db, localContentConfig]);

  // Track presence for the "connected" pill.
  useEffect(() => {
    if (activeRoomId === null) {
      return undefined;
    }
    const presenceRef = ref(db, `rooms/${activeRoomId}/presence`);
    return onValue(presenceRef, (snapshot) => {
      setPresence(snapshot.val() as Record<string, PresenceEntry> | null);
    });
  }, [db, activeRoomId]);

  // Write this client's presence once the room is ready.
  useEffect(() => {
    if (readyRoomId === null) {
      return;
    }
    void writePresence(db, readyRoomId, clientId).catch((error: unknown) => {
      setGateState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to write presence.",
      });
    });
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

  if (gateState.status === "configGate") {
    return (
      <ConfigGateScreen
        roomContentConfig={gateState.genesis.contentConfig as ContentConfig | undefined}
        localContentConfig={localContentConfig}
      />
    );
  }

  if (gateState.status === "ready") {
    // Wait for the sink install effect to publish the handle before mounting
    // children so the ready context is complete.
    if (logSink === null || readyRoomId !== gateState.roomId) {
      return <RoomShell subtitle="Joining game">Loading {gateState.roomId}...</RoomShell>;
    }
    return (
      <>
        <ConnectedPill count={connectedClientCount(presence)} />
        {children({
          db,
          roomId: gateState.roomId,
          clientId,
          genesis: gateState.genesis,
          logSink,
        })}
      </>
    );
  }

  if (gateState.status === "creating") {
    return <RoomShell subtitle="Creating game">Creating game...</RoomShell>;
  }

  if (gateState.status === "loading") {
    return <RoomShell subtitle="Joining game">Loading {gateState.roomId}...</RoomShell>;
  }

  if (gateState.status === "unreachable") {
    return (
      <RoomShell subtitle="Game not found">
        <p style={{ color: "#cbd5f5", opacity: 0.8, maxWidth: "32rem", textAlign: "center" }}>
          Could not load &ldquo;{gateState.roomId}&rdquo;. The game may not exist, or the
          database is unreachable.
        </p>
        <CreateGameButton onClick={() => void handleCreateGame()} label="Create New Game" />
      </RoomShell>
    );
  }

  return (
    <RoomShell subtitle="Something went wrong">
      <p style={{ color: "#fca5a5", maxWidth: "32rem", textAlign: "center" }}>{gateState.message}</p>
    </RoomShell>
  );
}

function ConnectedPill({ count }: { count: number }): ReactNode {
  return (
    <div
      data-connected-count
      className="pointer-events-none fixed top-1 left-1/2 z-40 -translate-x-1/2 select-none rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider opacity-50"
      style={{
        color: "#94a3b8",
        background: "rgba(10, 6, 18, 0.55)",
        border: "1px solid rgba(124, 58, 237, 0.25)",
      }}
    >
      {count} connected
    </div>
  );
}

function CreateGameButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}): ReactNode {
  return (
    <button
      data-create-game="true"
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-2xl px-12 py-4 text-xl font-semibold tracking-wide transition-all duration-150 hover:-translate-y-0.5"
      style={{
        background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 55%, #c084fc 100%)",
        color: "#ffffff",
        border: "2px solid rgba(192, 132, 252, 0.6)",
        boxShadow:
          "0 12px 32px rgba(124, 58, 237, 0.4), 0 0 28px rgba(168, 85, 247, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
        textShadow: "0 1px 2px rgba(15, 8, 25, 0.35)",
      }}
    >
      {label}
    </button>
  );
}

function RoomShell({
  subtitle,
  children,
}: {
  subtitle: string;
  children: ReactNode;
}): ReactNode {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <h1
          className="text-6xl font-extrabold tracking-wide md:text-7xl"
          style={{
            background: "linear-gradient(135deg, #a855f7 0%, #7c3aed 40%, #c084fc 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow:
              "0 0 60px rgba(168, 85, 247, 0.4), 0 0 120px rgba(124, 58, 237, 0.2)",
            filter: "drop-shadow(0 0 40px rgba(168, 85, 247, 0.3))",
          }}
        >
          Dreamtides
        </h1>
        <p className="text-lg opacity-70 md:text-xl" style={{ color: "#e2e8f0" }}>
          {subtitle}
        </p>
        <div className="flex flex-col items-center gap-4">{children}</div>
      </div>
    </main>
  );
}
