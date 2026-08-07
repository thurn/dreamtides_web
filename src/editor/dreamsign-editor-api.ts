import { EditorApiRequestError, editorTomlParam } from "./editor-api";
import type { EditorApiErrorBody } from "./types";
import type {
  LoadEditorDreamsignTagsResponse,
  LoadEditorDreamsignsResponse,
  SaveEditorDreamsignFieldRequest,
  SaveEditorDreamsignFieldResponse,
  SaveEditorDreamsignTagRegistryRequest,
  SaveEditorDreamsignTagRegistryResponse,
  SaveEditorDreamsignTagsRequest,
} from "./dreamsign-types";
import type { EditorTag } from "./types";
import { confirmSourceRevision, queueSourceSave, withExpectedSourceRevision } from "./source-revision";

const SOURCE = "dreamsigns";

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
        throw new Error(`Dreamsign editor API request failed with ${response.status}`);
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
          : `Dreamsign editor API request failed with ${response.status}`,
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
  return `${path}${separator}source=${encodeURIComponent(toml)}`;
}

export async function loadEditorDreamsigns(
  signal?: AbortSignal,
): Promise<LoadEditorDreamsignsResponse["dreamsigns"]> {
  const response = await fetch(withTomlParam("/api/editor/dreamsigns"), {
    headers: {
      Accept: "application/json",
    },
    signal,
  });
  const body = await readJsonResponse<LoadEditorDreamsignsResponse>(response);
  confirmSourceRevision(SOURCE, body);
  return body.dreamsigns;
}

export async function saveEditorDreamsignField(
  request: SaveEditorDreamsignFieldRequest,
): Promise<SaveEditorDreamsignFieldResponse> {
  return queueSourceSave(SOURCE, async () => {
    const response = await fetch(
    withTomlParam(`/api/editor/dreamsigns/${request.id}`),
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(withExpectedSourceRevision(SOURCE, request)),
    },
  );

    const body = await readJsonResponse<SaveEditorDreamsignFieldResponse>(response);
    confirmSourceRevision(SOURCE, body);
    return body;
  });
}

export async function loadEditorDreamsignTags(
  signal?: AbortSignal,
): Promise<EditorTag[]> {
  const response = await fetch(withTomlParam("/api/editor/dreamsign-tags"), {
    headers: {
      Accept: "application/json",
    },
    signal,
  });
  const body = await readJsonResponse<LoadEditorDreamsignTagsResponse>(response);
  confirmSourceRevision(SOURCE, body);
  return body.tags;
}

export async function saveEditorDreamsignTags(
  request: SaveEditorDreamsignTagsRequest,
): Promise<SaveEditorDreamsignFieldResponse> {
  return queueSourceSave(SOURCE, async () => {
    const response = await fetch(
    withTomlParam(`/api/editor/dreamsigns/${request.id}`),
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(withExpectedSourceRevision(SOURCE, {
        id: request.id, field: "tags", value: request.tags,
      })),
    },
  );

    const body = await readJsonResponse<SaveEditorDreamsignFieldResponse>(response);
    confirmSourceRevision(SOURCE, body);
    return body;
  });
}

export async function saveEditorDreamsignTagRegistry(
  request: SaveEditorDreamsignTagRegistryRequest,
): Promise<SaveEditorDreamsignTagRegistryResponse> {
  return queueSourceSave(SOURCE, async () => {
    const response = await fetch(withTomlParam("/api/editor/dreamsign-tags"), {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(withExpectedSourceRevision(SOURCE, request)),
    });
    const body = await readJsonResponse<SaveEditorDreamsignTagRegistryResponse>(response);
    confirmSourceRevision(SOURCE, body);
    return body;
  });
}
