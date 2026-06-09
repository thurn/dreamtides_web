import type {
  EditorApiErrorBody,
  EditorTag,
  LoadEditorCardsResponse,
  LoadEditorTagsResponse,
  SaveEditorCardArtRequest,
  SaveEditorCardFieldRequest,
  SaveEditorCardFieldResponse,
  SaveEditorCardImageNumberRequest,
  SaveEditorCardTagsRequest,
  SaveEditorCardTidesRequest,
  SaveEditorTagRegistryRequest,
  SaveEditorTagRegistryResponse,
  SaveEditorTideRegistryRequest,
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

/**
 * The `toml` URL parameter selects which source TOML file under `data/tabula`
 * the editor reads and writes. When absent the canonical rendered-cards file
 * is used. The same value is forwarded to every editor API request so loads
 * and saves stay pinned to the selected file.
 */
export function editorTomlParam(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = new URLSearchParams(window.location.search).get("toml");
  return value !== null && value.trim() !== "" ? value : null;
}

function withTomlParam(path: string): string {
  const toml = editorTomlParam();
  if (toml === null) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}toml=${encodeURIComponent(toml)}`;
}

export async function loadEditorCards(
  signal?: AbortSignal,
): Promise<LoadEditorCardsResponse["cards"]> {
  const response = await fetch(withTomlParam("/api/editor/cards"), {
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
  const response = await fetch(withTomlParam(`/api/editor/cards/${request.id}`), {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  return readJsonResponse<SaveEditorCardFieldResponse>(response);
}

export async function saveEditorCardArt(
  request: SaveEditorCardArtRequest,
): Promise<SaveEditorCardFieldResponse> {
  const response = await fetch(withTomlParam(`/api/editor/cards/${request.id}`), {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: request.id, field: "art", value: request.art }),
  });

  return readJsonResponse<SaveEditorCardFieldResponse>(response);
}

export async function saveEditorCardImageNumber(
  request: SaveEditorCardImageNumberRequest,
): Promise<SaveEditorCardFieldResponse> {
  const response = await fetch(withTomlParam(`/api/editor/cards/${request.id}`), {
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

  return readJsonResponse<SaveEditorCardFieldResponse>(response);
}

export async function loadEditorTags(signal?: AbortSignal): Promise<EditorTag[]> {
  const response = await fetch(withTomlParam("/api/editor/tags"), {
    headers: {
      Accept: "application/json",
    },
    signal,
  });
  const body = await readJsonResponse<LoadEditorTagsResponse>(response);
  return body.tags;
}

export async function saveEditorCardTags(
  request: SaveEditorCardTagsRequest,
): Promise<SaveEditorCardFieldResponse> {
  const response = await fetch(withTomlParam(`/api/editor/cards/${request.id}`), {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: request.id, field: "tags", value: request.tags }),
  });

  return readJsonResponse<SaveEditorCardFieldResponse>(response);
}

export async function saveEditorTagRegistry(
  request: SaveEditorTagRegistryRequest,
): Promise<SaveEditorTagRegistryResponse> {
  const response = await fetch(withTomlParam("/api/editor/tags"), {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  return readJsonResponse<SaveEditorTagRegistryResponse>(response);
}

export async function loadEditorTides(signal?: AbortSignal): Promise<EditorTag[]> {
  const response = await fetch(withTomlParam("/api/editor/tides"), {
    headers: {
      Accept: "application/json",
    },
    signal,
  });
  const body = await readJsonResponse<LoadEditorTagsResponse>(response);
  return body.tags;
}

export async function saveEditorCardTides(
  request: SaveEditorCardTidesRequest,
): Promise<SaveEditorCardFieldResponse> {
  const response = await fetch(withTomlParam(`/api/editor/cards/${request.id}`), {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: request.id, field: "tides", value: request.tides }),
  });

  return readJsonResponse<SaveEditorCardFieldResponse>(response);
}

export async function saveEditorTideRegistry(
  request: SaveEditorTideRegistryRequest,
): Promise<SaveEditorTagRegistryResponse> {
  // The tide registry endpoint shares the tag registry's body shape: the entry
  // list is carried under `tags` regardless of facet.
  const response = await fetch(withTomlParam("/api/editor/tides"), {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tags: request.tides }),
  });

  return readJsonResponse<SaveEditorTagRegistryResponse>(response);
}
