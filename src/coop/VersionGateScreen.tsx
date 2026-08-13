import { useCallback, useState, type ReactNode } from "react";
import { ApplicationStateScreen } from "../cumulus/screens/ApplicationStateScreen";
import type { Database } from "firebase/database";
import type { PinnedContentConfig } from "../eventlog/types";
import { createAndNavigateToRoom } from "./RoomGate";
import { tx } from "@trox/runtime";

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

  const handleStartNewGame = useCallback(() => {
    setStatus("creating");
    void createAndNavigateToRoom(db, contentConfig)
      .then(() => window.location.reload())
      .catch(() => {
        setStatus("error");
      });
  }, [db, contentConfig]);

  return (
    <ApplicationStateScreen
      view={{
        kind: "versionGate",
        title: tx(
          "A New Version Was Deployed",
          "Title for a shared-room gate when the room uses an incompatible reducer version.",
        ),
        message: tx(
          "This game was started on an earlier build. Start a fresh game on the current version.",
          "Explanation that an incompatible shared room must be replaced with a fresh game on the current build.",
        ),
        actions: [
          {
            id: "primary",
            label:
              status === "creating"
                ? tx(
                    "Starting…",
                    "Disabled action label while a replacement shared room is being created.",
                  )
                : tx(
                    "Create New Game",
                    "Action that leaves an unavailable or incompatible room and creates a fresh shared game.",
                  ),
            disabled: status === "creating",
            onPress: handleStartNewGame,
          },
        ],
      }}
    />
  );
}
