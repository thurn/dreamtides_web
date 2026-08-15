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
import {
  parseOptionalSourceRevisionResponse,
  parseSourceRevision,
  type ParsedOptionalSourceRevisionResponse,
  type RawOptionalSourceRevisionResponse,
  type SourceRevision,
} from "../types/source-revision";
import { parseCardSubtype } from "../types/card-identity";

function decodeEditorCard(
  record: LoadEditorCardsResponse["cards"][number],
): LoadEditorCardsResponse["cards"][number] {
  return {
    ...record,
    subtype: parseCardSubtype(record.subtype),
    preview: {
      ...record.preview,
      subtype: parseCardSubtype(record.preview.subtype),
    },
  };
}

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

let currentSourceRevision: SourceRevision | undefined;
let saveQueue: Promise<void> = Promise.resolve();
let pausedSaveError: Error | null = null;

function rememberSourceRevision(body: { sourceRevision?: unknown }): void {
  if (body.sourceRevision !== undefined) {
    currentSourceRevision = parseSourceRevision(body.sourceRevision);
  }
}

function queueSave<T>(operation: () => Promise<T>): Promise<T> {
  const queued = saveQueue.then(async () => {
    if (pausedSaveError !== null) {
      throw pausedSaveError;
    }
    try {
      return await operation();
    } catch (error) {
      const saveError = error instanceof Error ? error : new Error(String(error));
      pausedSaveError = saveError;
      if (
        typeof window !== "undefined" &&
        saveError instanceof EditorApiRequestError &&
        saveError.code === "STALE_SOURCE"
      ) {
        window.dispatchEvent(new CustomEvent("card-editor:stale-source"));
      }
      throw saveError;
    }
  });
  saveQueue = queued.then(() => undefined, () => undefined);
  return queued;
}

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

async function readRevisionedJsonResponse<
  Result extends { readonly sourceRevision?: SourceRevision },
>(response: Response): Promise<ParsedOptionalSourceRevisionResponse<Result>> {
  return parseOptionalSourceRevisionResponse<Result>(
    await readJsonResponse<RawOptionalSourceRevisionResponse<Result>>(response),
  );
}

/**
 * The `source` URL parameter selects a canonical RON file under `data`.
 * When absent, the Cards dataset is selected. The same value is forwarded to
 * editor API requests so reads and semantic saves stay pinned to one source.
 */
export function editorTomlParam(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const value = params.get("source") ?? params.get("toml");
  return value !== null && value.trim() !== "" ? value : null;
}

function withTomlParam(path: string): string {
  const source = editorTomlParam();
  if (source === null) {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}source=${encodeURIComponent(source)}`;
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
  const body = await readRevisionedJsonResponse<LoadEditorCardsResponse>(response);
  rememberSourceRevision(body);
  pausedSaveError = null;
  return body.cards.map(decodeEditorCard);
}

export async function saveEditorCardField(
  request: SaveEditorCardFieldRequest,
): Promise<SaveEditorCardFieldResponse> {
  return queueSave(async () => {
    const response = await fetch(withTomlParam(`/api/editor/cards/${request.id}`), {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...request, sourceRevision: currentSourceRevision }),
    });
    const body = await readRevisionedJsonResponse<SaveEditorCardFieldResponse>(response);
    rememberSourceRevision(body);
    return { ...body, card: decodeEditorCard(body.card) };
  });
}

export async function saveEditorCardArt(
  request: SaveEditorCardArtRequest,
): Promise<SaveEditorCardFieldResponse> {
  return saveEditorCardField({
    id: request.id,
    field: "art",
    value: request.art,
  });
}

export async function saveEditorCardImageNumber(
  request: SaveEditorCardImageNumberRequest,
): Promise<SaveEditorCardFieldResponse> {
  return saveEditorCardField({
    id: request.id,
    field: "image-number",
    value: request.imageNumber,
  });
}

export async function loadEditorTags(signal?: AbortSignal): Promise<EditorTag[]> {
  const response = await fetch(withTomlParam("/api/editor/tags"), {
    headers: {
      Accept: "application/json",
    },
    signal,
  });
  const body = await readRevisionedJsonResponse<LoadEditorTagsResponse>(response);
  rememberSourceRevision(body);
  return body.tags;
}

export async function saveEditorCardTags(
  request: SaveEditorCardTagsRequest,
): Promise<SaveEditorCardFieldResponse> {
  return saveEditorCardField({
    id: request.id,
    field: "tags",
    value: request.tags,
  });
}

export async function saveEditorTagRegistry(
  request: SaveEditorTagRegistryRequest,
): Promise<SaveEditorTagRegistryResponse> {
  return queueSave(async () => {
    const response = await fetch(withTomlParam("/api/editor/tags"), {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...request, sourceRevision: currentSourceRevision }),
    });
    const body = await readRevisionedJsonResponse<SaveEditorTagRegistryResponse>(response);
    rememberSourceRevision(body);
    return { ...body, cards: body.cards.map(decodeEditorCard) };
  });
}

export async function loadEditorTides(signal?: AbortSignal): Promise<EditorTag[]> {
  const response = await fetch(withTomlParam("/api/editor/tides"), {
    headers: {
      Accept: "application/json",
    },
    signal,
  });
  const body = await readRevisionedJsonResponse<LoadEditorTagsResponse>(response);
  rememberSourceRevision(body);
  return body.tags;
}

export async function saveEditorCardTides(
  request: SaveEditorCardTidesRequest,
): Promise<SaveEditorCardFieldResponse> {
  return saveEditorCardField({
    id: request.id,
    field: "tides",
    value: request.tides,
  });
}

export async function saveEditorTideRegistry(
  request: SaveEditorTideRegistryRequest,
): Promise<SaveEditorTagRegistryResponse> {
  // The tide registry endpoint shares the tag registry's body shape: the entry
  // list is carried under `tags` regardless of facet.
  return queueSave(async () => {
    const response = await fetch(withTomlParam("/api/editor/tides"), {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tags: request.tides,
        sourceRevision: currentSourceRevision,
      }),
    });
    const body = await readRevisionedJsonResponse<SaveEditorTagRegistryResponse>(response);
    rememberSourceRevision(body);
    return { ...body, cards: body.cards.map(decodeEditorCard) };
  });
}
