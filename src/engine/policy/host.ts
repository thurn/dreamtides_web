/**
 * Policy hosts: where a `PolicyRequest` is answered. Live play uses the Web
 * Worker host, so no policy runs on the main thread; tests and fallbacks use
 * the inline host.
 *
 * The worker host boots its worker when it is created, so a battle's first
 * decision finds it warm. A boot is a handshake (`worker-protocol.ts`): the
 * worker reports `loaded`, the host sends `init`, and the worker reports
 * `ready`. The host holds each decision until the worker is ready, and the
 * decision's deadline (its wall-clock budget plus a grace period) runs from
 * when it is sent, so a slow boot never counts against a decision; a boot
 * has a deadline of its own.
 *
 * The worker host never hangs a decision. A request fails when the worker
 * reports an error, crashes, fails to boot, or misses its deadline; the host
 * then discards that worker and fails its other requests. After a missed
 * deadline it boots a replacement at once, so the next decision is answered
 * by a warm worker; after a crash or failed boot, the next decision starts a
 * fresh worker. Replies and errors from a discarded worker are ignored.
 */
import type { Engine } from "../engine";
import type { CatalogManifest } from "./catalog-manifest";
import { runPolicy, type PolicyRequest } from "./decide";
import type { PolicyResult } from "./types";
import type { PolicyWorkerMessage, PolicyWorkerReply } from "./worker-protocol";

export interface PolicyHost {
  decide(request: PolicyRequest): Promise<PolicyResult>;
  /** Fails every request in flight and releases the worker. */
  dispose(): void;
}

/** Why a host failed a request. */
export class PolicyHostError extends Error {
  constructor(
    readonly reason: "workerError" | "policyError" | "timeout" | "bootTimeout" | "disposed" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}

/** The part of a `Worker` the host uses. */
export interface PolicyWorker {
  postMessage(message: PolicyWorkerMessage): void;
  terminate(): void;
  onmessage: ((event: { readonly data: PolicyWorkerReply }) => void) | null;
  onerror: ((event: { readonly message?: string }) => void) | null;
}

export interface Timers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const GLOBAL_TIMERS: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Why the host started a worker: when the host was created, to replace one
 * that missed a deadline, or for a decision that found no worker (after a
 * crash or a failed boot).
 */
export type WorkerBootCause = "initial" | "replacement" | "demand";

/** One worker boot's outcome, for the log. */
export interface WorkerBoot {
  /** The worker's ordinal in its host, from 1. */
  readonly worker: number;
  readonly cause: WorkerBootCause;
  readonly outcome: "ready" | "failed" | "timeout";
  /** Milliseconds from starting the worker to the outcome. */
  readonly ms: number;
  readonly message?: string;
}

export interface WorkerPolicyHostOptions {
  readonly manifest: CatalogManifest;
  readonly createWorker: () => PolicyWorker;
  /** How long past a request's wall-clock budget the host waits. */
  readonly graceMs: number;
  /** How long a worker may take to boot before the host gives up on it. */
  readonly bootTimeoutMs: number;
  readonly timers?: Timers;
  /** The clock boot times are measured on. */
  readonly now: () => number;
  /** Receives each boot's outcome (not a boot the host's disposal ends). */
  readonly onBoot?: (boot: WorkerBoot) => void;
}

interface InFlightRequest {
  readonly resolve: (result: PolicyResult) => void;
  readonly reject: (error: PolicyHostError) => void;
  readonly request: PolicyRequest;
  /** The request's wall-clock budget plus grace. */
  readonly deadlineMs: number;
  /** The deadline's timer, armed when the request is sent to a ready worker. */
  timer: { readonly handle: unknown } | null;
}

interface RunningWorker {
  readonly worker: PolicyWorker;
  readonly ordinal: number;
  readonly cause: WorkerBootCause;
  readonly startedAt: number;
  /** Loading its modules, building its engine after `init`, or ready. */
  phase: "loading" | "initializing" | "ready";
  bootTimer: unknown;
}

export function createWorkerPolicyHost(options: WorkerPolicyHostOptions): PolicyHost {
  const timers = options.timers ?? GLOBAL_TIMERS;
  const { now } = options;
  const inFlight = new Map<number, InFlightRequest>();
  let current: RunningWorker | null = null;
  let started = 0;
  let nextId = 1;
  let disposed = false;

  function settle(id: number): InFlightRequest | undefined {
    const request = inFlight.get(id);
    if (request === undefined) return undefined;
    inFlight.delete(id);
    if (request.timer !== null) timers.clear(request.timer.handle);
    return request;
  }

  /** Sends a request to the ready worker and starts its deadline. */
  function send(running: RunningWorker, id: number, entry: InFlightRequest): void {
    const handle = timers.set(() => {
      if (!inFlight.has(id)) return;
      discard(new PolicyHostError("timeout", `No answer to decision ${entry.request.key}`));
      boot("replacement");
    }, entry.deadlineMs);
    entry.timer = { handle };
    running.worker.postMessage({ type: "decide", id, request: entry.request });
  }

  function booted(running: RunningWorker, outcome: WorkerBoot["outcome"], message?: string): void {
    timers.clear(running.bootTimer);
    options.onBoot?.({
      worker: running.ordinal,
      cause: running.cause,
      outcome,
      ms: now() - running.startedAt,
      ...(message === undefined ? {} : { message }),
    });
  }

  /** Discards the current worker and fails every request it holds. */
  function discard(error: PolicyHostError): void {
    const running = current;
    current = null;
    if (running !== null) {
      timers.clear(running.bootTimer);
      running.worker.terminate();
    }
    for (const id of [...inFlight.keys()]) settle(id)?.reject(error);
  }

  /** Starts a worker; throws when none can start. */
  function start(cause: WorkerBootCause): RunningWorker {
    const worker = options.createWorker();
    started += 1;
    const running: RunningWorker = { worker, ordinal: started, cause, startedAt: now(), phase: "loading", bootTimer: undefined };
    worker.onmessage = ({ data }) => {
      if (current !== running) return;
      switch (data.type) {
        case "loaded":
          if (running.phase !== "loading") return;
          running.phase = "initializing";
          worker.postMessage({ type: "init", manifest: options.manifest });
          return;
        case "ready":
          if (running.phase !== "initializing") return;
          running.phase = "ready";
          booted(running, "ready");
          for (const [id, entry] of inFlight) if (entry.timer === null) send(running, id, entry);
          return;
        case "initFailed":
          booted(running, "failed", data.message);
          discard(new PolicyHostError("workerError", data.message));
          return;
        case "decided":
          settle(data.id)?.resolve(data.result);
          return;
        case "failed":
          settle(data.id)?.reject(new PolicyHostError("policyError", data.message));
          return;
      }
    };
    worker.onerror = (event) => {
      if (current !== running) return;
      const message = event.message ?? "The policy worker crashed";
      if (running.phase !== "ready") booted(running, "failed", message);
      discard(new PolicyHostError("workerError", message));
    };
    running.bootTimer = timers.set(() => {
      if (current !== running || running.phase === "ready") return;
      booted(running, "timeout");
      discard(new PolicyHostError("bootTimeout", "The policy worker did not start"));
    }, options.bootTimeoutMs);
    current = running;
    return running;
  }

  /** Starts a worker ahead of the next decision, which starts one itself if this fails. */
  function boot(cause: WorkerBootCause): void {
    if (disposed || current !== null) return;
    try {
      start(cause);
    } catch {
      // The next decision tries again and reports the failure.
    }
  }

  boot("initial");

  return {
    decide(request) {
      if (disposed) return Promise.reject(new PolicyHostError("disposed", "The policy host is disposed"));
      return new Promise<PolicyResult>((resolve, reject) => {
        let running: RunningWorker;
        try {
          running = current ?? start("demand");
        } catch (error) {
          reject(error instanceof PolicyHostError ? error : new PolicyHostError("unavailable", String(error)));
          return;
        }
        const id = nextId;
        nextId += 1;
        const entry: InFlightRequest = {
          resolve,
          reject,
          request,
          deadlineMs: (request.budget.wallClockMs ?? 0) + options.graceMs,
          timer: null,
        };
        inFlight.set(id, entry);
        if (running.phase === "ready") send(running, id, entry);
      });
    },
    dispose() {
      disposed = true;
      discard(new PolicyHostError("disposed", "The policy host is disposed"));
    },
  };
}

/** Runs each request on the calling thread. */
export function createInlinePolicyHost(engine: Engine, now?: () => number): PolicyHost {
  return {
    decide: (request) => {
      try {
        return Promise.resolve(runPolicy(engine, request, now));
      } catch (error) {
        return Promise.reject(new PolicyHostError("policyError", error instanceof Error ? error.message : String(error)));
      }
    },
    dispose: () => undefined,
  };
}
