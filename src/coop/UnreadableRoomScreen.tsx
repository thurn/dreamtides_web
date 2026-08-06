import { useCallback, useState, type ReactNode } from "react";
import { ApplicationStateScreen } from "../cumulus/screens/ApplicationStateScreen";
import type { Database } from "firebase/database";
import type { PinnedContentConfig } from "../eventlog/types";
import { createAndNavigateToRoom } from "./RoomGate";

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
  const [message, setMessage] = useState<string | null>(null);

  const handleStartNewGame = useCallback(() => {
    setStatus("creating");
    setMessage(null);
    void createAndNavigateToRoom(db, contentConfig)
      .then(() => window.location.reload())
      .catch((error: unknown) => {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Failed to create a new game.");
      });
  }, [db, contentConfig]);

  return (
    <ApplicationStateScreen
      view={{
        kind: "unreadableRoom",
        title: "This Game Could Not Be Read",
        message:
          "This game’s data cannot be loaded safely. Start a fresh game to keep playing.",
        ...(message === null ? {} : { detail: message }),
        actions: [{
          id: "primary",
          label: status === "creating" ? "Starting…" : "Start a New Game",
          disabled: status === "creating",
          onPress: handleStartNewGame,
        }],
      }}
    />
  );
}
