import { EditorApiRequestError } from "./editor-api";
import type {
  EncounterEditorClient,
  EncounterEditorGroup,
  EncounterSelectionSaveRequest,
  EncounterTextSaveRequest,
} from "./encounter-editor-types";

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
      message: error?.message ?? `Encounter editor API request failed with ${String(response.status)}`,
      status: response.status,
    });
  }
  return body as T;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  return readResponse<T>(await fetch(path, {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

export const encounterEditorClient: EncounterEditorClient = {
  async load(signal) {
    const response = await fetch("/api/editor/encounters", {
      headers: { Accept: "application/json" },
      signal,
    });
    const body = await readResponse<{ groups: EncounterEditorGroup[] }>(response);
    return body.groups;
  },

  saveSelection(request: EncounterSelectionSaveRequest) {
    return patch(
      `/api/editor/encounters/${encodeURIComponent(request.cardId)}/selection`,
      { templatePairId: request.templatePairId, clientRevision: request.clientRevision },
    );
  },

  saveText(request: EncounterTextSaveRequest) {
    return patch(
      `/api/editor/encounters/${encodeURIComponent(request.cardId)}/candidates/${encodeURIComponent(request.templatePairId)}`,
      {
        field: request.field,
        ...(request.actionTemplateId === undefined
          ? {}
          : { actionTemplateId: request.actionTemplateId }),
        value: request.value,
        clientRevision: request.clientRevision,
      },
    );
  },
};
