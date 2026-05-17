import type { QuestState } from "../types/quest";

const STORAGE_KEY = "quest-prototype-state-v1";
const STORAGE_VERSION = 1;

interface StoredQuestState {
  version: number;
  state: QuestState;
}

function normalizeQuestState(state: QuestState): QuestState {
  return {
    ...state,
    siteRuntime: state.siteRuntime ?? {},
    // Backfill Dream Journey effect modifier fields so a snapshot persisted
    // before they were introduced loads without runtime errors.
    battleModifiers: state.battleModifiers ?? [],
    shopModifiers: state.shopModifiers ?? {
      freeRerolls: 0,
      upcomingOmenDiscounts: 0,
      essenceDiscountPercent: 0,
    },
    dreamscapeModifiers: state.dreamscapeModifiers ?? [],
  };
}

/**
 * Loads a previously persisted `QuestState` from `sessionStorage`. Returns
 * `null` when no snapshot exists, the snapshot is malformed, the schema
 * version does not match, or the browser disallows storage access. The caller
 * (`QuestProvider`) treats `null` as "no saved run, fall back to
 * `createDefaultState()`".
 *
 * Persistence is scoped to `sessionStorage` (not `localStorage`) so closing
 * the tab still wipes the run; only an in-tab refresh preserves state. This
 * matches the audit fix for FIND-01-2 — preserve mid-run reload, but do not
 * leak a half-finished quest into a brand-new browser session.
 */
export function loadQuestState(): QuestState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredQuestState;
    if (parsed.version !== STORAGE_VERSION) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return normalizeQuestState(parsed.state);
  } catch {
    return null;
  }
}

/**
 * Persists the current `QuestState` to `sessionStorage`. Errors are
 * intentionally swallowed: storage may be unavailable in private browsing or
 * exceed quota for very large quest atlases, and persistence failure should
 * never break the UI flow. The next state mutation will overwrite a stale
 * snapshot, so transient failures self-heal.
 */
export function saveQuestState(state: QuestState): void {
  try {
    const payload: StoredQuestState = { version: STORAGE_VERSION, state };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota/serialization failures
  }
}

/**
 * Clears any persisted `QuestState`. Called from `resetQuest()` so a fresh
 * run starts from the default state on the next reload instead of restoring
 * the prior snapshot.
 */
export function clearPersistedQuestState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
