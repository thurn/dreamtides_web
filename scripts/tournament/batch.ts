import { Worker } from "node:worker_threads";
import { loadavg, totalmem, freemem } from "node:os";
import type { CatalogManifest } from "../../src/engine/policy/catalog-manifest";
import type { GameRecord, MatchSpec, TournamentConfig, WorkerReply, WorkerRequest } from "./types";
import SETTINGS from "./catalog.json";

export interface BatchInput {
  readonly manifest: CatalogManifest;
  readonly matches: readonly MatchSpec[];
  readonly budgets: TournamentConfig["budgets"];
  readonly workers: number;
  readonly batchMs: number;
  readonly signal?: AbortSignal;
  readonly onGame: (record: GameRecord) => void;
}
/** Own and settle every worker and timer; interrupted in-flight ordinals remain eligible on resume. */
export async function runBatch(input: BatchInput) {
  if (!Number.isSafeInteger(input.workers) || input.workers < 1 || input.workers > SETTINGS.maximumWorkers || !Number.isSafeInteger(input.batchMs) || input.batchMs < 1 || input.batchMs > SETTINGS.maximumBatchMs) throw new Error("Invalid batch capacity");
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const load = { start: loadavg(), totalMemory: totalmem(), freeMemory: freemem() };
  const workers: Worker[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const active = new Map<Worker, MatchSpec>();
  let next = 0;
  let completed = 0;
  const finished = new Set<number>();
  let reason: "complete" | "deadline" | "signal" | "failure" = "complete";
  let failure: string | null = null;
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => { finish = resolve; });
  let ended = false;
  const stop = (why: typeof reason, message: string | null = null) => {
    if (ended) return;
    ended = true; reason = why; failure = message; finish();
  };
  const signal = () => stop("signal");
  input.signal?.addEventListener("abort", signal, { once: true });
  if (input.signal?.aborted === true) stop("signal");
  const deadline = setTimeout(() => stop("deadline"), input.batchMs);
  process.on("SIGINT", signal); process.on("SIGTERM", signal);
  const send = (worker: Worker) => {
    if (ended) return;
    const spec = input.matches[next++];
    if (spec === undefined) {
      if (active.size === 0) stop("complete");
      return;
    }
    active.set(worker, spec);
    const request: WorkerRequest = { kind: "game", spec, budgets: input.budgets };
    worker.postMessage(request);
  };
  try {
    if (input.matches.length === 0) stop("complete");
    for (let index = 0; !ended && index < Math.min(input.workers, input.matches.length); index++) {
      const worker = new Worker(new URL("./worker-bootstrap.mjs", import.meta.url));
      workers.push(worker);
      let ready = false;
      const bootTimer = setTimeout(() => stop("failure", "Worker catalog boot timed out"), Math.min(SETTINGS.workerBootMs, input.batchMs));
      timers.add(bootTimer);
      worker.on("message", (reply: WorkerReply) => {
        try {
          if (ended) return;
          if (reply.kind === "ready" && !ready) {
            ready = true; clearTimeout(bootTimer); send(worker); return;
          }
          if (reply.kind === "error") { stop("failure", reply.message); return; }
          const spec = active.get(worker);
          if (!ready || reply.kind !== "game" || spec === undefined || reply.ordinal !== spec.ordinal) throw new Error("Worker reply does not match active request");
          input.onGame({ event: "tournament.game", timestamp: new Date().toISOString(), ordinal: spec.ordinal, spec, outcome: reply.outcome });
          active.delete(worker);
          if (reply.outcome.status === "failed") { stop("failure", reply.outcome.failure); return; }
          completed++; finished.add(spec.ordinal); send(worker);
        } catch (error) { stop("failure", error instanceof Error ? error.message : String(error)); }
      });
      worker.on("error", (error: unknown) => stop("failure", error instanceof Error ? error.message : String(error)));
      worker.on("exit", (code) => { if (!ended) stop("failure", `Worker exited before shutdown (${String(code)})`); });
      worker.postMessage({ kind: "boot", manifest: input.manifest } satisfies WorkerRequest);
    }
    await done;
  } finally {
    clearTimeout(deadline);
    for (const timer of timers) clearTimeout(timer);
    input.signal?.removeEventListener("abort", signal);
    process.off("SIGINT", signal); process.off("SIGTERM", signal);
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
  return { startedAt, endedAt: new Date().toISOString(), elapsedMs: performance.now() - started, reason: reason as "complete" | "deadline" | "signal" | "failure", failure,
    workers: workers.length, completed, unfinishedOrdinals: input.matches.filter((match) => !finished.has(match.ordinal)).map((match) => match.ordinal), host: { ...load, end: loadavg(), freeMemoryEnd: freemem() } };
}
