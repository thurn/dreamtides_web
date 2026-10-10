/**
 * The policy worker's message protocol. The worker posts `loaded` once its
 * message handler is installed: a message that reaches a module worker while
 * its modules are still evaluating can be lost (seen in development builds),
 * so the host sends nothing before it. The host then sends `init` with the
 * battle's catalog manifest, and the worker answers `ready` once its engine
 * is built (or `initFailed`); only then does the host send one `decide` per
 * decision, and the worker answers each with its id.
 */
import { createEngine, type Engine } from "../engine";
import { manifestCatalog, type CatalogManifest } from "./catalog-manifest";
import { runPolicy, type PolicyRequest } from "./decide";
import type { PolicyResult } from "./types";

export type PolicyWorkerMessage =
  | { readonly type: "init"; readonly manifest: CatalogManifest }
  | { readonly type: "decide"; readonly id: number; readonly request: PolicyRequest };

export type PolicyWorkerReply =
  | { readonly type: "loaded" }
  | { readonly type: "ready" }
  | { readonly type: "initFailed"; readonly message: string }
  | { readonly type: "decided"; readonly id: number; readonly result: PolicyResult }
  | { readonly type: "failed"; readonly id: number; readonly message: string };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The worker's message handler: builds its engine on `init` and runs the
 * requested policy on each `decide`. A manifest it cannot build gets
 * `initFailed`, and a policy that throws, or a `decide` without an engine,
 * gets a `failed` reply rather than a crashed worker.
 */
export function createPolicyWorkerHandler(now: () => number): (message: PolicyWorkerMessage) => PolicyWorkerReply {
  let engine: Engine | null = null;
  return (message) => {
    if (message.type === "init") {
      try {
        engine = createEngine(manifestCatalog(message.manifest));
        return { type: "ready" };
      } catch (error) {
        return { type: "initFailed", message: messageOf(error) };
      }
    }
    try {
      if (engine === null) throw new Error("The policy worker has no catalog");
      return { type: "decided", id: message.id, result: runPolicy(engine, message.request, now) };
    } catch (error) {
      return { type: "failed", id: message.id, message: messageOf(error) };
    }
  };
}
