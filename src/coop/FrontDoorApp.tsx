import { useMemo, type ReactNode } from "react";
import type { Database } from "firebase/database";
import { FrontDoorRouter } from "../components/FrontDoorRouter";
import { getFirebaseDatabase } from "../firebase/app-config";
import type { RuntimeConfig } from "../runtime/runtime-config";
import { FrontDoorProvider } from "../state/front-door-context";
import { CoopProvider } from "./hooks";
import { RoomGate } from "./RoomGate";

export type FrontDoorEntry = "main" | "loading" | "tutorial";

interface FrontDoorAppProps {
  runtimeConfig: RuntimeConfig;
  entry: FrontDoorEntry;
}

/** Firebase-backed runtime shared by the standalone front-door endpoints. */
export default function FrontDoorApp({
  runtimeConfig,
  entry,
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
      <main className="flex min-h-screen items-center justify-center p-8">
        <div role="alert" className="max-w-xl text-center">
          <h1 className="text-2xl font-semibold">Firebase setup issue</h1>
          <p className="mt-3 opacity-80">{databaseResult.error}</p>
        </div>
      </main>
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
            <FrontDoorRouter />
          </FrontDoorProvider>
        </CoopProvider>
      )}
    </RoomGate>
  );
}
