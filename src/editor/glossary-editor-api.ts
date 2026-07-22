import type { GlossaryCatalogEntry } from "../data/glossary";

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

/** Load the complete TOML-backed Info Card glossary. */
export async function loadGlossaryEntries(
  signal?: AbortSignal,
): Promise<GlossaryCatalogEntry[]> {
  const response = await fetch("/api/editor/glossary", {
    headers: { Accept: "application/json" },
    signal,
  });
  const body = await readResponse<{ entries: GlossaryCatalogEntry[] }>(response);
  return body.entries;
}

/** Persist one glossary entry's editable text fields. */
export async function saveGlossaryEntry(
  entry: Pick<GlossaryCatalogEntry, "id" | "term" | "definition" | "variants">,
): Promise<GlossaryCatalogEntry> {
  const response = await fetch(
    `/api/editor/glossary/${encodeURIComponent(entry.id)}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(entry),
    },
  );
  const body = await readResponse<{ entry: GlossaryCatalogEntry }>(response);
  return body.entry;
}
