import { EditorApiRequestError } from "./editor-api";
import type { EditorApiErrorBody } from "./types";
import type {
  SaveTideFieldRequest,
  SaveTideFieldResponse,
  TidesArtifact,
} from "./tides-types";

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
        throw new Error(`Tides editor API request failed with ${response.status}`);
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
          : `Tides editor API request failed with ${response.status}`,
      status: response.status,
    });
  }
  return body as T;
}

function withFileParam(path: string, file: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}file=${encodeURIComponent(file)}`;
}

export async function loadTidesArtifact(
  file: string,
  signal?: AbortSignal,
): Promise<TidesArtifact> {
  const response = await fetch(withFileParam("/api/editor/tide-decks", file), {
    headers: { Accept: "application/json" },
    signal,
  });
  return readJsonResponse<TidesArtifact>(response);
}

export async function saveTideField(
  request: SaveTideFieldRequest,
): Promise<SaveTideFieldResponse> {
  const response = await fetch(
    withFileParam(`/api/editor/tide-decks/${encodeURIComponent(request.id)}`, request.file),
    {
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ id: request.id, field: request.field, value: request.value }),
    },
  );
  return readJsonResponse<SaveTideFieldResponse>(response);
}
