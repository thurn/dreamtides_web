import type {
  EditorApiErrorBody,
  LoadEditorCardsResponse,
  SaveEditorCardFieldRequest,
  SaveEditorCardFieldResponse,
} from "./types";

export class EditorApiRequestError extends Error {
  readonly code: string | undefined;
  readonly details: unknown;
  readonly status: number;

  constructor({
    code,
    details,
    message,
    status,
  }: {
    code?: string;
    details?: unknown;
    message: string;
    status: number;
  }) {
    super(message);
    this.name = "EditorApiRequestError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

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
        throw new Error(`Editor API request failed with ${response.status}`);
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
          : `Editor API request failed with ${response.status}`,
      status: response.status,
    });
  }

  return body as T;
}

export async function loadEditorCards(
  signal?: AbortSignal,
): Promise<LoadEditorCardsResponse["cards"]> {
  const response = await fetch("/api/editor/cards", {
    headers: {
      Accept: "application/json",
    },
    signal,
  });
  const body = await readJsonResponse<LoadEditorCardsResponse>(response);
  return body.cards;
}

export async function saveEditorCardField(
  request: SaveEditorCardFieldRequest,
): Promise<SaveEditorCardFieldResponse> {
  const response = await fetch(`/api/editor/cards/${request.id}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  return readJsonResponse<SaveEditorCardFieldResponse>(response);
}
