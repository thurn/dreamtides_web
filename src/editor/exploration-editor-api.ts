import { EditorApiRequestError } from "./editor-api";
import type {
  ExplorationEditorClient,
  ExplorationEditorLoadResult,
  ExplorationEditorServerData,
} from "./exploration-editor-types";
import type { EncounterTemplateHealth } from "./exploration-candidates-editor-types";

let currentSourceRevision: string | undefined;
let saveQueue: Promise<void> = Promise.resolve();
let pausedSaveError: Error | null = null;

function rememberSourceRevision(data: { sourceRevision?: string }): void {
  if (data.sourceRevision !== undefined) currentSourceRevision = data.sourceRevision;
}

function queueSave<T>(operation: () => Promise<T>): Promise<T> {
  const queued = saveQueue.then(async () => {
    if (pausedSaveError !== null) throw pausedSaveError;
    try {
      return await operation();
    } catch (error) {
      const saveError = error instanceof Error ? error : new Error(String(error));
      pausedSaveError = saveError;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("exploration-editor:save-failed"));
      }
      throw saveError;
    }
  });
  saveQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

async function readResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text === "" ? null : JSON.parse(text) as unknown;
  if (!response.ok) {
    const error = body !== null && typeof body === "object" && "error" in body
      ? body.error as { code?: string; message?: string; [key: string]: unknown }
      : undefined;
    throw new EditorApiRequestError({
      code: error?.code,
      details: error,
      message: error?.message ?? `Exploration editor API request failed with ${String(response.status)}`,
      status: response.status,
    });
  }
  return body as T;
}

async function patch(path: string, body: unknown) {
  return queueSave(async () => {
    const result = await readResponse<{
      data: ExplorationEditorServerData;
      clientRevision: number;
    }>(await fetch(path, {
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ ...body as object, expectedSourceRevision: currentSourceRevision }),
    }));
    rememberSourceRevision(result.data);
    return result;
  });
}

export const explorationEditorClient: ExplorationEditorClient = {
  async load(signal): Promise<ExplorationEditorLoadResult> {
    const response = await fetch("/api/editor/exploration", {
      headers: { Accept: "application/json" },
      signal,
    });
    const result = await readResponse<ExplorationEditorLoadResult>(response);
    rememberSourceRevision(result);
    pausedSaveError = null;
    return result;
  },

  async loadTemplateHealth(signal) {
    const response = await fetch("/api/editor/exploration_candidates/template-health", {
      headers: { Accept: "application/json" },
      signal,
    });
    const body = await readResponse<{ templateHealth: EncounterTemplateHealth }>(response);
    return body.templateHealth;
  },

  saveProse(request) {
    return patch(
      `/api/editor/exploration/encounters/${encodeURIComponent(request.cardId)}`,
      { value: request.value, clientRevision: request.clientRevision },
    );
  },

  saveAction(request) {
    return patch(
      `/api/editor/exploration/encounters/${encodeURIComponent(request.cardId)}/actions/${String(request.slot)}`,
      { action: request.action, clientRevision: request.clientRevision },
    );
  },

  saveTemplate(request) {
    return patch(
      `/api/editor/exploration/templates/${String(request.templateId)}`,
      { value: request.value, clientRevision: request.clientRevision },
    );
  },
};
