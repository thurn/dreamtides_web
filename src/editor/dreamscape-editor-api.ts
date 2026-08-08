import { EditorApiRequestError, editorTomlParam } from "./editor-api";
import type { EditorApiErrorBody } from "./types";
import type {
  DreamAvatarAssignmentRequest,
  DreamAvatarAssignmentResponse,
  DreamscapeCatalog,
  LoadEditorDreamscapesResponse,
  SaveEditorDreamscapeFieldRequest,
  SaveEditorDreamscapeFieldResponse,
} from "./dreamscape-types";
import {
  confirmSourceRevision,
  queueSourceSave,
  withExpectedSourceRevision,
} from "./source-revision";

const SOURCE = "dreamscapes";

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
          `Dreamscape editor API request failed with ${response.status}`,
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
          : `Dreamscape editor API request failed with ${response.status}`,
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

export async function loadEditorDreamscapes(
  signal?: AbortSignal,
): Promise<DreamscapeCatalog> {
  const response = await fetch(withTomlParam("/api/editor/dreamscapes"), {
    headers: {
      Accept: "application/json",
    },
    signal,
  });
  const body = await readJsonResponse<LoadEditorDreamscapesResponse>(response);
  confirmSourceRevision(SOURCE, body);
  return {
    dreamscapes: body.dreamscapes,
    guides: body.guides,
    affiliations: body.affiliations,
    dreamAvatars: body.dreamAvatars,
    siteTypes: body.siteTypes,
  };
}

export async function saveEditorDreamscapeField(
  request: SaveEditorDreamscapeFieldRequest,
): Promise<SaveEditorDreamscapeFieldResponse> {
  return queueSourceSave(SOURCE, async () => {
    const resource =
      request.field === "guide-id" || request.field === "signature-site"
        ? "dream-guides"
        : "dreamscapes";
    const response = await fetch(
      withTomlParam(`/api/editor/${resource}/${request.id}`),
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
      await readJsonResponse<SaveEditorDreamscapeFieldResponse>(response);
    confirmSourceRevision(SOURCE, body);
    return body;
  });
}

export async function assignDreamscapeDreamAvatar(
  request: DreamAvatarAssignmentRequest,
): Promise<DreamAvatarAssignmentResponse> {
  return queueSourceSave(SOURCE, async () => {
    const response = await fetch(
      withTomlParam(
        `/api/editor/dreamscapes/${request.dreamscapeId}/dream-avatars`,
      ),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          withExpectedSourceRevision(SOURCE, {
            action: request.action,
            ...(request.inId !== undefined ? { inId: request.inId } : {}),
            ...(request.outId !== undefined ? { outId: request.outId } : {}),
          }),
        ),
      },
    );

    const body =
      await readJsonResponse<DreamAvatarAssignmentResponse>(response);
    confirmSourceRevision(SOURCE, body);
    return body;
  });
}
