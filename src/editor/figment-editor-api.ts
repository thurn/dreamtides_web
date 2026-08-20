import { EditorApiRequestError, editorTomlParam } from "./editor-api";
import type { EditorApiErrorBody } from "./types";
import type {
  LoadEditorFigmentsResponse,
  SaveEditorFigmentArtRequest,
  SaveEditorFigmentFieldRequest,
  SaveEditorFigmentFieldResponse,
  SaveEditorFigmentImageNumberRequest,
} from "./figment-types";
import {
  confirmSourceRevision,
  queueSourceSave,
  withExpectedSourceRevision,
} from "./source-revision";
import {
  parseSourceRevisionResponse,
  type ParsedSourceRevisionResponse,
  type RawSourceRevisionResponse,
  type SourceRevision,
} from "../types/source-revision";
import { parseCardSubtype } from "../types/card-identity";
import type { EditorTag } from "./types";

function decodeEditorFigment(
  record: LoadEditorFigmentsResponse["figments"][number],
): LoadEditorFigmentsResponse["figments"][number] {
  return { ...record, subtype: parseCardSubtype(record.subtype) };
}

const SOURCE = "figments";

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
        throw new Error(
          `Figment editor API request failed with ${response.status}`,
        );
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

export async function loadEditorFigments(
  signal?: AbortSignal,
): Promise<LoadEditorFigmentsResponse["figments"]> {
  const response = await fetch(withTomlParam("/api/editor/figments"), {
    headers: { Accept: "application/json" },
    signal,
  });
  const body =
    await readRevisionedJsonResponse<LoadEditorFigmentsResponse>(response);
  confirmSourceRevision(SOURCE, body);
  return body.figments.map(decodeEditorFigment);
}

export async function loadEditorFigmentTags(
  signal?: AbortSignal,
): Promise<EditorTag[]> {
  const response = await fetch(withTomlParam("/api/editor/figments"), {
    headers: { Accept: "application/json" },
    signal,
  });
  const body =
    await readRevisionedJsonResponse<LoadEditorFigmentsResponse>(response);
  confirmSourceRevision(SOURCE, body);
  return body.tags;
}

export async function saveEditorFigmentTagRegistry(tags: EditorTag[]) {
  return queueSourceSave(SOURCE, async () => {
    const response = await fetch(withTomlParam("/api/editor/figments/tags"), {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(withExpectedSourceRevision(SOURCE, { tags })),
    });
    const body =
      await readRevisionedJsonResponse<LoadEditorFigmentsResponse>(response);
    confirmSourceRevision(SOURCE, body);
    return { ...body, figments: body.figments.map(decodeEditorFigment) };
  });
}

export async function saveEditorFigmentField(
  request: SaveEditorFigmentFieldRequest,
): Promise<SaveEditorFigmentFieldResponse> {
  return queueSourceSave(SOURCE, async () => {
    const response = await fetch(
      withTomlParam(`/api/editor/figments/${request.id}`),
      {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(withExpectedSourceRevision(SOURCE, request)),
      },
    );
    const body =
      await readRevisionedJsonResponse<SaveEditorFigmentFieldResponse>(
        response,
      );
    confirmSourceRevision(SOURCE, body);
    return { ...body, figment: decodeEditorFigment(body.figment) };
  });
}

export async function saveEditorFigmentArt(
  request: SaveEditorFigmentArtRequest,
): Promise<SaveEditorFigmentFieldResponse> {
  return queueSourceSave(SOURCE, async () => {
    const response = await fetch(
      withTomlParam(`/api/editor/figments/${request.id}`),
      {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          withExpectedSourceRevision(SOURCE, {
            id: request.id,
            field: "art",
            value: request.art,
          }),
        ),
      },
    );
    const body =
      await readRevisionedJsonResponse<SaveEditorFigmentFieldResponse>(
        response,
      );
    confirmSourceRevision(SOURCE, body);
    return { ...body, figment: decodeEditorFigment(body.figment) };
  });
}

export async function saveEditorFigmentImageNumber(
  request: SaveEditorFigmentImageNumberRequest,
): Promise<SaveEditorFigmentFieldResponse> {
  return queueSourceSave(SOURCE, async () => {
    const response = await fetch(
      withTomlParam(`/api/editor/figments/${request.id}`),
      {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          withExpectedSourceRevision(SOURCE, {
            id: request.id,
            field: "image-number",
            value: request.imageNumber,
          }),
        ),
      },
    );
    const body =
      await readRevisionedJsonResponse<SaveEditorFigmentFieldResponse>(
        response,
      );
    confirmSourceRevision(SOURCE, body);
    return { ...body, figment: decodeEditorFigment(body.figment) };
  });
}
