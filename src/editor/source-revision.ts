import { EditorApiRequestError } from "./editor-api";

interface SourceState {
  revision?: string;
  queue: Promise<void>;
  pausedError: Error | null;
}

const sources = new Map<string, SourceState>();

function stateFor(source: string): SourceState {
  let state = sources.get(source);
  if (state === undefined) {
    state = { queue: Promise.resolve(), pausedError: null };
    sources.set(source, state);
  }
  return state;
}

export function confirmSourceRevision(source: string, body: unknown): void {
  const state = stateFor(source);
  if (body !== null && typeof body === "object" && "sourceRevision" in body &&
      typeof body.sourceRevision === "string") state.revision = body.sourceRevision;
  state.pausedError = null;
}

export function withExpectedSourceRevision(source: string, body: object): object {
  return { ...body, expectedSourceRevision: stateFor(source).revision };
}

export function queueSourceSave<T>(source: string, operation: () => Promise<T>): Promise<T> {
  const state = stateFor(source);
  const queued = state.queue.then(async () => {
    if (state.pausedError !== null) throw state.pausedError;
    try {
      return await operation();
    } catch (error) {
      const saveError = error instanceof Error ? error : new Error(String(error));
      state.pausedError = saveError;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("game-data-editor:save-failed", {
          detail: {
            source,
            stale: saveError instanceof EditorApiRequestError && saveError.code === "STALE_SOURCE",
          },
        }));
      }
      throw saveError;
    }
  });
  state.queue = queued.then(() => undefined, () => undefined);
  return queued;
}
