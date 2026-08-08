import { useCallback, useState, type ReactNode } from "react";
import { ApplicationStateScreen } from "../cumulus/screens/ApplicationStateScreen";
import type { Database } from "firebase/database";
import type { PinnedContentConfig } from "../eventlog/types";
import { createAndNavigateToRoom } from "./RoomGate";
import { createMessageDescriptor } from "../data/localization-descriptors";

interface VersionGateScreenProps {
  db: Database;
  /** Content config pinned into the fresh room this screen creates. */
  contentConfig: PinnedContentConfig;
}

/** Controller for the terminal reducer-version gate. */
export function VersionGateScreen({
  db,
  contentConfig,
}: VersionGateScreenProps): ReactNode {
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
        kind: "versionGate",
        title: createMessageDescriptor("coop-version-gate-title"),
        message: createMessageDescriptor("coop-version-gate-message"),
        ...(message === null ? {} : { detail: message }),
        actions: [{
          id: "primary",
          label:
            status === "creating"
              ? createMessageDescriptor("coop-starting-new-game-action")
              : createMessageDescriptor("coop-create-new-game-action"),
          disabled: status === "creating",
          onPress: handleStartNewGame,
        }],
      }}
    />
  );
}
