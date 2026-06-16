import { EditorApiRequestError, editorTomlParam } from "./editor-api";
import type { EditorApiErrorBody } from "./types";
import type {
  LoadEditorDreamcallersResponse,
  SaveEditorDreamcallerFieldRequest,
  SaveEditorDreamcallerFieldResponse,
  SaveEditorDreamcallerTidePoolRequest,
} from "./dreamcaller-types";

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
        throw new Error(`Dreamcaller editor API request failed with ${response.status}`);
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
          : `Dreamcaller editor API request failed with ${response.status}`,
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

export async function loadEditorDreamcallers(
  signal?: AbortSignal,
): Promise<LoadEditorDreamcallersResponse> {
  const response = await fetch(withTomlParam("/api/editor/dreamcallers"), {
    headers: { Accept: "application/json" },
    signal,
  });
  return readJsonResponse<LoadEditorDreamcallersResponse>(response);
}

export async function saveEditorDreamcallerField(
  request: SaveEditorDreamcallerFieldRequest,
): Promise<SaveEditorDreamcallerFieldResponse> {
  const response = await fetch(withTomlParam(`/api/editor/dreamcallers/${request.id}`), {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return readJsonResponse<SaveEditorDreamcallerFieldResponse>(response);
}

export async function saveEditorDreamcallerTidePool(
  request: SaveEditorDreamcallerTidePoolRequest,
): Promise<SaveEditorDreamcallerFieldResponse> {
  const response = await fetch(withTomlParam(`/api/editor/dreamcallers/${request.id}`), {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ id: request.id, field: "tide-pool", value: request.pool }),
  });
  return readJsonResponse<SaveEditorDreamcallerFieldResponse>(response);
}
