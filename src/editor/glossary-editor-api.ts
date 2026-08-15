import type { GlossaryCatalogEntry } from "../data/glossary";
import { EditorApiRequestError } from "./editor-api";
import { confirmSourceRevision, queueSourceSave, withExpectedSourceRevision } from "./source-revision";
import type { EditorApiErrorBody } from "./types";
import type { GlossaryEntryId } from "../types/identifiers";

const SOURCE = "glossary";

export interface GlossaryEntryEdit {
  readonly id: GlossaryEntryId;
  readonly term?: string;
  readonly definition?: string;
  readonly variants?: readonly string[];
  readonly termPresentation?: GlossaryCatalogEntry["termPresentation"] | null;
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

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T;
  if (!response.ok) {
    const apiError = readApiError(body);
    throw new EditorApiRequestError({
      code: apiError?.code,
      details: apiError?.details,
      message:
        typeof apiError?.message === "string"
          ? apiError.message
          : `Glossary editor request failed with ${String(response.status)}.`,
      status: response.status,
    });
  }
  return body;
}

/** Load the complete RON-authored Info Card glossary. */
export async function loadGlossaryEntries(
  signal?: AbortSignal,
): Promise<GlossaryCatalogEntry[]> {
  const response = await fetch("/api/editor/glossary", {
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readResponse<{ entries: GlossaryCatalogEntry[] }>(response);
  confirmSourceRevision(SOURCE, body);
  return body.entries;
}

/** Persist one glossary entry's editable text fields. */
export async function saveGlossaryEntry(
  entry: GlossaryEntryEdit,
): Promise<GlossaryCatalogEntry> {
  return queueSourceSave(SOURCE, async () => {
    const response = await fetch(
    `/api/editor/glossary/${encodeURIComponent(entry.id)}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(withExpectedSourceRevision(SOURCE, entry)),
    },
  );
    const body = await readResponse<{ entry: GlossaryCatalogEntry }>(response);
    confirmSourceRevision(SOURCE, body);
    return body.entry;
  });
}
