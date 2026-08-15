import { EditorApiRequestError, editorTomlParam } from "./editor-api";
import type { EditorApiErrorBody } from "./types";
import type {
  LoadEditorDreamwellResponse,
  SaveEditorDreamwellFieldRequest,
  SaveEditorDreamwellFieldResponse,
} from "./dreamwell-types";
import { confirmSourceRevision, queueSourceSave, withExpectedSourceRevision } from "./source-revision";
import {
  parseSourceRevisionResponse,
  type ParsedSourceRevisionResponse,
  type RawSourceRevisionResponse,
  type SourceRevision,
} from "../types/source-revision";

const SOURCE = "dreamwell";

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

async function readRevisionedJsonResponse<
  Result extends { readonly sourceRevision: SourceRevision },
>(response: Response): Promise<ParsedSourceRevisionResponse<Result>> {
  return parseSourceRevisionResponse<Result>(
    await readJsonResponse<RawSourceRevisionResponse<Result>>(response),
  );
}

function withTomlParam(path: string): string {
  const toml = editorTomlParam();
  if (toml === null) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}source=${encodeURIComponent(toml)}`;
}

export async function loadEditorDreamwell(
  signal?: AbortSignal,
): Promise<LoadEditorDreamwellResponse["dreamwell"]> {
  const response = await fetch(withTomlParam("/api/editor/dreamwell"), {
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readRevisionedJsonResponse<LoadEditorDreamwellResponse>(response);
  confirmSourceRevision(SOURCE, body);
  return body.dreamwell;
}

export async function saveEditorDreamwellField(
  request: SaveEditorDreamwellFieldRequest,
): Promise<SaveEditorDreamwellFieldResponse> {
  return queueSourceSave(SOURCE, async () => {
    const response = await fetch(withTomlParam(`/api/editor/dreamwell/${request.id}`), {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(withExpectedSourceRevision(SOURCE, request)),
    });
    const body = await readRevisionedJsonResponse<SaveEditorDreamwellFieldResponse>(response);
    confirmSourceRevision(SOURCE, body);
    return body;
  });
}
