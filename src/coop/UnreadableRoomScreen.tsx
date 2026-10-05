import { useCallback, useState, type ReactNode } from "react";
import { ApplicationStateScreen } from "../cumulus/screens/ApplicationStateScreen";
import type { Database } from "firebase/database";
import type { PinnedContentConfig } from "../eventlog/types";
import { createAndNavigateToRoom } from "./RoomGate";
import { recoveryUrlFromLocation } from "./room-recovery-url";
import { logEvent } from "../logging";

interface UnreadableRoomScreenProps {
  db: Database;
  /** Content config pinned into the fresh room this screen creates. */
  contentConfig: PinnedContentConfig;
}

/** Controller for a terminal unreadable room; room creation remains external. */
export function UnreadableRoomScreen({
  db,
  contentConfig,
}: UnreadableRoomScreenProps): ReactNode {
  const [status, setStatus] = useState<"idle" | "creating" | "error">("idle");

  const handleStartNewGame = useCallback(() => {
    setStatus("creating");
    void createAndNavigateToRoom(db, contentConfig)
      .then(() => window.location.reload())
      .catch(() => {
        setStatus("error");
      });
  }, [db, contentConfig]);

  const handleRecoverGame = useCallback(() => {
    const recoveryUrl = recoveryUrlFromLocation(window.location.href);
    if (recoveryUrl === null) return;
    logEvent("room_recovery_requested", {
      source: "unreadable_room",
      recoveryUrl,
    });
    window.location.assign(recoveryUrl);
  }, []);

  return (
    <ApplicationStateScreen
      view={{
        kind: "unreadableRoom",
        title: "This Game Could Not Be Read",
        message:
          "This game’s data cannot be loaded safely. Start a fresh game to keep playing.",
        actions: [
          {
            id: "primary",
            label: "Recover Game",
            onPress: handleRecoverGame,
          },
          {
            id: "secondary",
            label: status === "creating" ? "Starting…" : "Create New Game",
            disabled: status === "creating",
            onPress: handleStartNewGame,
          },
        ],
      }}
    />
  );
}
