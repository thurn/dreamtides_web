import { EditorApiRequestError, editorTomlParam } from "./editor-api";
import type { EditorApiErrorBody } from "./types";
import type {
  LoadEditorFigmentsResponse,
  SaveEditorFigmentArtRequest,
  SaveEditorFigmentFieldRequest,
  SaveEditorFigmentFieldResponse,
  SaveEditorFigmentImageNumberRequest,
} from "./figment-types";

function readApiError(body: unknown): EditorApiErrorBody["error"] | undefined {
  if (
    body !== null &&
    typeof body === "object" &&
    "error" in body &&
    body.error !== null &&
    typeof body.error === "object"
  ) {
    return body.error;
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
        throw new Error(`Figment editor API request failed with ${response.status}`);
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
          : `Figment editor API request failed with ${response.status}`,
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

export async function loadEditorFigments(
  signal?: AbortSignal,
): Promise<LoadEditorFigmentsResponse["figments"]> {
  const response = await fetch(withTomlParam("/api/editor/figments"), {
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readJsonResponse<LoadEditorFigmentsResponse>(response);
  return body.figments;
}

export async function saveEditorFigmentField(
  request: SaveEditorFigmentFieldRequest,
): Promise<SaveEditorFigmentFieldResponse> {
  const response = await fetch(withTomlParam(`/api/editor/figments/${request.id}`), {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  return readJsonResponse<SaveEditorFigmentFieldResponse>(response);
}

export async function saveEditorFigmentArt(
  request: SaveEditorFigmentArtRequest,
): Promise<SaveEditorFigmentFieldResponse> {
  const response = await fetch(withTomlParam(`/api/editor/figments/${request.id}`), {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: request.id, field: "art", value: request.art }),
  });

  return readJsonResponse<SaveEditorFigmentFieldResponse>(response);
}

export async function saveEditorFigmentImageNumber(
  request: SaveEditorFigmentImageNumberRequest,
): Promise<SaveEditorFigmentFieldResponse> {
  const response = await fetch(withTomlParam(`/api/editor/figments/${request.id}`), {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: request.id,
      field: "image-number",
      value: request.imageNumber,
    }),
  });

  return readJsonResponse<SaveEditorFigmentFieldResponse>(response);
}
