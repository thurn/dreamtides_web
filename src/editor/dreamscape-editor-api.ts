import { EditorApiRequestError, editorTomlParam } from "./editor-api";
import type { EditorApiErrorBody } from "./types";
import type {
  DreamcallerAssignmentRequest,
  DreamcallerAssignmentResponse,
  DreamscapeCatalog,
  LoadEditorDreamscapesResponse,
  SaveEditorDreamscapeFieldRequest,
  SaveEditorDreamscapeFieldResponse,
} from "./dreamscape-types";

function readApiError(body: unknown): EditorApiErrorBody["error"] | undefined {
  if (
    body !== null &&
    typeof body === "object" &&
    "error" in body &&
    body.error !== null &&
    typeof body.error === "object"
  ) {
    return body.error as EditorApiErrorBody["error"];
  }

  return undefined;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown = null;

  if (text.trim() !== "") {
    try {
      body = JSON.parse(text) as unknown;
    } catch (error) {
      if (!response.ok) {
        throw new Error(`Dreamscape editor API request failed with ${response.status}`);
      }

      throw error;
    }
  }

  if (!response.ok) {
    const apiError = readApiError(body);
    throw new EditorApiRequestError({
      code: apiError?.code,
      details: apiError?.details,
      message:
        typeof apiError?.message === "string"
          ? apiError.message
          : `Dreamscape editor API request failed with ${response.status}`,
      status: response.status,
    });
  }

  return body as T;
}

function withTomlParam(path: string): string {
  const toml = editorTomlParam();
  if (toml === null) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}toml=${encodeURIComponent(toml)}`;
}

export async function loadEditorDreamscapes(
  signal?: AbortSignal,
): Promise<DreamscapeCatalog> {
  const response = await fetch(withTomlParam("/api/editor/dreamscapes"), {
    headers: {
      Accept: "application/json",
    },
    signal,
  });
  const body = await readJsonResponse<LoadEditorDreamscapesResponse>(response);
  return {
    dreamscapes: body.dreamscapes,
    guides: body.guides,
    affiliations: body.affiliations,
    dreamcallers: body.dreamcallers,
    siteTypes: body.siteTypes,
  };
}

export async function saveEditorDreamscapeField(
  request: SaveEditorDreamscapeFieldRequest,
): Promise<SaveEditorDreamscapeFieldResponse> {
  const response = await fetch(
    withTomlParam(`/api/editor/dreamscapes/${request.id}`),
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );

  return readJsonResponse<SaveEditorDreamscapeFieldResponse>(response);
}

export async function assignDreamscapeDreamcaller(
  request: DreamcallerAssignmentRequest,
): Promise<DreamcallerAssignmentResponse> {
  const response = await fetch(
    withTomlParam(`/api/editor/dreamscapes/${request.dreamscapeId}/dreamcallers`),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: request.action,
        ...(request.inId !== undefined ? { inId: request.inId } : {}),
        ...(request.outId !== undefined ? { outId: request.outId } : {}),
      }),
    },
  );

  return readJsonResponse<DreamcallerAssignmentResponse>(response);
}
