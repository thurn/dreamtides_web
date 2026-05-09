import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Database, Unsubscribe } from "firebase/database";
import { pruneActionLog } from "./action-log";
import { generateRoomId } from "./room-id";
import { createRoom, subscribeToRoom, writePresence, writeRoomUpdate } from "./room-service";
import { roomPath } from "./room-paths";
import { ACTION_LOG_LIMIT, type MultiplayerRoom, type RoomSession } from "./room-types";

interface MultiplayerRoomGateProps {
  database: Database;
  gameId: string | null;
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

function connectedCount(room: MultiplayerRoom): number {
  return Object.values(room.presence ?? {}).filter((entry) => entry.connected).length;
}

export function MultiplayerRoomGate({
  database,
  gameId,
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

    void writeRoomUpdate(database, {
      [`${roomPath(gateState.roomId)}/actionLog`]: pruneActionLog(actionLog),
    }).catch((error: unknown) => {
      console.error("Failed to prune multiplayer action log", error);
    });
  }, [database, gateState]);

  const handleCreateGame = useCallback(async (): Promise<void> => {
    const roomId = generateRoomId();
    setGateState({ status: "creating" });

    try {
      await createRoom(database, roomId, timestamp());
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
        <div data-connected-count>{connectedCount(gateState.room)} connected</div>
        {children(session)}
      </>
    );
  }

  if (gateState.status === "create") {
    return (
      <RoomShell title="Quest Multiplayer">
        <button data-create-game="true" type="button" onClick={() => void handleCreateGame()}>
          Create Game
        </button>
      </RoomShell>
    );
  }

  if (gateState.status === "creating") {
    return <RoomShell title="Creating game">Creating game...</RoomShell>;
  }

  if (gateState.status === "loading") {
    return <RoomShell title="Joining game">Loading {gateState.roomId}...</RoomShell>;
  }

  if (gateState.status === "missing") {
    return (
      <RoomShell title="Game not found">
        <button
          data-create-game="true"
          data-create-new-game="true"
          type="button"
          onClick={() => void handleCreateGame()}
        >
          Create New Game
        </button>
      </RoomShell>
    );
  }

  return (
    <RoomShell title="Firebase setup issue">
      <p>{gateState.message}</p>
      <p>
        Required env: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN,
        VITE_FIREBASE_DATABASE_URL, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID.
      </p>
    </RoomShell>
  );
}

function RoomShell({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <main>
      <h1>{title}</h1>
      <div>{children}</div>
    </main>
  );
}
