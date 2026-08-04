import { EditorApiRequestError } from "./editor-api";
import type {
  ExplorationEditorClient,
  ExplorationEditorLoadResult,
  ExplorationEditorServerData,
} from "./exploration-editor-types";

async function readResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text === "" ? null : JSON.parse(text) as unknown;
  if (!response.ok) {
    const error = body !== null && typeof body === "object" && "error" in body
      ? body.error as { code?: string; message?: string }
      : undefined;
    throw new EditorApiRequestError({
      code: error?.code,
      details: undefined,
      message: error?.message ?? `Exploration editor API request failed with ${String(response.status)}`,
      status: response.status,
    });
  }
  return body as T;
}

async function patch(path: string, body: unknown) {
  return readResponse<{ data: ExplorationEditorServerData; clientRevision: number }>(
    await fetch(path, {
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export const explorationEditorClient: ExplorationEditorClient = {
  async load(signal): Promise<ExplorationEditorLoadResult> {
    const response = await fetch("/api/editor/exploration", {
      headers: { Accept: "application/json" },
      signal,
    });
    return readResponse<ExplorationEditorLoadResult>(response);
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
