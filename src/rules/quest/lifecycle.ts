// Pure quest-lifecycle, essence, and navigation reducer cases.
//
// Each exported case relocates the DOMAIN MATH of a legacy quest mutation
// (`src/state/multiplayer-quest-context.tsx`) into a pure function of
// `(quest, payload[, ctx])`. The legacy transaction/normalization/actionLog
// wrappers are engine concerns and live elsewhere now (the root reducer folds,
// the eventlog engine persists), so they are dropped here. These functions read
// nothing but their arguments — no Firebase, no React, no live clock/rng (the
// src/rules/ lint rails); randomness arrives via `ctx.rng` and time via
// `ctx.timestamp`.
//
// Quest-only cases return the new `QuestState` (or `null` to bounce). The two
// cases that also touch the battle slice (`RESET_QUEST`, `LOAD_STATE`) return a
// whole `FoldState`.

import { genesisFoldState } from "../fold-state";
import type { BattleFoldState, FoldState } from "../fold-state";
import { toQuestDreamcaller } from "../../data/dreamcaller-selection";
import type { ResolvedDreamcallerPackage } from "../../types/content";
import type { QuestState, Screen } from "../../types/quest";

// ---------------------------------------------------------------------------
// Content-provider seam (SELECT_DREAMCALLER / START_QUEST)
// ---------------------------------------------------------------------------

/**
 * The deterministic content the two run-assembly cases need but cannot compute
 * inside a pure reducer: the real Dreamcaller pool, atlas, and draft state are
 * generated from TOML-sourced card/dreamcaller data that only loads
 * asynchronously (`loadQuestContent` in src/data/), while the reducer must fold
 * synchronously from `(state, event, ctx)` alone.
 *
 * The impure side (app/coop bootstrap, which has already loaded the content)
 * registers a provider whose functions are PURE and DETERMINISTIC in
 * `(dreamcallerId, seed)`: the run `seed` is always `quest.seed` (fixed per
 * room at genesis), never a freshly-minted one, so two clients folding the same
 * log resolve byte-identical packages. Legacy `startQuestFromDreamcaller` minted
 * a fresh `generateQuestSeed()` (a `crypto`/`Math.random` source); pinning the
 * generation seed to `quest.seed` is the determinism fix.
 *
 * SEAM: real content registration is deferred to the integration task that
 * wires the reducer into src/coop/. Until a provider is registered,
 * SELECT_DREAMCALLER and START_QUEST bounce (a recorded no-op, never a throw).
 */
export interface QuestLifecycleContentProvider {
  /**
   * Resolve one Dreamcaller's package deterministically from its id and the
   * run seed. Returns `null` when the id is unknown (the case bounces).
   */
  resolveDreamcallerPackage(
    dreamcallerId: string,
    seed: string,
  ): ResolvedDreamcallerPackage | null;
  /**
   * Assemble the full started-run quest state (starter deck, atlas, draft
   * state, essence, opening screen) deterministically. Must preserve
   * `input.quest.seed`. Returns `null` to bounce (e.g. unknown dreamcaller).
   */
  startQuest(input: {
    quest: QuestState;
    dreamcallerId: string;
    seed: string;
  }): QuestState | null;
}

let contentProvider: QuestLifecycleContentProvider | null = null;

/**
 * Register (or clear, with `null`) the deterministic content provider the
 * run-assembly cases delegate to. Idempotent; the last registration wins.
 */
export function registerQuestLifecycleContentProvider(
  provider: QuestLifecycleContentProvider | null,
): void {
  contentProvider = provider;
}

/** The currently registered provider, or `null` when none is wired. */
export function getQuestLifecycleContentProvider(): QuestLifecycleContentProvider | null {
  return contentProvider;
}

// ---------------------------------------------------------------------------
// Essence & caps
// ---------------------------------------------------------------------------

/** Clamp essence to `[0, cap]` (relocated from `quest-state-actions.clampEssence`). */
function clampEssence(value: number, cap: number): number {
  return Math.max(0, Math.min(value, cap));
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `ADJUST_ESSENCE { delta }` — legacy `changeEssence`. */
export function adjustEssence(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const delta = finiteNumber(payload.delta);
  if (delta === null) return null;
  return {
    ...quest,
    essence: clampEssence(quest.essence + delta, quest.essenceCap),
  };
}

/** `SET_ESSENCE { value }` — legacy `setEssence`. */
export function setEssence(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const value = finiteNumber(payload.value);
  if (value === null) return null;
  return { ...quest, essence: clampEssence(value, quest.essenceCap) };
}

/** `ADJUST_ESSENCE_CAP { delta }` — legacy `changeMaxEssence` (cap floored at 0, essence re-clamped). */
export function adjustEssenceCap(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const delta = finiteNumber(payload.delta);
  if (delta === null) return null;
  const essenceCap = Math.max(0, quest.essenceCap + delta);
  return {
    ...quest,
    essenceCap,
    essence: clampEssence(quest.essence, essenceCap),
  };
}

/** `SET_ESSENCE_CAP { value }` — legacy `setEssenceCap` (essence re-clamped to the new cap). */
export function setEssenceCap(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const value = finiteNumber(payload.value);
  if (value === null) return null;
  const essenceCap = Math.max(0, value);
  return {
    ...quest,
    essenceCap,
    essence: clampEssence(quest.essence, essenceCap),
  };
}

/** `SET_MAX_DREAMSIGNS { value }` — legacy `setMaxDreamsigns` (debug edit). */
export function setMaxDreamsigns(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const value = finiteNumber(payload.value);
  if (value === null) return null;
  return { ...quest, maxDreamsigns: value };
}

/** `SET_COMPLETION_LEVEL { value }` — legacy `setCompletionLevel` (debug edit). */
export function setCompletionLevel(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const value = finiteNumber(payload.value);
  if (value === null) return null;
  return { ...quest, completionLevel: value };
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

const SCREEN_TYPES: ReadonlySet<Screen["type"]> = new Set<Screen["type"]>([
  "questStart",
  "atlas",
  "dreamscape",
  "site",
  "questComplete",
  "questFailed",
]);

function asScreen(value: unknown): Screen | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { type?: unknown; siteId?: unknown };
  if (
    typeof candidate.type !== "string" ||
    !SCREEN_TYPES.has(candidate.type as Screen["type"])
  ) {
    return null;
  }
  if (candidate.type === "site") {
    if (typeof candidate.siteId !== "string") return null;
    return { type: "site", siteId: candidate.siteId };
  }
  return { type: candidate.type as Exclude<Screen["type"], "site"> };
}

/** `SET_SCREEN { screen }` — legacy `setScreen` / `setQuestScreen`. */
export function setScreen(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const screen = asScreen(payload.screen);
  if (screen === null) return null;
  return {
    ...quest,
    screen,
    activeSiteId: screen.type === "site" ? screen.siteId : null,
  };
}

/** `TRAVEL_TO_DREAMSCAPE { nodeId }` — legacy `setCurrentDreamscape`. */
export function travelToDreamscape(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const nodeId = payload.nodeId;
  if (typeof nodeId !== "string") return null;
  const isAdvancing = nodeId !== quest.currentDreamscape;
  const dreamscapeModifiers = isAdvancing
    ? quest.dreamscapeModifiers
        .map((modifier) => ({
          ...modifier,
          dreamscapesRemaining: modifier.dreamscapesRemaining - 1,
        }))
        .filter((modifier) => modifier.dreamscapesRemaining > 0)
    : quest.dreamscapeModifiers;
  return {
    ...quest,
    currentDreamscape: nodeId,
    visitedSites: [],
    dreamscapeModifiers,
  };
}

/** `MARK_SITE_VISITED { siteId }` — legacy `markSiteVisited` (idempotent). */
export function markSiteVisited(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const siteId = payload.siteId;
  if (typeof siteId !== "string") return null;
  if (quest.visitedSites.includes(siteId)) {
    // Already visited — recorded no-op (returns unchanged state, "applied").
    return quest;
  }
  const updatedNodes = { ...quest.atlas.nodes };
  for (const [nodeId, node] of Object.entries(updatedNodes)) {
    const siteIndex = node.sites.findIndex((site) => site.id === siteId);
    if (siteIndex !== -1) {
      updatedNodes[nodeId] = {
        ...node,
        sites: node.sites.map((site, index) =>
          index === siteIndex ? { ...site, isVisited: true } : site,
        ),
      };
      break;
    }
  }
  return {
    ...quest,
    visitedSites: [...quest.visitedSites, siteId],
    atlas: { ...quest.atlas, nodes: updatedNodes },
  };
}

/** `DISMISS_STARTING_DECK_POPUP { }` — legacy `dismissStartingDeckPopup`. */
export function dismissStartingDeckPopup(quest: QuestState): QuestState | null {
  if (quest.hasSeenStartingDeckPopup) return quest;
  return { ...quest, hasSeenStartingDeckPopup: true };
}

// ---------------------------------------------------------------------------
// Dreamcaller selection & run assembly
// ---------------------------------------------------------------------------

/**
 * `SELECT_DREAMCALLER { dreamcallerId }` — legacy `setDreamcallerSelection`,
 * with the package resolution the legacy mutation trusted from the client
 * moved in-reducer: the package is derived deterministically from
 * `(dreamcallerId, quest.seed)` via the registered content provider (see
 * {@link QuestLifecycleContentProvider}). Bounces with no provider or an
 * unknown dreamcaller. The state merge mirrors legacy `applyDreamcallerSelection`.
 */
export function selectDreamcaller(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const dreamcallerId = payload.dreamcallerId;
  if (typeof dreamcallerId !== "string") return null;
  const provider = contentProvider;
  if (provider === null) return null;
  const resolvedPackage = provider.resolveDreamcallerPackage(
    dreamcallerId,
    quest.seed,
  );
  if (resolvedPackage === null) return null;
  return {
    ...quest,
    dreamcaller: toQuestDreamcaller(resolvedPackage.dreamcaller),
    resolvedPackage,
    remainingDreamsignPool: [...resolvedPackage.dreamsignPoolIds],
  };
}

/**
 * `START_QUEST { dreamcallerId }` — legacy `startQuest` / `startQuestFromDreamcaller`.
 *
 * The full run assembly (pool package, starter deck, atlas generation, draft
 * state) is content- and generator-heavy, so it is delegated to the registered
 * content provider, which is deterministic in `(dreamcallerId, quest.seed)`.
 * The reducer owns the guards the legacy transaction owned: it is a no-op once a
 * dreamcaller is already selected (legacy checked `questState.dreamcaller !==
 * null`), and it bounces when no provider is wired or the dreamcaller is unknown.
 *
 * The provider MUST preserve `quest.seed` (the room seed pinned at genesis) so
 * RESET_QUEST can always reconstruct the genesis fold.
 */
export function startQuest(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  if (quest.dreamcaller !== null) return null;
  const dreamcallerId = payload.dreamcallerId;
  if (typeof dreamcallerId !== "string") return null;
  const provider = contentProvider;
  if (provider === null) return null;
  return provider.startQuest({ quest, dreamcallerId, seed: quest.seed });
}

// ---------------------------------------------------------------------------
// Whole-fold cases (touch the battle slice)
// ---------------------------------------------------------------------------

/**
 * `RESET_QUEST { }` — legacy `resetQuest`. Resets the quest slice to the
 * genesis fold (preserving the room seed, which is `quest.seed`) and clears the
 * battle slice. The output equals `genesisFoldState(genesis)` for the room's
 * genesis, so a forgotten field on reset is caught by the reset-completeness
 * hash test.
 */
export function resetQuest(state: FoldState): FoldState {
  // `genesisFoldState` derives the fold from `genesis.seed` alone; the other
  // genesis fields (reducerVersion / createdAt / contentConfig) are pinned at
  // room creation and are not read here, so placeholders satisfy the type.
  return genesisFoldState({
    seed: state.quest.seed,
    reducerVersion: "",
    createdAt: 0,
    contentConfig: { poolVariant: "", draftMode: "pool", fresh20PackSize: null, journeyVariant: "v2" },
  });
}

function asBattleFoldState(value: unknown): BattleFoldState | null {
  if (typeof value !== "object" || value === null) return null;
  return value as BattleFoldState;
}

/**
 * `LOAD_STATE { snapshot, battle? }` — legacy `loadQuestState` /
 * `bootstrapQaScene`. Replaces the quest slice with the provided snapshot
 * (debug / QA bootstrap; a large payload is fine) and sets the battle slice
 * from `payload.battle` when present, else clears it. Bounces on a non-object
 * snapshot.
 *
 * SEAM: the battle payload is passed through as-is; the authoritative
 * `BattleFoldState` shape and its validation are owned by the battle tasks
 * (18/19), which will narrow this once the real battle fold exists.
 */
export function loadState(
  _state: FoldState,
  payload: Record<string, unknown>,
): FoldState | null {
  const snapshot = payload.snapshot;
  if (typeof snapshot !== "object" || snapshot === null) return null;
  return {
    quest: snapshot as QuestState,
    battle: "battle" in payload ? asBattleFoldState(payload.battle) : null,
  };
}
