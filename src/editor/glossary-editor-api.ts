import type { GlossaryCatalogEntry } from "../data/glossary";
import { confirmSourceRevision, queueSourceSave, withExpectedSourceRevision } from "./source-revision";

const SOURCE = "glossary";

export interface GlossaryEntryEdit {
  readonly id: string;
  readonly term?: string;
  readonly definition?: string;
  readonly variants?: readonly string[];
  readonly termPresentation?: GlossaryCatalogEntry["termPresentation"] | null;
}

interface GlossaryApiErrorBody {
  readonly error?: { readonly message?: string };
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & GlossaryApiErrorBody;
  if (!response.ok) {
    throw new Error(
      body.error?.message ??
        `Glossary editor request failed with ${String(response.status)}.`,
    );
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
