import { EditorApiRequestError } from "./editor-api";
import {
  parseSourceRevision,
  type SourceRevision,
} from "../types/source-revision";
export { parseSourceRevision, type SourceRevision } from "../types/source-revision";

export type EditorSourceId =
  | "cards"
  | "avatars"
  | "dreamscapes"
  | "dreamsigns"
  | "dreamwell"
  | "exploration"
  | "figments"
  | "glossary"
  | "tutorial";

interface SourceState {
  revision?: SourceRevision;
  queue: Promise<void>;
  pausedError: Error | null;
}

const sources = new Map<EditorSourceId, SourceState>();

function stateFor(source: EditorSourceId): SourceState {
  let state = sources.get(source);
  if (state === undefined) {
    state = { queue: Promise.resolve(), pausedError: null };
    sources.set(source, state);
  }
  return state;
}

export function confirmSourceRevision(
  source: EditorSourceId,
  body: unknown,
): void {
  const state = stateFor(source);
  if (body !== null && typeof body === "object" && "sourceRevision" in body &&
      typeof body.sourceRevision === "string") {
    state.revision = parseSourceRevision(body.sourceRevision);
  }
  state.pausedError = null;
}

export function withExpectedSourceRevision(
  source: EditorSourceId,
  body: object,
): object {
  return { ...body, expectedSourceRevision: stateFor(source).revision };
}

export function queueSourceSave<T>(
  source: EditorSourceId,
  operation: () => Promise<T>,
): Promise<T> {
  const state = stateFor(source);
  const queued = state.queue.then(async () => {
    if (state.pausedError !== null) throw state.pausedError;
    try {
      return await operation();
    } catch (error) {
      const saveError = error instanceof Error ? error : new Error(String(error));
      const stale = saveError instanceof EditorApiRequestError && saveError.code === "STALE_SOURCE";
      if (stale) state.pausedError = saveError;
      if (stale && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("game-data-editor:save-failed", {
          detail: {
            source,
            stale: true,
          },
        }));
      }
      throw saveError;
    }
  });
  state.queue = queued.then(() => undefined, () => undefined);
  return queued;
}
