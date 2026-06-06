import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Database, Unsubscribe } from "firebase/database";
import type { DatabaseMode } from "../runtime/runtime-config";
import { generateRoomId } from "./room-id";
import {
  connectedClientCount,
  createRoomEvictingStale,
  pruneRoomActionLog,
  subscribeToRoom,
  writePresence,
} from "./room-service";
import { ACTION_LOG_LIMIT, type MultiplayerRoom, type RoomSession } from "./room-types";

interface MultiplayerRoomGateProps {
  database: Database;
  gameId: string | null;
  databaseMode?: DatabaseMode;
  children: (session: RoomSession) => ReactNode;
}

type GateState =
  | { status: "create" }
  | { status: "creating" }
  | { status: "loading"; roomId: string }
  | { status: "missing"; roomId: string }
  | { status: "ready"; roomId: string; room: MultiplayerRoom }
  | { status: "error"; message: string };

function createClientId(): string {
  const cryptoSource = globalThis.crypto;

  if (typeof cryptoSource?.randomUUID === "function") {
    return `client-${cryptoSource.randomUUID()}`;
  }

  if (typeof cryptoSource?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoSource.getRandomValues(bytes);
    return `client-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  return `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function timestamp(): string {
  return new Date().toISOString();
}

function navigateToRoom(roomId: string): void {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("game", roomId);
  window.history.pushState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
}

export function MultiplayerRoomGate({
  database,
  gameId,
  databaseMode = "emulator",
  children,
}: MultiplayerRoomGateProps): ReactNode {
  const clientId = useMemo(createClientId, []);
  const presenceKeys = useRef(new Set<string>());
  const [activeRoomId, setActiveRoomId] = useState<string | null>(gameId);
  const [gateState, setGateState] = useState<GateState>(
    gameId === null ? { status: "create" } : { status: "loading", roomId: gameId },
  );
  const readyRoomId = gateState.status === "ready" ? gateState.roomId : null;

  useEffect(() => {
    setActiveRoomId(gameId);
    setGateState(gameId === null ? { status: "create" } : { status: "loading", roomId: gameId });
  }, [gameId]);

  useEffect((): Unsubscribe | undefined => {
    if (activeRoomId === null) {
      return undefined;
    }

    setGateState({ status: "loading", roomId: activeRoomId });

    return subscribeToRoom(database, activeRoomId, (snapshot) => {
      if (snapshot.status === "ready") {
        setGateState({ status: "ready", roomId: activeRoomId, room: snapshot.room });
        return;
      }

      if (snapshot.status === "missing") {
        setGateState({ status: "missing", roomId: activeRoomId });
        return;
      }

      setGateState({ status: "error", message: snapshot.message });
    });
  }, [activeRoomId, database]);

  useEffect(() => {
    if (readyRoomId === null) {
      return undefined;
    }

    const presenceKey = `${readyRoomId}:${clientId}`;
    if (presenceKeys.current.has(presenceKey)) {
      return undefined;
    }

    let isCurrent = true;
    presenceKeys.current.add(presenceKey);
    void writePresence(database, readyRoomId, clientId, timestamp()).catch((error: unknown) => {
      if (!isCurrent) {
        return;
      }

      presenceKeys.current.delete(presenceKey);
      setGateState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to write presence.",
      });
    });

    return () => {
      isCurrent = false;
    };
  }, [clientId, database, readyRoomId]);

  useEffect(() => {
    if (gateState.status !== "ready") {
      return;
    }

    const actionLog = gateState.room.actionLog ?? {};
    if (Object.keys(actionLog).length <= ACTION_LOG_LIMIT + 10) {
      return;
    }

    void pruneRoomActionLog(database, gateState.roomId).catch((error: unknown) => {
      console.error("Failed to prune multiplayer action log", error);
    });
  }, [database, gateState]);

  const handleCreateGame = useCallback(async (): Promise<void> => {
    const roomId = generateRoomId();
    setGateState({ status: "creating" });

    try {
      await createRoomEvictingStale(database, roomId, timestamp());
      navigateToRoom(roomId);
      setActiveRoomId(roomId);
      setGateState({ status: "loading", roomId });
    } catch (error) {
      setGateState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to create game.",
      });
    }
  }, [database]);

  if (gateState.status === "ready") {
    const session: RoomSession = {
      roomId: gateState.roomId,
      clientId,
      room: gateState.room,
    };

    return (
      <>
        {/*
          Presence pill is positioned fixed so it never contributes to flow
          height. Without this, the 24px line of plain text added 24px to
          document height on every screen, which broke any layout that tried
          to size itself precisely against `100vh` (notably DraftSiteScreen,
          which sized its 2x2 card grid against `calc(100vh - 48px)`).
        */}
        <div
          data-connected-count
          className="pointer-events-none fixed top-1 left-2 z-40 select-none rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider opacity-50"
          style={{
            color: "#94a3b8",
            background: "rgba(10, 6, 18, 0.55)",
            border: "1px solid rgba(124, 58, 237, 0.25)",
          }}
        >
          {connectedClientCount(gateState.room)} connected
        </div>
        {children(session)}
      </>
    );
  }

  if (gateState.status === "create") {
    return (
      <RoomShell subtitle="Quest Multiplayer">
        <CreateGameButton onClick={() => void handleCreateGame()} label="Create Game" />
      </RoomShell>
    );
  }

  if (gateState.status === "creating") {
    return (
      <RoomShell subtitle="Creating game">
        <p style={{ color: "#cbd5f5", opacity: 0.8 }}>Creating game...</p>
      </RoomShell>
    );
  }

  if (gateState.status === "loading") {
    return (
      <RoomShell subtitle="Joining game">
        <p style={{ color: "#cbd5f5", opacity: 0.8 }}>Loading {gateState.roomId}...</p>
      </RoomShell>
    );
  }

  if (gateState.status === "missing") {
    return (
      <RoomShell subtitle="Game not found">
        <CreateGameButton
          onClick={() => void handleCreateGame()}
          label="Create New Game"
          extraAttrs={{ "data-create-new-game": "true" }}
        />
      </RoomShell>
    );
  }

  return (
    <RoomShell subtitle="Firebase setup issue">
      <p style={{ color: "#fca5a5", maxWidth: "32rem", textAlign: "center" }}>{gateState.message}</p>
      <p style={{ color: "#94a3b8", maxWidth: "32rem", textAlign: "center", fontSize: "0.875rem" }}>
        {firebaseSetupHelp(databaseMode)}
      </p>
    </RoomShell>
  );
}

function firebaseSetupHelp(databaseMode: DatabaseMode): string {
  if (databaseMode === "emulator") {
    return "Run npm start to launch the Firebase Realtime Database emulator with Vite.";
  }

  return "Required env: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID.";
}

function CreateGameButton({
  onClick,
  label,
  extraAttrs,
}: {
  onClick: () => void;
  label: string;
  extraAttrs?: Record<string, string>;
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
      {...extraAttrs}
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
            background:
              "linear-gradient(135deg, #a855f7 0%, #7c3aed 40%, #c084fc 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow:
              "0 0 60px rgba(168, 85, 247, 0.4), 0 0 120px rgba(124, 58, 237, 0.2)",
            filter: "drop-shadow(0 0 40px rgba(168, 85, 247, 0.3))",
          }}
        >
          Dreamtides
        </h1>
        <p
          className="text-lg opacity-70 md:text-xl"
          style={{ color: "#e2e8f0" }}
        >
          {subtitle}
        </p>
        <div className="flex flex-col items-center gap-4">{children}</div>
      </div>
    </main>
  );
}
