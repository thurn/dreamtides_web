import { isMainThread, parentPort } from "node:worker_threads";
import { createEngine, type Engine } from "../../src/engine/engine";
import { manifestCatalog } from "../../src/engine/policy/catalog-manifest";
import { playGame } from "./game";
import type { WorkerRequest, WorkerReply } from "./types";

/** Wrong request order is reported; the parent decides whether to retain a failed attempt. */
export function workerHandler(): (request: WorkerRequest) => WorkerReply {
  let engine: Engine | undefined;
  return (request) => {
    try {
      if (request.kind === "boot") {
        if (engine !== undefined) throw new Error("Worker already initialized");
        engine = createEngine(manifestCatalog(request.manifest));
        return { kind: "ready" };
      }
      if (request.kind !== "game" || engine === undefined) throw new Error("Worker requires a catalog before games");
      return { kind: "game", ordinal: request.spec.ordinal, outcome: playGame(engine, request.spec, request.budgets) };
    } catch (error) {
      return { kind: "error", message: error instanceof Error ? error.message : String(error) };
    }
  };
}
if (!isMainThread) {
  const handle = workerHandler();
  parentPort?.on("message", (request: WorkerRequest) => parentPort?.postMessage(handle(request)));
}
