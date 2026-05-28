import type {
  LoadEditorCardsResponse,
  SaveEditorCardFieldRequest,
  SaveEditorCardFieldResponse,
} from "./types";

async function readJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const message =
      body !== null &&
      typeof body === "object" &&
      "error" in body &&
      body.error !== null &&
      typeof body.error === "object" &&
      "message" in body.error &&
      typeof body.error.message === "string"
        ? body.error.message
        : `Editor API request failed with ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

export async function loadEditorCards(): Promise<LoadEditorCardsResponse["cards"]> {
  const response = await fetch("/api/editor/cards", {
    headers: {
      Accept: "application/json",
    },
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
