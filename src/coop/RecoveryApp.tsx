import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApplicationStateScreen } from "../cumulus/screens/ApplicationStateScreen";
import { getFirebaseDatabase } from "../firebase/app-config";
import { logEvent } from "../logging";
import { parseRuntimeConfig } from "../runtime/runtime-config";
import {
  recoverRoomToLatestCheckpoint,
  recoveredRoomUrl,
} from "./room-recovery";

type RecoveryStatus =
  | { readonly kind: "recovering" }
  | { readonly kind: "redirecting" }
  | { readonly kind: "error" };

/** Cold shared-room recovery entrypoint mounted only for `/recover`. */
export default function RecoveryApp(): ReactNode {
  const runtimeConfig = parseRuntimeConfig(window.location.search);
  const roomId = runtimeConfig.gameId;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<RecoveryStatus>(() =>
    roomId === null
      ? { kind: "error" }
      : { kind: "recovering" },
  );
  const activeAttemptRef = useRef(0);

  useEffect(() => {
    if (roomId === null) return;
    const token = activeAttemptRef.current + 1;
    activeAttemptRef.current = token;
    setStatus({ kind: "recovering" });
    let database;
    try {
      database = getFirebaseDatabase(runtimeConfig.databaseMode);
    } catch (error) {
      logEvent("room_recovery_failed", {
        roomId,
        detail: error instanceof Error ? error.message : "Firebase initialization failed.",
      });
      setStatus({ kind: "error" });
      return;
    }
    void recoverRoomToLatestCheckpoint(database, roomId)
      .then((result) => {
        if (activeAttemptRef.current !== token) return;
        logEvent("room_recovery_completed", {
          checkpointId: result.checkpoint.checkpointId,
          generation: result.generation,
          recovered: result.recovered,
          roomId,
          sourceHead: result.checkpoint.sourceHead,
          sourcePath: result.checkpoint.sourcePath,
          stateHash: result.checkpoint.stateHash,
        });
        setStatus({ kind: "redirecting" });
        window.location.replace(
          recoveredRoomUrl(
            roomId,
            runtimeConfig.databaseMode,
            result.checkpoint,
          ),
        );
      })
      .catch((error: unknown) => {
        if (activeAttemptRef.current !== token) return;
        const detail =
          error instanceof Error ? error.message : "Recovery failed.";
        logEvent("room_recovery_failed", { roomId, detail });
        setStatus({ kind: "error" });
      });
  }, [attempt, roomId, runtimeConfig.databaseMode]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (roomId === null) {
    return (
      <ApplicationStateScreen
        view={{
          kind: "fatalConfiguration",
          title: "Game Recovery Link Required",
          message: "Open recovery from a shared game link.",
          detail: "The recovery URL must include the game id.",
        }}
      />
    );
  }

  if (status.kind === "error") {
    return (
      <ApplicationStateScreen
        view={{
          kind: "recoverableError",
          title: "Game Recovery Failed",
          message: "The shared game could not be restored.",
          detail: "Retry recovery. If it still fails, preserve the game URL and diagnostic log for repair.",
          actions: [
            {
              id: "primary",
              label: "Retry Recovery",
              onPress: retry,
            },
          ],
        }}
      />
    );
  }

  return (
    <ApplicationStateScreen
      view={{
        kind: "loading",
        title:
          status.kind === "redirecting"
            ? "Game Recovered"
            : "Recovering Shared Game",
        message: "Restoring the latest verified checkpoint for every player.",
        busyLabel: "Recovering Shared Game",
      }}
    />
  );
}
