import { EditorApiRequestError, editorTomlParam } from "./editor-api";
import type { EditorApiErrorBody } from "./types";
import type {
  LoadEditorDreamwellResponse,
  SaveEditorDreamwellFieldRequest,
  SaveEditorDreamwellFieldResponse,
} from "./dreamwell-types";

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
        throw new Error(`Dreamwell editor API request failed with ${response.status}`);
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
          : `Dreamwell editor API request failed with ${response.status}`,
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

export async function loadEditorDreamwell(
  signal?: AbortSignal,
): Promise<LoadEditorDreamwellResponse["dreamwell"]> {
  const response = await fetch(withTomlParam("/api/editor/dreamwell"), {
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readJsonResponse<LoadEditorDreamwellResponse>(response);
  return body.dreamwell;
}

export async function saveEditorDreamwellField(
  request: SaveEditorDreamwellFieldRequest,
): Promise<SaveEditorDreamwellFieldResponse> {
  const response = await fetch(withTomlParam(`/api/editor/dreamwell/${request.id}`), {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  return readJsonResponse<SaveEditorDreamwellFieldResponse>(response);
}
