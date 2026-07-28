import type { JourneyState } from "../types/journey";

/**
 * Named journey saves persisted to the developer's file system.
 *
 * A journey run normally lives only in its Firebase room. Under the local
 * Realtime Database emulator that room is held in memory and is lost when the
 * emulator process stops, so a run cannot be resumed across restarts. These
 * helpers talk to the dev server's `/api/saved-journeys` endpoints (see
 * `scripts/saved-journeys-api.mjs`), which read and write JSON files under the
 * repository's `saved-journeys/` directory. A saved snapshot can be loaded back
 * into the current room to resume the run later.
 *
 * Saves are keyed by a human-chosen name (for example "warriors draft") so a
 * player can keep several runs side by side and reload any of them by name.
 *
 * These functions only work while the Vite dev server is running, since that is
 * what serves the endpoints; off the dev server they reject.
 */

const BASE_PATH = "/api/saved-journeys";

/** Lightweight listing entry used to render the saved-journey list. */
export interface SavedJourneySummary {
  name: string;
  /** ISO timestamp of when the snapshot was captured. */
  savedAt: string;
  /** The `screen.type` of the saved run, e.g. "dreamscape" or "site". */
  screenType: string;
}

/** Normalizes a user-entered save name (trims surrounding whitespace). */
export function normalizeSaveName(name: string): string {
  return name.trim();
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (typeof body?.error?.message === "string") {
      return body.error.message;
    }
  } catch {
    // Fall through to the generic message below.
  }
  return `Request failed with status ${String(response.status)}.`;
}

/** Lists saved journeys, most recently saved first. */
export async function listSavedJourneys(): Promise<SavedJourneySummary[]> {
  const response = await fetch(BASE_PATH, { method: "GET" });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const body = (await response.json()) as { saves?: SavedJourneySummary[] };
  return body.saves ?? [];
}

/**
 * Captures the given journey state under `name`, overwriting any existing save
 * with the same name. Returns the stored summary. A blank name is rejected.
 */
export async function saveJourney(
  name: string,
  journeyState: JourneyState,
): Promise<SavedJourneySummary> {
  const normalized = normalizeSaveName(name);
  if (normalized === "") {
    throw new Error("A saved journey needs a name.");
  }
  const response = await fetch(BASE_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: normalized, journeyState }),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const body = (await response.json()) as { saved: SavedJourneySummary };
  return body.saved;
}

/** Returns the saved journey state for `name`, or null when none exists. */
export async function getSavedJourney(name: string): Promise<JourneyState | null> {
  const normalized = normalizeSaveName(name);
  const response = await fetch(`${BASE_PATH}/${encodeURIComponent(normalized)}`, {
    method: "GET",
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  const body = (await response.json()) as { journeyState?: JourneyState };
  return body.journeyState ?? null;
}

/** Deletes the saved journey with the given name, if present. */
export async function deleteSavedJourney(name: string): Promise<void> {
  const normalized = normalizeSaveName(name);
  const response = await fetch(`${BASE_PATH}/${encodeURIComponent(normalized)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
}
