// Pure journey-lifecycle, essence, and navigation reducer cases.
//
// Each exported case relocates the DOMAIN MATH of a legacy journey mutation
// (`src/state/multiplayer-journey-context.tsx`) into a pure function of
// `(journey, payload[, ctx])`. The legacy transaction/normalization/actionLog
// wrappers are engine concerns and live elsewhere now (the root reducer folds,
// the eventlog engine persists), so they are dropped here. These functions read
// nothing but their arguments — no Firebase, no React, no live clock/rng (the
// src/rules/ lint rails); randomness arrives via `ctx.rng` and time via
// `ctx.timestamp`.
//
// Journey-only cases return the new `JourneyState` (or `null` to bounce). The two
// cases that also touch the battle slice (`RESET_JOURNEY`, `LOAD_STATE`) return a
// whole `FoldState`.

import { genesisFoldState } from "../fold-state";
import type { BattleFoldState, FoldState } from "../fold-state";
import { battleModeOf, resolveScript } from "../battle/fold";
import { toJourneyDreamAvatar } from "../../data/dream-avatar-selection";
import type { ResolvedDreamAvatarPackage } from "../../types/content";
import type { JourneyState, SiteType } from "../../types/journey";
import type { EffectStep } from "../battle/effect-step";
import type { EffectRun, ScriptRef } from "../battle/fold";
import type { ChallengeCursor } from "../battle/fold";
import type { EventContext } from "../../eventlog/types";
import { normalizePersistedNightmareJourney } from "../nightmare-migration";
import { normalizePersistedShopPurchaseJourney } from "../shop-purchase-migration";
import { cloneBattleMutableState } from "../../battle/state/create-initial-state";
import { FRONT_RANK_SLOTS } from "../../battle/types";
import { isTutorialBattleAiActionOverrides } from "../../types/tutorial-ai-action-overrides";
import { canVisitSite, getSiteContentProvider } from "./sites";
import {
  isRandomSiteMetadata,
  materializeRandomSite,
} from "../../random-site/random-site";
import { SITE_TYPES } from "../../types/site-type";
import {
  builtInBattlePromptRefFromV24Descriptor,
  isBuiltInBattlePromptRef,
  isDreamwellPromptRef,
  isLegacyPromptText,
  type BattlePromptText,
} from "../../data/dreamwell-prompts";
import type { DreamAvatarId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseDreamAvatarId } from "../../types/identifiers";
import { parseJourneyId } from "../../types/identifiers";
import type { JourneySeed } from "../../types/journey-seed";

// ---------------------------------------------------------------------------
// Content-provider seam (SELECT_DREAM_AVATAR / START_JOURNEY)
// ---------------------------------------------------------------------------

/**
 * The deterministic content the two run-assembly cases need but cannot compute
 * inside a pure reducer: the real DreamAvatar pool, atlas, and draft state are
 * generated from TOML-sourced card/dreamAvatar data that only loads
 * asynchronously (`loadJourneyContent` in src/data/), while the reducer must fold
 * synchronously from `(state, event, ctx)` alone.
 *
 * The impure side (app/coop bootstrap, which has already loaded the content)
 * registers a provider whose functions are PURE and DETERMINISTIC in
 * `(dreamAvatarId, seed)`: the run `seed` is always `journey.seed` (fixed per
 * room at genesis), never a freshly-minted one, so two clients folding the same
 * log resolve byte-identical packages. Legacy `startJourneyFromDreamAvatar` minted
 * a fresh `generateJourneySeed()` (a `crypto`/`Math.random` source); pinning the
 * generation seed to `journey.seed` is the determinism fix.
 *
 * SEAM: real content registration is deferred to the integration task that
 * wires the reducer into src/coop/. Until a provider is registered,
 * SELECT_DREAM_AVATAR and START_JOURNEY bounce (a recorded no-op, never a throw).
 */
export interface JourneyLifecycleContentProvider {
  /**
   * Resolve one DreamAvatar's package deterministically from its id and the
   * run seed. Returns `null` when the id is unknown (the case bounces).
   */
  resolveDreamAvatarPackage(
    dreamAvatarId: DreamAvatarId,
    seed: JourneySeed,
  ): ResolvedDreamAvatarPackage | null;
  /**
   * Assemble the full started-run journey state (starter deck, atlas, draft
   * state, essence, opening screen) deterministically. Must preserve
   * `input.journey.seed`. Returns `null` to bounce (e.g. unknown dreamAvatar).
   */
  startJourney(input: {
    journey: JourneyState;
    dreamAvatarId: DreamAvatarId;
    seed: JourneySeed;
  }): JourneyState | null;
  /** Rebuild the Atlas at the journey's authoritative progress depth. */
  regenerateAtlas?(input: {
    journey: JourneyState;
    completionLevel: number;
    rng: (drawIndex: number) => number;
  }): JourneyState | null;
}

let contentProvider: JourneyLifecycleContentProvider | null = null;

/**
 * Register (or clear, with `null`) the deterministic content provider the
 * run-assembly cases delegate to. Idempotent; the last registration wins.
 */
export function registerJourneyLifecycleContentProvider(
  provider: JourneyLifecycleContentProvider | null,
): void {
  contentProvider = provider;
}

/** The currently registered provider, or `null` when none is wired. */
export function getJourneyLifecycleContentProvider(): JourneyLifecycleContentProvider | null {
  return contentProvider;
}

// ---------------------------------------------------------------------------
// Essence
// ---------------------------------------------------------------------------

/** Clamp essence to zero or greater. */
function clampEssence(value: number): number {
  return Math.max(0, value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `ADJUST_ESSENCE { delta }` — legacy `changeEssence`. */
export function adjustEssence(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const delta = finiteNumber(payload.delta);
  if (delta === null) return null;
  return {
    ...journey,
    essence: clampEssence(journey.essence + delta),
  };
}

/** `SET_ESSENCE { value }` — legacy `setEssence`. */
export function setEssence(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const value = finiteNumber(payload.value);
  if (value === null) return null;
  return { ...journey, essence: clampEssence(value) };
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
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const value = finiteNumber(payload.value);
  if (value === null) return null;
  return { ...journey, maxDreamsigns: clampToNonNegativeInteger(value) };
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** Enter an eligible site in the current dreamscape. */
export function enterSite(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = payload.siteId;
  if (
    typeof siteId !== "string" ||
    journey.screen.type !== "dreamscape" ||
    journey.currentDreamscape === null ||
    !canVisitSite(journey, parseSiteId(siteId)) ||
    !journey.atlas.nodes[journey.currentDreamscape]?.sites.some(
      (site) => site.id === siteId,
    )
  ) {
    return null;
  }
  const node = journey.atlas.nodes[journey.currentDreamscape];
  const site = node.sites.find((candidate) => candidate.id === siteId);
  if (
    site?.type === "RandomSite" &&
    site.randomSite?.mode === "single" &&
    site.randomSite.destinationSiteType !== undefined
  ) {
    const materialized = materializeRandomSite(
      site,
      site.randomSite.destinationSiteType,
      getSiteContentProvider()?.sitesData.randomSite.guideId,
    );
    return {
      ...journey,
      atlas: {
        ...journey.atlas,
        nodes: {
          ...journey.atlas.nodes,
          [node.id]: {
            ...node,
            sites: node.sites.map((candidate) =>
              candidate.id === siteId ? materialized : candidate,
            ),
          },
        },
      },
      screen: { type: "site", siteId: parseSiteId(siteId) },
      activeSiteId: parseSiteId(siteId),
    };
  }
  return {
    ...journey,
    screen: { type: "site", siteId: parseSiteId(siteId) },
    activeSiteId: parseSiteId(siteId),
  };
}

/**
 * `TRAVEL_TO_DREAMSCAPE { nodeId }` — enter an Atlas node atomically. The
 * selected node and the route are one player decision, so both are folded by
 * this event rather than submitted as independently-bounceable intents.
 */
export function travelToDreamscape(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const nodeId = payload.nodeId;
  if (typeof nodeId !== "string") return null;
  const parsedNodeId = parseAtlasNodeId(nodeId);
  const node = journey.atlas.nodes[parsedNodeId];
  if (
    node === undefined ||
    node.state !== "available" ||
    journey.screen.type !== "atlas"
  ) {
    return null;
  }
  const currentNodeId = journey.atlas.currentNodeId;
  if (
    currentNodeId !== null &&
    currentNodeId !== parsedNodeId &&
    !journey.atlas.nodes[currentNodeId]?.forwardIds.includes(
      parsedNodeId,
    )
  ) {
    return null;
  }
  const isAdvancing = parsedNodeId !== journey.currentDreamscape;
  const dreamscapeModifiers = isAdvancing
    ? journey.dreamscapeModifiers
        .map((modifier) => ({
          ...modifier,
          dreamscapesRemaining: modifier.dreamscapesRemaining - 1,
        }))
        .filter((modifier) => modifier.dreamscapesRemaining > 0)
    : journey.dreamscapeModifiers;
  return {
    ...journey,
    currentDreamscape: parsedNodeId,
    visitedSites: [],
    dreamscapeModifiers,
    screen: { type: "dreamscape" },
    activeSiteId: null,
  };
}

/** Rebuild the Atlas from authoritative progress and registered content. */
export function regenerateAtlas(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const rawLevel = payload.completionLevel;
  const completionLevel =
    rawLevel === undefined ? journey.completionLevel : finiteNumber(rawLevel);
  if (
    completionLevel === null ||
    !Number.isSafeInteger(completionLevel) ||
    completionLevel < 0 ||
    completionLevel > 7
  ) {
    return null;
  }
  return (
    contentProvider?.regenerateAtlas?.({
      journey,
      completionLevel,
      rng: ctx.rng,
    }) ?? null
  );
}

/** `DISMISS_STARTING_DECK_POPUP { }` — legacy `dismissStartingDeckPopup`. */
export function dismissStartingDeckPopup(
  journey: JourneyState,
): JourneyState | null {
  if (journey.hasSeenStartingDeckPopup) return journey;
  return { ...journey, hasSeenStartingDeckPopup: true };
}

/**
 * `REROLL_DREAM_AVATAR_OFFER { }` — increment the shared journey-start reroll
 * count. The screen adapter combines this count with the immutable room seed,
 * so the event log reproduces the same offer on every client and reload.
 */
export function rerollDreamAvatarOffer(
  journey: JourneyState,
): JourneyState | null {
  if (
    journey.dreamAvatar !== null ||
    journey.screen.type !== "journeyStart" ||
    journey.screen.tutorialDreamAvatarId !== undefined
  ) {
    return null;
  }
  return {
    ...journey,
    screen: {
      type: "journeyStart",
      rerollCount: (journey.screen.rerollCount ?? 0) + 1,
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
 * `(dreamAvatarId, journey.seed)` via the registered content provider (see
 * {@link JourneyLifecycleContentProvider}). Bounces with no provider or an
 * unknown dreamAvatar. The state merge mirrors legacy `applyDreamAvatarSelection`.
 */
export function selectDreamAvatar(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const dreamAvatarId = payload.dreamAvatarId;
  if (typeof dreamAvatarId !== "string") return null;
  const provider = contentProvider;
  if (provider === null) return null;
  const resolvedPackage = provider.resolveDreamAvatarPackage(
    parseDreamAvatarId(dreamAvatarId),
    journey.seed,
  );
  if (resolvedPackage === null) return null;
  return {
    ...journey,
    dreamAvatar: toJourneyDreamAvatar(resolvedPackage.dreamAvatar),
    resolvedPackage,
    remainingDreamsignPool: [...resolvedPackage.dreamsignPoolIds],
  };
}

/**
 * `START_JOURNEY { dreamAvatarId }` — legacy `startJourney` / `startJourneyFromDreamAvatar`.
 *
 * The full run assembly (pool package, starter deck, atlas generation, draft
 * state) is content- and generator-heavy, so it is delegated to the registered
 * content provider, which is deterministic in `(dreamAvatarId, journey.seed)`.
 * The reducer owns the guards the legacy transaction owned: it is a no-op once a
 * dreamAvatar is already selected (legacy checked `journeyState.dreamAvatar !==
 * null`), and it bounces when no provider is wired or the dreamAvatar is unknown.
 *
 * The provider MUST preserve `journey.seed` (the room seed pinned at genesis) so
 * RESET_JOURNEY can always reconstruct the genesis fold.
 */
export function startJourney(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  if (journey.dreamAvatar !== null) return null;
  const dreamAvatarId = payload.dreamAvatarId;
  if (typeof dreamAvatarId !== "string") return null;
  const provider = contentProvider;
  if (provider === null) return null;
  const started = provider.startJourney({
    journey,
    dreamAvatarId: parseDreamAvatarId(dreamAvatarId),
    seed: journey.seed,
  });
  return started === null
    ? null
    : { ...started, runId: parseJourneyId(`journey:${String(ctx.seq)}`) };
}

// ---------------------------------------------------------------------------
// Whole-fold cases (touch the battle slice)
// ---------------------------------------------------------------------------

/**
 * `RESET_JOURNEY { }` — legacy `resetJourney`. Resets the journey slice to the
 * genesis fold (preserving the room seed, which is `journey.seed`) and clears the
 * battle slice. The output equals `genesisFoldState(genesis)` for the room's
 * genesis, so a forgotten field on reset is caught by the reset-completeness
 * hash test.
 */
export function resetJourney(state: FoldState, ctx: EventContext): FoldState {
  // Reset rebuilds the initial journey from the room seed and the immutable
  // content configuration carried by the fold context. Reducer version and
  // creation time do not participate in journey initialization.
  const reset = genesisFoldState({
    seed: state.journey.seed,
    reducerVersion: "internal-reset",
    createdAt: 0,
    contentConfig: ctx.contentConfig,
  });
  return {
    ...reset,
    frontDoor: state.frontDoor,
    ...(state.tutorialTriggerIdsSeen === undefined
      ? {}
      : { tutorialTriggerIdsSeen: state.tutorialTriggerIdsSeen }),
    ...(state.cardTutorialScreenKeysSeen === undefined
      ? {}
      : { cardTutorialScreenKeysSeen: state.cardTutorialScreenKeysSeen }),
  };
}

/**
 * `LOAD_STATE { snapshot, battle? }` — legacy `loadJourneyState` /
 * `bootstrapQaScene`. Replaces the journey slice with the provided snapshot
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
        journey: {
          ...loaded.journey,
          runId: parseJourneyId(`journey:${String(ctx.seq)}`),
        },
        ...(state.tutorialTriggerIdsSeen === undefined
          ? {}
          : { tutorialTriggerIdsSeen: state.tutorialTriggerIdsSeen }),
        ...(state.cardTutorialScreenKeysSeen === undefined
          ? {}
          : { cardTutorialScreenKeysSeen: state.cardTutorialScreenKeysSeen }),
      };
}

/**
 * Validates a `LOAD_STATE` payload against the fold's invariants, returning the
 * next {@link FoldState} to apply or `null` to bounce. Checks:
 *   - `snapshot` is an object carrying the required `JourneyState` fields with the
 *     correct primitive/container types;
 *   - `snapshot.seed === state.journey.seed` (the room seed, pinned equal to
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
  const snapshot = normalizePersistedShopPurchaseJourney(
    normalizePersistedNightmareJourney(payload.snapshot),
  );
  if (!isJourneyStateShape(snapshot)) return null;
  if (snapshot.seed !== state.journey.seed) return null;

  const before = state.journey;
  if (before.dreamAvatar != null && snapshot.dreamAvatar == null) return null;
  if (before.resolvedPackage != null && snapshot.resolvedPackage == null)
    return null;
  if (before.draftState != null && snapshot.draftState == null) return null;

  let battle: BattleFoldState | null = null;
  if ("battle" in payload && payload.battle != null) {
    battle = asValidBattleFoldState(payload.battle);
    if (battle === null) return null;
  }

  return { ...state, journey: snapshot, battle };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const CURRENT_SITE_TYPES: ReadonlySet<string> = new Set<SiteType>(SITE_TYPES);

function hasValidAtlasSites(atlas: Record<string, unknown>): boolean {
  if (!isRecord(atlas.nodes)) return false;
  for (const node of Object.values(atlas.nodes)) {
    if (!isRecord(node) || !Array.isArray(node.sites)) return false;
    for (const site of node.sites) {
      if (
        !isRecord(site) ||
        typeof site.id !== "string" ||
        typeof site.type !== "string" ||
        !CURRENT_SITE_TYPES.has(site.type) ||
        typeof site.isEnhanced !== "boolean" ||
        typeof site.isVisited !== "boolean"
      ) {
        return false;
      }
      if (
        site.type === "RandomSite" &&
        !isRandomSiteMetadata(site.randomSite)
      ) {
        return false;
      }
      if (
        site.randomSite !== undefined &&
        !isRandomSiteMetadata(site.randomSite)
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Structural guard: `value` carries every `JourneyState` field this validator
 * relies on, each with the correct primitive/container type. Nullable fields are
 * checked as `null`-or-of-type; content is never inspected.
 */
function isJourneyStateShape(value: unknown): value is JourneyState {
  if (!isRecord(value)) return false;
  const numberKeys = ["essence", "maxDreamsigns", "completionLevel"];
  for (const key of numberKeys) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]))
      return false;
  }
  const arrayKeys = [
    "deck",
    "remainingDreamsignPool",
    "dreamsigns",
    "visitedSites",
    "siteOfferModifiers",
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
  if (!isRecord(value.atlas) || !hasValidAtlasSites(value.atlas)) return false;
  if (!isRecord(value.screen)) return false;
  if (!isRecord(value.siteRuntime)) return false;
  for (const runtime of Object.values(value.siteRuntime)) {
    if (
      isRecord(runtime) &&
      runtime.kind === "shop" &&
      !Array.isArray(runtime.purchaseHistory)
    ) {
      return false;
    }
  }
  if (!Array.isArray(value.battleModifiers)) return false;
  if (
    !isRecord(value.shopModifiers) ||
    typeof value.shopModifiers.freeRerolls !== "number" ||
    !Number.isFinite(value.shopModifiers.freeRerolls) ||
    typeof value.shopModifiers.essenceDiscountPercent !== "number" ||
    !Number.isFinite(value.shopModifiers.essenceDiscountPercent) ||
    !Array.isArray(value.shopModifiers.freeNextShopModifiers) ||
    !Array.isArray(value.shopModifiers.freePurchaseModifiers)
  ) {
    return false;
  }
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
  if (
    value.triggerDawnFired !== undefined &&
    !isDawnMarker(value.triggerDawnFired)
  ) {
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
  if (
    value.challengeCursor !== undefined &&
    value.challengeCursor !== null &&
    !isChallengeCursor(value.challengeCursor)
  ) {
    return null;
  }
  if (!Array.isArray(value.effectQueue)) return null;
  for (const run of value.effectQueue) {
    if (!isResolvableRun(run)) return null;
  }
  const normalizedValue = normalizeLegacyPendingPrompt(value);
  const pendingPrompt = normalizedValue.pendingPrompt;
  if (pendingPrompt !== null) {
    if (!isValidPendingPrompt(pendingPrompt)) return null;
  }
  const loaded = normalizedValue as unknown as BattleFoldState;
  const board = loaded.board as unknown as Record<string, unknown>;
  const canNormalizeCards =
    isRecord(board.cardInstances) && isRecord(board.sides);
  return {
    ...loaded,
    mode: battleModeOf(loaded),
    challengeCursor: loaded.challengeCursor ?? null,
    board: canNormalizeCards
      ? cloneBattleMutableState(loaded.board)
      : loaded.board,
  };
}

function legacyPromptText(value: string): BattlePromptText {
  return { kind: "legacy-prompt-text", text: value };
}

function normalizeImportedPromptText(value: unknown): unknown {
  if (isPromptText(value)) return value;
  const builtIn = builtInBattlePromptRefFromV24Descriptor(value);
  if (builtIn !== null) return builtIn;
  return typeof value === "string" ? legacyPromptText(value) : value;
}

export function normalizeLegacyPendingPrompt(
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (value.pendingPrompt === null || !isRecord(value.pendingPrompt)) {
    return value;
  }
  if (!isRecord(value.pendingPrompt.options)) return value;
  const options = { ...value.pendingPrompt.options };
  options.label = normalizeImportedPromptText(options.label);
  if (options.subtitle !== undefined) {
    options.subtitle = normalizeImportedPromptText(options.subtitle);
  }
  if (Array.isArray(options.options)) {
    const legacyOptions: unknown[] = options.options;
    options.options = legacyOptions.map((option: unknown) => {
      if (!isRecord(option)) return option;
      return {
        ...option,
        label: normalizeImportedPromptText(option.label),
      };
    });
  }
  return {
    ...value,
    pendingPrompt: { ...value.pendingPrompt, options },
  };
}

function isPromptText(value: unknown): value is BattlePromptText {
  return (
    isBuiltInBattlePromptRef(value) ||
    isDreamwellPromptRef(value) ||
    isLegacyPromptText(value)
  );
}

function isChallengeCursor(value: unknown): value is ChallengeCursor {
  if (!isRecord(value)) return false;
  if (value.activeSide !== "player" && value.activeSide !== "enemy")
    return false;
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
    (value.handoff.activeSide === "player" ||
      value.handoff.activeSide === "enemy") &&
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
  if (value.kind !== "foresee" && !isPromptText(value.label)) {
    return false;
  }
  switch (value.kind) {
    case "pick-cards":
      return (
        Array.isArray(value.candidateIds) &&
        value.candidateIds.every((id) => typeof id === "string") &&
        (value.subtitle === undefined || isPromptText(value.subtitle)) &&
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
          (option) => isRecord(option) && isPromptText(option.label),
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
  if (
    value.sourceInstanceId !== undefined &&
    typeof value.sourceInstanceId !== "string"
  ) {
    return false;
  }
  if (value.bindings !== undefined && !isEffectBindings(value.bindings))
    return false;
  const steps = resolveScript(ref);
  if (steps.length === 0) return false;
  return cursorInRange(steps, cursor as number[]);
}

function isDawnMarker(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.player === null ||
      (typeof value.player === "number" && Number.isInteger(value.player))) &&
    (value.enemy === null ||
      (typeof value.enemy === "number" && Number.isInteger(value.enemy)))
  );
}

function isEffectBindings(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const trigger = value.trigger;
  if (
    trigger !== undefined &&
    (typeof trigger !== "string" ||
      ![
        "played",
        "materialized",
        "rematerialized",
        "dawn",
        "dissolved",
        "abandoned",
      ].includes(trigger))
  )
    return false;
  if (
    value.sourceCardId !== undefined &&
    typeof value.sourceCardId !== "string"
  )
    return false;
  if (
    value.sourceController !== undefined &&
    value.sourceController !== "player" &&
    value.sourceController !== "enemy"
  )
    return false;
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
