import { useEffect, useRef, useState, type ReactNode } from "react";
import { logEvent } from "../logging";
import { useRoomRecoveryContext } from "./hooks";
import {
  buildRoomRecoveryCheckpoint,
  writeRoomRecoveryCheckpoint,
} from "./room-recovery";

/**
 * Publishes a checkpoint only after its sibling screen has rendered
 * successfully. Place this component inside the same error boundary as the
 * screen: a render failure prevents this effect from committing the bad state.
 */
export function RecoveryCheckpointCommitter({
  sourcePath,
}: {
  readonly sourcePath: string;
}): ReactNode {
  const recovery = useRoomRecoveryContext();
  const lastPublishedRef = useRef<string | null>(null);
  const inFlightRef = useRef<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (recovery === null || recovery.confirmedHead === null) return;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const checkpoint = buildRoomRecoveryCheckpoint({
      generation: recovery.confirmedGeneration,
      sourceHead: recovery.confirmedHead,
      sourcePath,
      genesis: recovery.genesis,
      state: recovery.confirmedGameState,
    });
    if (
      lastPublishedRef.current === checkpoint.checkpointId ||
      inFlightRef.current === checkpoint.checkpointId
    ) {
      return;
    }
    inFlightRef.current = checkpoint.checkpointId;
    void writeRoomRecoveryCheckpoint(recovery.db, recovery.roomId, checkpoint)
      .then((committed) => {
        if (inFlightRef.current === checkpoint.checkpointId) {
          inFlightRef.current = null;
        }
        lastPublishedRef.current = checkpoint.checkpointId;
        if (!committed) return;
        logEvent("room_recovery_checkpoint_written", {
          checkpointId: checkpoint.checkpointId,
          generation: checkpoint.generation,
          sourceHead: checkpoint.sourceHead,
          sourcePath: checkpoint.sourcePath,
          stateHash: checkpoint.stateHash,
        });
      })
      .catch((error: unknown) => {
        if (inFlightRef.current === checkpoint.checkpointId) {
          inFlightRef.current = null;
        }
        logEvent("room_recovery_checkpoint_failed", {
          checkpointId: checkpoint.checkpointId,
          generation: checkpoint.generation,
          sourceHead: checkpoint.sourceHead,
          errorKind: error instanceof Error ? error.name : "unknown",
          message: error instanceof Error ? error.message : null,
        });
        retryTimer = setTimeout(() => {
          setRetryToken((value) => value + 1);
        }, 1_000);
      });
    return () => {
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [
    recovery,
    retryToken,
    sourcePath,
  ]);

  return null;
}
