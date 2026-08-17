import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { tx } from "@trox/runtime";
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
          title: tx(
            "Game Recovery Link Required",
            "[coop] Title when the cold shared-room recovery entrypoint has no valid room id.",
          ),
          message: tx(
            "Open recovery from a shared game link.",
            "[coop] Explanation that cold recovery requires a valid shared-room URL.",
          ),
          detail: tx(
            "The recovery URL must include the game id.",
            "[coop] Guidance when the cold recovery URL has no valid shared-room identity.",
          ),
        }}
      />
    );
  }

  if (status.kind === "error") {
    return (
      <ApplicationStateScreen
        view={{
          kind: "recoverableError",
          title: tx(
            "Game Recovery Failed",
            "[coop] Title when the cold shared-room recovery entrypoint cannot restore its checkpoint.",
          ),
          message: tx(
            "The shared game could not be restored.",
            "[coop] Explanation that cold shared-room recovery did not complete.",
          ),
          detail: tx(
            "Retry recovery. If it still fails, preserve the game URL and diagnostic log for repair.",
            "[coop] Guidance after cold shared-room recovery fails.",
          ),
          actions: [
            {
              id: "primary",
              label: tx(
                "Retry Recovery",
                "[coop] Action that retries cold shared-room recovery.",
              ),
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
            ? tx(
                "Game Recovered",
                "[coop] Title after the shared room has been restored and before navigation resumes it.",
              )
            : tx(
                "Recovering Shared Game",
                "[coop] Status while the cold recovery entrypoint restores the room checkpoint for every player.",
              ),
        message: tx(
          "Restoring the latest verified checkpoint for every player.",
          "[coop] Status explaining that cold recovery applies to the whole shared room.",
        ),
        busyLabel: tx(
          "Recovering Shared Game",
          "[coop] Status while the cold recovery entrypoint restores the room checkpoint for every player.",
        ),
      }}
    />
  );
}
