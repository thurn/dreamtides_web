// Runs the AI host for the enemy of the current journey battle's engine
// battle: one Web Worker policy host per battle, fed every fold. The AI's
// answers are intents in the log; this hook never holds game state.

import { useEffect, useMemo, useState } from "react";
import { AI } from "../../content/ai";
import { catalogManifest } from "../../engine/policy/catalog-manifest";
import { createWorkerPolicyHost, PolicyHostError, type PolicyWorker } from "../../engine/policy/host";
import type { PolicyId } from "../../engine/policy/types";
import { aiEventActor } from "../../eventlog/types";
import { logEvent } from "../../logging";
import { getBattleInitProvider } from "../../rules/battle/battle-events";
import { useActions, useClientId, useGameState } from "../../session/hooks";
import { actionsSubmitter, EngineAiDriver } from "./engine-ai-driver";

/** The browser's policy worker. */
function browserPolicyWorker(): PolicyWorker {
  if (typeof Worker === "undefined") throw new PolicyHostError("unavailable", "Web Workers are unavailable");
  return new Worker(new URL("./policy.worker.ts", import.meta.url), { type: "module" }) as unknown as PolicyWorker;
}

export function useEngineAi(policy: PolicyId): void {
  const state = useGameState();
  const actions = useActions();
  const clientId = useClientId();
  const engine = getBattleInitProvider()?.engine ?? null;
  const engineInit = state.battle?.engine?.init ?? null;
  const actor = useMemo(() => aiEventActor(clientId), [clientId]);
  const [driver, setDriver] = useState<EngineAiDriver | null>(null);

  useEffect(() => {
    if (engine === null || engineInit === null) return undefined;
    const created = new EngineAiDriver({
      side: "enemy",
      policy,
      engine,
      host: createWorkerPolicyHost({
        manifest: catalogManifest(engine.catalog, engineInit),
        createWorker: browserPolicyWorker,
        graceMs: AI.enginePolicy.workerGraceMs,
      }),
      submit: actionsSubmitter(actions, actor),
      log: (event, fields) => {
        logEvent(event, fields);
      },
      now: () => performance.now(),
    });
    setDriver(created);
    return () => {
      created.dispose();
    };
  }, [actions, actor, engine, engineInit, policy]);

  useEffect(() => {
    driver?.update(state);
  }, [driver, state]);
}
