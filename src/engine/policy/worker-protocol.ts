/**
 * The policy worker's message protocol. The host sends `init` once with the
 * battle's catalog manifest, then one `decide` per decision; the worker
 * answers each `decide` with its id.
 */
import { createEngine, type Engine } from "../engine";
import { manifestCatalog, type CatalogManifest } from "./catalog-manifest";
import { runPolicy, type PolicyRequest } from "./decide";
import type { PolicyResult } from "./types";

export type PolicyWorkerMessage =
  | { readonly type: "init"; readonly manifest: CatalogManifest }
  | { readonly type: "decide"; readonly id: number; readonly request: PolicyRequest };

export type PolicyWorkerReply =
  | { readonly type: "decided"; readonly id: number; readonly result: PolicyResult }
  | { readonly type: "failed"; readonly id: number; readonly message: string };

/**
 * The worker's message handler: builds its engine on `init` and runs the
 * requested policy on each `decide`. A policy that throws, or a `decide`
 * before `init`, gets a `failed` reply rather than a crashed worker.
 */
export function createPolicyWorkerHandler(now: () => number): (message: PolicyWorkerMessage) => PolicyWorkerReply | null {
  let engine: Engine | null = null;
  return (message) => {
    if (message.type === "init") {
      engine = createEngine(manifestCatalog(message.manifest));
      return null;
    }
    try {
      if (engine === null) throw new Error("The policy worker has no catalog");
      return { type: "decided", id: message.id, result: runPolicy(engine, message.request, now) };
    } catch (error) {
      return { type: "failed", id: message.id, message: error instanceof Error ? error.message : String(error) };
    }
  };
}
