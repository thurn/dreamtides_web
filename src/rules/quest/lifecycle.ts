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
import { battleModeOf, resolveScript } from "../battle/fold";
import { toQuestDreamAvatar } from "../../data/dream-avatar-selection";
import type { ResolvedDreamAvatarPackage } from "../../types/content";
import type { QuestState, Screen } from "../../types/quest";
import type { EffectStep } from "../battle/effect-step";
import type { EffectRun, ScriptRef } from "../battle/fold";
import type { ChallengeCursor } from "../battle/fold";
import type { EventContext } from "../../eventlog/types";
import { cloneBattleMutableState } from "../../battle/state/create-initial-state";
import { FRONT_RANK_SLOTS } from "../../battle/types";
import { isTutorialBattleAiActionOverrides } from "../../types/tutorial-ai-action-overrides";

// ---------------------------------------------------------------------------
// Content-provider seam (SELECT_DREAM_AVATAR / START_QUEST)
// ---------------------------------------------------------------------------

/**
 * The deterministic content the two run-assembly cases need but cannot compute
 * inside a pure reducer: the real DreamAvatar pool, atlas, and draft state are
 * generated from TOML-sourced card/dreamAvatar data that only loads
 * asynchronously (`loadQuestContent` in src/data/), while the reducer must fold
 * synchronously from `(state, event, ctx)` alone.
 *
 * The impure side (app/coop bootstrap, which has already loaded the content)
 * registers a provider whose functions are PURE and DETERMINISTIC in
 * `(dreamAvatarId, seed)`: the run `seed` is always `quest.seed` (fixed per
 * room at genesis), never a freshly-minted one, so two clients folding the same
 * log resolve byte-identical packages. Legacy `startQuestFromDreamAvatar` minted
 * a fresh `generateQuestSeed()` (a `crypto`/`Math.random` source); pinning the
 * generation seed to `quest.seed` is the determinism fix.
 *
 * SEAM: real content registration is deferred to the integration task that
 * wires the reducer into src/coop/. Until a provider is registered,
 * SELECT_DREAM_AVATAR and START_QUEST bounce (a recorded no-op, never a throw).
 */
export interface QuestLifecycleContentProvider {
  /**
   * Resolve one DreamAvatar's package deterministically from its id and the
   * run seed. Returns `null` when the id is unknown (the case bounces).
   */
  resolveDreamAvatarPackage(
    dreamAvatarId: string,
    seed: string,
  ): ResolvedDreamAvatarPackage | null;
  /**
   * Assemble the full started-run quest state (starter deck, atlas, draft
   * state, essence, opening screen) deterministically. Must preserve
   * `input.quest.seed`. Returns `null` to bounce (e.g. unknown dreamAvatar).
   */
  startQuest(input: {
    quest: QuestState;
    dreamAvatarId: string;
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

/** Clamp a debug-setter value to a non-negative integer (floor at 0, truncate toward 0). */
function clampToNonNegativeInteger(value: number): number {
  return Math.max(0, Math.trunc(value));
}

/**
 * `SET_MAX_DREAMSIGNS { value }` — legacy `setMaxDreamsigns` (debug edit).
 * Clamped to a non-negative integer; a non-finite payload still bounces (a
 * debug tool typo should never poison the fold with `NaN`/`Infinity`).
 */
export function setMaxDreamsigns(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const value = finiteNumber(payload.value);
  if (value === null) return null;
  return { ...quest, maxDreamsigns: clampToNonNegativeInteger(value) };
}

/**
 * `SET_COMPLETION_LEVEL { value }` — legacy `setCompletionLevel` (debug edit).
 * Clamped to a non-negative integer; a non-finite payload still bounces.
 */
export function setCompletionLevel(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const value = finiteNumber(payload.value);
  if (value === null) return null;
  return { ...quest, completionLevel: clampToNonNegativeInteger(value) };
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

/**
 * `TRAVEL_TO_DREAMSCAPE { nodeId }` — enter an Atlas node atomically. The
 * selected node and the route are one player decision, so both are folded by
 * this event rather than submitted as independently-bounceable intents.
 */
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
    screen: { type: "dreamscape" },
    activeSiteId: null,
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

/**
 * `REROLL_DREAM_AVATAR_OFFER { }` — increment the shared quest-start reroll
 * count. The screen adapter combines this count with the immutable room seed,
 * so the event log reproduces the same offer on every client and reload.
 */
export function rerollDreamAvatarOffer(
  quest: QuestState,
): QuestState | null {
  if (
    quest.dreamAvatar !== null ||
    quest.screen.type !== "questStart" ||
    quest.screen.tutorialDreamAvatarId !== undefined
  ) {
    return null;
  }
  return {
    ...quest,
    screen: {
      type: "questStart",
      rerollCount: (quest.screen.rerollCount ?? 0) + 1,
    },
  };
}

// ---------------------------------------------------------------------------
// DreamAvatar selection & run assembly
// ---------------------------------------------------------------------------

/**
 * `SELECT_DREAM_AVATAR { dreamAvatarId }` — legacy `setDreamAvatarSelection`,
 * with the package resolution the legacy mutation trusted from the client
 * moved in-reducer: the package is derived deterministically from
 * `(dreamAvatarId, quest.seed)` via the registered content provider (see
 * {@link QuestLifecycleContentProvider}). Bounces with no provider or an
 * unknown dreamAvatar. The state merge mirrors legacy `applyDreamAvatarSelection`.
 */
export function selectDreamAvatar(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const dreamAvatarId = payload.dreamAvatarId;
  if (typeof dreamAvatarId !== "string") return null;
  const provider = contentProvider;
  if (provider === null) return null;
  const resolvedPackage = provider.resolveDreamAvatarPackage(
    dreamAvatarId,
    quest.seed,
  );
  if (resolvedPackage === null) return null;
  return {
    ...quest,
    dreamAvatar: toQuestDreamAvatar(resolvedPackage.dreamAvatar),
    resolvedPackage,
    remainingDreamsignPool: [...resolvedPackage.dreamsignPoolIds],
  };
}

/**
 * `START_QUEST { dreamAvatarId }` — legacy `startQuest` / `startQuestFromDreamAvatar`.
 *
 * The full run assembly (pool package, starter deck, atlas generation, draft
 * state) is content- and generator-heavy, so it is delegated to the registered
 * content provider, which is deterministic in `(dreamAvatarId, quest.seed)`.
 * The reducer owns the guards the legacy transaction owned: it is a no-op once a
 * dreamAvatar is already selected (legacy checked `questState.dreamAvatar !==
 * null`), and it bounces when no provider is wired or the dreamAvatar is unknown.
 *
 * The provider MUST preserve `quest.seed` (the room seed pinned at genesis) so
 * RESET_QUEST can always reconstruct the genesis fold.
 */
export function startQuest(
  quest: QuestState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): QuestState | null {
  if (quest.dreamAvatar !== null) return null;
  const dreamAvatarId = payload.dreamAvatarId;
  if (typeof dreamAvatarId !== "string") return null;
  const provider = contentProvider;
  if (provider === null) return null;
  const started = provider.startQuest({
    quest,
    dreamAvatarId,
    seed: quest.seed,
  });
  return started === null
    ? null
    : { ...started, runId: `quest:${String(ctx.seq)}` };
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
  const reset = genesisFoldState({
    seed: state.quest.seed,
    reducerVersion: "",
    createdAt: 0,
    contentConfig: {
      poolVariant: "",
      draftMode: "pool",
      fresh20PackSize: null,
    },
  });
  return {
    ...reset,
    frontDoor: state.frontDoor,
    ...(state.tutorialTriggerIdsSeen === undefined
      ? {}
      : { tutorialTriggerIdsSeen: state.tutorialTriggerIdsSeen }),
  };
}

/**
 * `LOAD_STATE { snapshot, battle? }` — legacy `loadQuestState` /
 * `bootstrapQaScene`. Replaces the quest slice with the provided snapshot
 * (debug / QA bootstrap; a large payload is fine) and sets the battle slice from
 * `payload.battle` when present, else clears it.
 *
 * Because a `LOAD_STATE` folds identically on every client, an unvalidated one
 * would converge the whole room to a possibly-insane state (a foreign `seed`, a
 * nulled run field mid-run, a planted `pendingPrompt` whose parked cursor points
 * past its script). {@link validateLoadedState} enforces the structural and
 * fold-consistency invariants and this case bounces on any violation.
 */
export function loadState(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): FoldState | null {
  const loaded = validateLoadedState(state, payload);
  return loaded === null
    ? null
    : {
        ...loaded,
        quest: { ...loaded.quest, runId: `quest:${String(ctx.seq)}` },
        ...(state.tutorialTriggerIdsSeen === undefined
          ? {}
          : { tutorialTriggerIdsSeen: state.tutorialTriggerIdsSeen }),
      };
}

/**
 * Validates a `LOAD_STATE` payload against the fold's invariants, returning the
 * next {@link FoldState} to apply or `null` to bounce. Checks:
 *   - `snapshot` is an object carrying the required `QuestState` fields with the
 *     correct primitive/container types;
 *   - `snapshot.seed === state.quest.seed` (the room seed, pinned equal to
 *     `genesis.seed` at creation) — a foreign seed would desync every derived
 *     generator;
 *   - no run field (`dreamAvatar` / `resolvedPackage` / `draftState`) that is
 *     currently non-null is nulled by the snapshot (the run-field nullability
 *     invariant the property sweep protects);
 *   - if a battle slice is supplied, it is a well-formed {@link BattleFoldState}
 *     whose every `effectQueue`/`pendingPrompt` `scriptRef` resolves in the live
 *     effect tables and whose cursors address real positions in that script.
 *
 * Content values (card ids, costs, pool contents) are NOT asserted — only shape
 * and the fold invariants — so the check is resilient to TOML data edits.
 */
export function validateLoadedState(
  state: FoldState,
  payload: Record<string, unknown>,
): FoldState | null {
  const snapshot = payload.snapshot;
  if (!isQuestStateShape(snapshot)) return null;
  if (snapshot.seed !== state.quest.seed) return null;

  const before = state.quest;
  if (before.dreamAvatar != null && snapshot.dreamAvatar == null) return null;
  if (before.resolvedPackage != null && snapshot.resolvedPackage == null)
    return null;
  if (before.draftState != null && snapshot.draftState == null) return null;

  let battle: BattleFoldState | null = null;
  if ("battle" in payload && payload.battle != null) {
    battle = asValidBattleFoldState(payload.battle);
    if (battle === null) return null;
  }

  return { ...state, quest: snapshot, battle };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Structural guard: `value` carries every `QuestState` field this validator
 * relies on, each with the correct primitive/container type. Nullable fields are
 * checked as `null`-or-of-type; content is never inspected.
 */
function isQuestStateShape(value: unknown): value is QuestState {
  if (!isRecord(value)) return false;
  const numberKeys = [
    "essence",
    "essenceCap",
    "maxDreamsigns",
    "completionLevel",
  ];
  for (const key of numberKeys) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]))
      return false;
  }
  const arrayKeys = [
    "deck",
    "remainingDreamsignPool",
    "dreamsigns",
    "visitedSites",
  ];
  for (const key of arrayKeys) {
    if (!Array.isArray(value[key])) return false;
  }
  if (typeof value.seed !== "string") return false;
  if (
    value.runId !== undefined &&
    value.runId !== null &&
    typeof value.runId !== "string"
  )
    return false;
  if (typeof value.hasSeenStartingDeckPopup !== "boolean") return false;
  if (!isRecord(value.atlas)) return false;
  if (!isRecord(value.screen)) return false;
  if (!isRecord(value.siteRuntime)) return false;
  if (!Array.isArray(value.battleModifiers)) return false;
  // Nullable structural fields: null or an object.
  for (const key of ["dreamAvatar", "resolvedPackage", "draftState"]) {
    const field = value[key];
    if (field !== null && !isRecord(field)) return false;
  }
  if (
    value.currentDreamscape !== null &&
    typeof value.currentDreamscape !== "string"
  ) {
    return false;
  }
  if (value.activeSiteId !== null && typeof value.activeSiteId !== "string") {
    return false;
  }
  return true;
}

/**
 * Validates a raw battle payload into a {@link BattleFoldState}, or `null` when
 * it is malformed or references a script the live tables cannot resolve. The
 * board / init shapes are checked structurally; the fold-critical invariant is
 * that every parked run's `scriptRef` resolves and its `cursor` addresses a real
 * step, so the driver never drives a cursor off the end of an unknown script.
 */
function asValidBattleFoldState(value: unknown): BattleFoldState | null {
  if (!isRecord(value)) return null;
  if (!isRecord(value.init) || !isRecord(value.board)) return null;
  if (!isRecord(value.dawnFired)) return null;
  if (value.triggerDawnFired !== undefined && !isDawnMarker(value.triggerDawnFired)) {
    return null;
  }
  if (
    value.basicAutomationEnabled !== undefined &&
    typeof value.basicAutomationEnabled !== "boolean"
  )
    return null;
  if (value.aiBlockingTurn !== undefined) {
    if (!isRecord(value.aiBlockingTurn)) return null;
    if (
      value.aiBlockingTurn.activeSide !== "player" &&
      value.aiBlockingTurn.activeSide !== "enemy"
    )
      return null;
    if (
      typeof value.aiBlockingTurn.turnNumber !== "number" ||
      !Number.isInteger(value.aiBlockingTurn.turnNumber)
    )
      return null;
  }
  if (
    value.tutorialAiActionOverrides !== undefined &&
    !isTutorialBattleAiActionOverrides(value.tutorialAiActionOverrides)
  ) {
    return null;
  }
  if (
    value.consumedTutorialAiActionOverrideIds !== undefined &&
    (!Array.isArray(value.consumedTutorialAiActionOverrideIds) ||
      !value.consumedTutorialAiActionOverrideIds.every(
        (id) => typeof id === "string",
      ) ||
      new Set(value.consumedTutorialAiActionOverrideIds).size !==
        value.consumedTutorialAiActionOverrideIds.length)
  ) {
    return null;
  }
  if (value.challengeCursor !== undefined && value.challengeCursor !== null && !isChallengeCursor(value.challengeCursor)) {
    return null;
  }
  if (!Array.isArray(value.effectQueue)) return null;
  for (const run of value.effectQueue) {
    if (!isResolvableRun(run)) return null;
  }
  const pendingPrompt = value.pendingPrompt;
  if (pendingPrompt !== null) {
    if (!isValidPendingPrompt(pendingPrompt)) return null;
  }
  const loaded = value as unknown as BattleFoldState;
  const board = loaded.board as unknown as Record<string, unknown>;
  const canNormalizeCards = isRecord(board.cardInstances) && isRecord(board.sides);
  return {
    ...loaded,
    mode: battleModeOf(loaded),
    challengeCursor: loaded.challengeCursor ?? null,
    board: canNormalizeCards ? cloneBattleMutableState(loaded.board) : loaded.board,
  };
}

function isChallengeCursor(value: unknown): value is ChallengeCursor {
  if (!isRecord(value)) return false;
  if (value.activeSide !== "player" && value.activeSide !== "enemy") return false;
  if (
    typeof value.nextLane !== "number" ||
    !Number.isInteger(value.nextLane) ||
    value.nextLane < 0 ||
    value.nextLane > FRONT_RANK_SLOTS
  ) {
    return false;
  }
  if (value.handoff === null) return true;
  if (!isRecord(value.handoff)) return false;
  return (
    (value.handoff.activeSide === "player" || value.handoff.activeSide === "enemy") &&
    (value.handoff.phase === "dreamwell" ||
      value.handoff.phase === "draw" ||
      value.handoff.phase === "dawn" ||
      value.handoff.phase === "day" ||
      value.handoff.phase === "dusk" ||
      value.handoff.phase === "night" ||
      value.handoff.phase === "challenge" ||
      value.handoff.phase === "ending") &&
    typeof value.handoff.turnNumber === "number" &&
    Number.isInteger(value.handoff.turnNumber)
  );
}

function isValidPendingPrompt(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (typeof value.promptId !== "number" || !Number.isFinite(value.promptId)) {
    return false;
  }
  if (
    value.kind !== "pick-cards" &&
    value.kind !== "choice" &&
    value.kind !== "confirm" &&
    value.kind !== "foresee"
  ) {
    return false;
  }
  if (!isResolvableRun(value.run)) return false;
  return isActivePromptShape(value.options, value.kind);
}

function isActivePromptShape(
  value: unknown,
  pendingKind: "pick-cards" | "choice" | "confirm" | "foresee",
): boolean {
  if (!isRecord(value)) return false;
  if (pendingKind === "confirm") {
    if (value.kind !== "choice") return false;
  } else if (value.kind !== pendingKind) {
    return false;
  }
  if (typeof value.label !== "string" && value.kind !== "foresee") return false;
  switch (value.kind) {
    case "pick-cards":
      return (
        Array.isArray(value.candidateIds) &&
        value.candidateIds.every((id) => typeof id === "string") &&
        typeof value.count === "number" &&
        Number.isInteger(value.count) &&
        typeof value.optional === "boolean" &&
        Array.isArray(value.highlightCardIds) &&
        value.highlightCardIds.every((id) => typeof id === "string")
      );
    case "choice":
      return (
        Array.isArray(value.options) &&
        value.options.every(
          (option) => isRecord(option) && typeof option.label === "string",
        )
      );
    case "foresee":
      return typeof value.count === "number" && Number.isInteger(value.count);
    default:
      return false;
  }
}

/** A parked run whose `scriptRef` resolves and whose `cursor` is in range. */
function isResolvableRun(value: unknown): value is EffectRun {
  if (!isRecord(value)) return false;
  const ref = value.scriptRef;
  if (!isScriptRef(ref)) return false;
  const cursor = value.cursor;
  if (!Array.isArray(cursor) || !cursor.every((n) => Number.isInteger(n)))
    return false;
  if (value.sourceInstanceId !== undefined && typeof value.sourceInstanceId !== "string") {
    return false;
  }
  if (value.bindings !== undefined && !isEffectBindings(value.bindings)) return false;
  const steps = resolveScript(ref);
  if (steps.length === 0) return false;
  return cursorInRange(steps, cursor as number[]);
}

function isDawnMarker(value: unknown): boolean {
  return isRecord(value) &&
    (value.player === null || (typeof value.player === "number" && Number.isInteger(value.player))) &&
    (value.enemy === null || (typeof value.enemy === "number" && Number.isInteger(value.enemy)));
}

function isEffectBindings(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const trigger = value.trigger;
  if (
    trigger !== undefined &&
    (typeof trigger !== "string" ||
      !["played", "materialized", "rematerialized", "dawn", "dissolved", "abandoned"].includes(trigger))
  ) return false;
  if (value.sourceCardId !== undefined && typeof value.sourceCardId !== "string") return false;
  if (value.sourceController !== undefined && value.sourceController !== "player" && value.sourceController !== "enemy") return false;
  return value.sourceZone === undefined || typeof value.sourceZone === "string";
}

function isScriptRef(value: unknown): value is ScriptRef {
  return (
    isRecord(value) &&
    (value.table === "battle" || value.table === "dreamwell") &&
    typeof value.id === "string"
  );
}

/**
 * A non-throwing counterpart to the driver's cursor navigation: `cursor`
 * addresses a real position when each non-terminal index selects a `confirm`
 * prompt (whose `onYes` the next index descends into) and the terminal index is
 * a valid slot in its branch. An empty cursor never addresses a step.
 */
function cursorInRange(steps: EffectStep[], cursor: number[]): boolean {
  if (cursor.length === 0) return false;
  let list = steps;
  for (let depth = 0; depth < cursor.length; depth += 1) {
    const index = cursor[depth];
    if (index < 0 || index >= list.length) return false;
    if (depth === cursor.length - 1) return true;
    const step = list[index];
    if (step.kind !== "prompt" || step.prompt.kind !== "confirm") return false;
    list = step.prompt.onYes;
  }
  return true;
}
