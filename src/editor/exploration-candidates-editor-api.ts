import { EditorApiRequestError } from "./editor-api";
import { loadCardDatabase } from "../data/card-database";
import { createDreamsign, loadDreamsignTemplates } from "../data/dreamsigns";
import type {
  ExplorationCandidatesEditorClient,
  ExplorationCandidatesEditorGroup,
  EncounterTemplateHealth,
  EncounterSelectionSaveRequest,
  EncounterTemplateSaveRequest,
  EncounterTextSaveRequest,
  EncounterVariableSaveRequest,
} from "./exploration-candidates-editor-types";

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
      message: error?.message ?? `Exploration candidates editor API request failed with ${String(response.status)}`,
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

export const explorationCandidatesEditorClient: ExplorationCandidatesEditorClient = {
  async load(signal) {
    const [response, cardDatabase, dreamsignTemplates] = await Promise.all([
      fetch("/api/editor/exploration_candidates", {
        headers: { Accept: "application/json" },
        signal,
      }),
      loadCardDatabase(),
      loadDreamsignTemplates(),
    ]);
    const body = await readResponse<{ groups: ExplorationCandidatesEditorGroup[] }>(response);
    return {
      groups: body.groups,
      cards: [...cardDatabase.values()],
      dreamsigns: dreamsignTemplates.map((template) => createDreamsign(template)),
    };
  },

  async loadTemplateHealth(signal) {
    const response = await fetch("/api/editor/exploration_candidates/template-health", {
      headers: { Accept: "application/json" },
      signal,
    });
    const body = await readResponse<{ templateHealth: EncounterTemplateHealth }>(response);
    return body.templateHealth;
  },

  saveSelection(request: EncounterSelectionSaveRequest) {
    return patch(
      `/api/editor/exploration_candidates/${encodeURIComponent(request.cardId)}/selection`,
      {
        templatePairId: request.templatePairId,
        selectionKind: request.selectionKind,
        clientRevision: request.clientRevision,
      },
    );
  },

  saveText(request: EncounterTextSaveRequest) {
    return patch(
      `/api/editor/exploration_candidates/${encodeURIComponent(request.cardId)}/candidates/${encodeURIComponent(request.templatePairId)}`,
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

  saveVariable(request: EncounterVariableSaveRequest) {
    return patch(
      `/api/editor/exploration_candidates/${encodeURIComponent(request.cardId)}/candidates/${encodeURIComponent(request.templatePairId)}`,
      {
        field: "variable",
        actionTemplateId: request.actionTemplateId,
        variableName: request.variableName,
        value: request.value,
        clientRevision: request.clientRevision,
      },
    );
  },

  saveTemplate(request: EncounterTemplateSaveRequest) {
    return patch(
      `/api/editor/exploration_candidates/templates/${encodeURIComponent(String(request.templateId))}`,
      {
        value: request.value,
        clientRevision: request.clientRevision,
      },
    );
  },
};
