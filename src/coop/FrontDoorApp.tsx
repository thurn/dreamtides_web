import { useMemo, type ReactNode } from "react";
import type { Database } from "firebase/database";
import { FrontDoorRouter } from "../components/FrontDoorRouter";
import { ApplicationStateScreen } from "../cumulus/screens/ApplicationStateScreen";
import { getFirebaseDatabase } from "../firebase/app-config";
import type { RuntimeConfig } from "../runtime/runtime-config";
import { FrontDoorProvider } from "../state/front-door-context";
import { CoopProvider } from "./hooks";
import { RoomGate } from "./RoomGate";

export type FrontDoorEntry = "main" | "loading" | "tutorial";

interface FrontDoorAppProps {
  runtimeConfig: RuntimeConfig;
  entry: FrontDoorEntry;
  directTutorialBattle?: boolean;
}

/** Firebase-backed runtime shared by the standalone front-door endpoints. */
export default function FrontDoorApp({
  runtimeConfig,
  entry,
  directTutorialBattle = false,
}: FrontDoorAppProps): ReactNode {
  const databaseResult = useMemo<
    { database: Database; error: null } | { database: null; error: string }
  >(() => {
    try {
      return {
        database: getFirebaseDatabase(runtimeConfig.databaseMode),
        error: null,
      };
    } catch (error) {
      return {
        database: null,
        error:
          error instanceof Error
            ? error.message
            : "Failed to initialize Firebase.",
      };
    }
  }, [runtimeConfig.databaseMode]);

  if (databaseResult.database === null) {
    return (
      <ApplicationStateScreen view={{
        kind: "fatalConfiguration",
        title: "Firebase Setup Issue",
        message: "This browser could not connect to the quest service.",
        detail: databaseResult.error,
      }} />
    );
  }

  return (
    <RoomGate
      db={databaseResult.database}
      gameId={runtimeConfig.gameId}
      runtimeConfig={runtimeConfig}
      frontDoorEntry={entry}
    >
      {(context) => (
        <CoopProvider context={context}>
          <FrontDoorProvider>
            <FrontDoorRouter
              tutorialPlaybackSpeed={runtimeConfig.tutorialPlaybackSpeed ?? 1}
              directTutorialBattle={directTutorialBattle}
            />
          </FrontDoorProvider>
        </CoopProvider>
      )}
    </RoomGate>
  );
}
