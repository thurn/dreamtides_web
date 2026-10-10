/**
 * Policy hosts: where a `PolicyRequest` is answered. Live play uses the Web
 * Worker host, so no policy runs on the main thread; tests and fallbacks use
 * the inline host.
 *
 * The worker host never hangs a decision. A request fails when the worker
 * reports an error, crashes, or has not answered by the request's
 * wall-clock budget plus a grace period; the host then discards that worker
 * (and fails its other requests), and the next request starts a fresh one.
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
    readonly reason: "workerError" | "policyError" | "timeout" | "disposed" | "unavailable",
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

export interface WorkerPolicyHostOptions {
  readonly manifest: CatalogManifest;
  readonly createWorker: () => PolicyWorker;
  /** How long past a request's wall-clock budget the host waits. */
  readonly graceMs: number;
  readonly timers?: Timers;
}

interface InFlightRequest {
  readonly resolve: (result: PolicyResult) => void;
  readonly reject: (error: PolicyHostError) => void;
  readonly timer: unknown;
}

export function createWorkerPolicyHost(options: WorkerPolicyHostOptions): PolicyHost {
  const timers = options.timers ?? GLOBAL_TIMERS;
  const inFlight = new Map<number, InFlightRequest>();
  let worker: PolicyWorker | null = null;
  let nextId = 1;
  let disposed = false;

  function settle(id: number): InFlightRequest | undefined {
    const request = inFlight.get(id);
    if (request === undefined) return undefined;
    inFlight.delete(id);
    timers.clear(request.timer);
    return request;
  }

  /** Discards the worker and fails every request it holds. */
  function discard(error: PolicyHostError): void {
    worker?.terminate();
    worker = null;
    for (const id of [...inFlight.keys()]) settle(id)?.reject(error);
  }

  function started(): PolicyWorker {
    if (worker !== null) return worker;
    const created = options.createWorker();
    created.onmessage = ({ data }) => {
      const request = settle(data.id);
      if (request === undefined) return;
      if (data.type === "decided") request.resolve(data.result);
      else request.reject(new PolicyHostError("policyError", data.message));
    };
    created.onerror = (event) => {
      discard(new PolicyHostError("workerError", event.message ?? "The policy worker crashed"));
    };
    created.postMessage({ type: "init", manifest: options.manifest });
    worker = created;
    return created;
  }

  return {
    decide(request) {
      if (disposed) return Promise.reject(new PolicyHostError("disposed", "The policy host is disposed"));
      return new Promise<PolicyResult>((resolve, reject) => {
        let target: PolicyWorker;
        try {
          target = started();
        } catch (error) {
          reject(error instanceof PolicyHostError ? error : new PolicyHostError("unavailable", String(error)));
          return;
        }
        const id = nextId;
        nextId += 1;
        const timer = timers.set(() => {
          if (inFlight.has(id)) discard(new PolicyHostError("timeout", `No answer to decision ${request.key}`));
        }, (request.budget.wallClockMs ?? 0) + options.graceMs);
        inFlight.set(id, { resolve, reject, timer });
        target.postMessage({ type: "decide", id, request });
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
