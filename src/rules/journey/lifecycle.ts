import { validCommittedPurgePrevention } from "./journey-committed-purge-state";
import { validStarterPurgeScreen, validStarterBattleBinding } from "./journey-starter-acquisition";
import { validJourneyDuplicationScreen } from "./journey-duplication";
import { validJourneyDreamsignScreen, validDreamsignBattleBinding } from "./journey-on-gain";
import { getDeckContentProvider } from "./deck";
import { validPreventedNightmareGains } from "./journey-deck-entry";
import { journeyModifierRegistry, type JourneyModifierRegistry } from "./modifier-registry";
import { validJourneyTransfigurationScreen } from "./journey-transfiguration";
import { validJourneyPurgeScreen } from "./journey-purge";
import { validJourneySiteCounters } from "./journey-sites";
// Pure journey-lifecycle, essence, and navigation reducer cases.
//
// Each exported case is a pure function of `(journey, payload[, ctx])`; the
// root reducer folds the event and the eventlog engine persists it. These
// functions read nothing but their arguments — no React, no live clock/rng (the
// src/rules/ lint rails); randomness arrives via `ctx.rng` and time via
// `ctx.timestamp`.
//
// Journey-only cases return the new `JourneyState` (or `null` to bounce). The two
// cases that also touch the battle slice (`RESET_JOURNEY`, `LOAD_STATE`) return a
// whole `FoldState`.

import { initialFoldState } from "../fold-state";
import type { BattleFoldState, FoldState } from "../fold-state";
import { parseJourneyBattleFoldState } from "../battle/fold";
import { parseTutorialBattleFoldState } from "../battle/tutorial-load";
import { toJourneyAvatar } from "../../data/avatar-selection";
import type { ResolvedAvatarPackage } from "../../types/content";
import type { JourneyState, SiteType } from "../../types/journey";
import type { EventContext } from "../../eventlog/types";
import { canVisitSite, clampEssence, getSiteContentProvider, isEnhancedDreamsignReward } from "./sites";
import {
  isRandomSiteMetadata,
  materializeRandomSite,
} from "../../random-site/random-site";
import { SITE_TYPES } from "../../types/site-type";

import type { AvatarId } from "../../types/identifiers";
import { parseSiteId, deckEntryIdFromUnknown } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseAvatarId } from "../../types/identifiers";
import { dreamsignIdFromUnknown, siteIdFromUnknown } from "../../types/identifiers";
import { parseJourneyId } from "../../types/identifiers";
import type { JourneySeed } from "../../types/journey-seed";

// ---------------------------------------------------------------------------
// Content-provider seam (SELECT_AVATAR / START_JOURNEY)
// ---------------------------------------------------------------------------

/**
 * The deterministic content the two run-assembly cases need but cannot compute
 * inside a pure reducer: the real Avatar pool, atlas, and draft state are
 * generated from catalog-sourced card/avatar data that only loads
 * asynchronously (`loadJourneyContent` in src/data/), while the reducer must
 * fold synchronously from `(state, event, ctx)` alone.
 *
 * The impure side (the session bootstrap, which has already loaded the
 * content) registers a provider whose functions are PURE and DETERMINISTIC in
 * `(avatarId, seed)`: the run `seed` is always `journey.seed` (fixed per
 * game at genesis), never a freshly-minted one, so every fold of the same log
 * resolves byte-identical packages.
 *
 * `createJourneyLifecycleContentProvider`
 * (src/session/providers/lifecycle-provider.ts) supplies every member from the
 * loaded journey content. Until a provider is registered, SELECT_AVATAR,
 * START_JOURNEY, and REGENERATE_ATLAS bounce (a recorded no-op, never a throw).
 */
export interface JourneyLifecycleContentProvider {
  /**
   * Resolve one Avatar's package deterministically from its id and the
   * run seed. Returns `null` when the id is unknown (the case bounces).
   */
  resolveAvatarPackage(
    avatarId: AvatarId,
    seed: JourneySeed,
  ): ResolvedAvatarPackage | null;
  /**
   * Assemble the full started-run journey state (starter deck, atlas, draft
   * state, essence, opening screen) deterministically. Must preserve
   * `input.journey.seed`. Returns `null` to bounce (e.g. unknown avatar).
   */
  startJourney(input: {
    journey: JourneyState;
    avatarId: AvatarId;
    seed: JourneySeed;
  }): JourneyState | null;
  /**
   * Rebuild the Atlas at the journey's authoritative progress depth. Returns
   * `null` to bounce when `completionLevel` is past the content's final
   * completion level.
   */
  regenerateAtlas(input: {
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

// ---------------------------------------------------------------------------
// Essence
// ---------------------------------------------------------------------------

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `ADJUST_ESSENCE { delta }` adds `delta` to the clamped essence total. */
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

/** `SET_ESSENCE { value }` sets the clamped essence total. */
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
 * `SET_MAX_DREAMSIGNS { value }` (debug edit).
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
    };
  }
  return {
    ...journey,
    screen: { type: "site", siteId: parseSiteId(siteId) },
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
    dreamscapeModifiers,
    screen: { type: "dreamscape" },
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
    completionLevel < 0
  ) {
    return null;
  }
  if (contentProvider === null) return null;
  return contentProvider.regenerateAtlas({
    journey,
    completionLevel,
    rng: ctx.rng,
  });
}

/** `DISMISS_STARTING_DECK_POPUP { }` marks the starting-deck popup seen. */
export function dismissStartingDeckPopup(
  journey: JourneyState,
): JourneyState | null {
  if (journey.hasSeenStartingDeckPopup) return journey;
  return { ...journey, hasSeenStartingDeckPopup: true };
}

/**
 * `REROLL_AVATAR_OFFER { }` — increment the shared journey-start reroll
 * count. The screen adapter combines this count with the immutable game seed,
 * so the event log reproduces the same offer on every reload and replay.
 */
export function rerollAvatarOffer(
  journey: JourneyState,
): JourneyState | null {
  if (
    journey.avatar !== null ||
    journey.screen.type !== "journeyStart" ||
    journey.screen.tutorialAvatarId !== undefined
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
// Avatar selection & run assembly
// ---------------------------------------------------------------------------

/**
 * `SELECT_AVATAR { avatarId }` selects the Avatar. The package is derived
 * in-reducer, deterministically from `(avatarId, journey.seed)`, via the
 * registered content provider (see {@link JourneyLifecycleContentProvider}).
 * Bounces with no provider or an unknown avatar.
 */
export function selectAvatar(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const avatarId = payload.avatarId;
  if (typeof avatarId !== "string") return null;
  const provider = contentProvider;
  if (provider === null) return null;
  const resolvedPackage = provider.resolveAvatarPackage(
    parseAvatarId(avatarId),
    journey.seed,
  );
  if (resolvedPackage === null) return null;
  return {
    ...journey,
    avatar: toJourneyAvatar(resolvedPackage.avatar),
    resolvedPackage,
    remainingDreamsignPool: [...resolvedPackage.dreamsignPoolIds],
  };
}

/**
 * `START_JOURNEY { avatarId }` assembles the run.
 *
 * The full run assembly (pool package, starter deck, atlas generation, draft
 * state) is content- and generator-heavy, so it is delegated to the registered
 * content provider, which is deterministic in `(avatarId, journey.seed)`.
 * The reducer owns the guards: it bounces once an Avatar is already selected
 * (`journey.avatar !== null`), when no provider is wired, or when the avatar is
 * unknown.
 *
 * The provider MUST preserve `journey.seed` (the game seed pinned at genesis)
 * so RESET_JOURNEY can always reconstruct the genesis fold.
 */
export function startJourney(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  if (journey.avatar !== null) return null;
  const avatarId = payload.avatarId;
  if (typeof avatarId !== "string") return null;
  const provider = contentProvider;
  if (provider === null) return null;
  const started = provider.startJourney({
    journey,
    avatarId: parseAvatarId(avatarId),
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
 * `RESET_JOURNEY { }` resets the fold to the
 * {@link initialFoldState} for the game seed (`journey.seed`) and the economy
 * pinned in the game's content configuration, keeping the front door and the
 * tutorials already presented. A forgotten field on reset is caught by the
 * reset-completeness hash test.
 */
export function resetJourney(state: FoldState, ctx: EventContext): FoldState {
  return {
    ...initialFoldState(state.journey.seed, ctx.contentConfig),
    frontDoor: state.frontDoor,
    tutorialTriggerIdsSeen: state.tutorialTriggerIdsSeen,
    cardTutorialScreenKeysSeen: state.cardTutorialScreenKeysSeen,
  };
}

/**
 * `LOAD_STATE { snapshot, battle? }`, submitted by the `loadJourneyState` and
 * `bootstrapQaScene` mutations, replaces the journey slice with the provided
 * snapshot (debug / QA bootstrap; a large payload is fine) and sets the battle
 * slice from `payload.battle` when present, else clears it.
 *
 * Because a `LOAD_STATE` folds identically on every replay, an unvalidated one
 * would fold the game into a possibly-insane state (a foreign `seed`, a
 * nulled run field mid-run, a planted `pendingPrompt` whose parked cursor
 * points past its script). {@link validateLoadedState} enforces the structural
 * and fold-consistency invariants and this case bounces on any violation.
 */
export function loadState(
  state: FoldState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  registry: JourneyModifierRegistry = journeyModifierRegistry,
): FoldState | null {
  const loaded = validateLoadedState(state, payload, registry);
  return loaded === null
    ? null
    : {
        ...loaded,
        journey: {
          ...loaded.journey,
          runId: parseJourneyId(`journey:${String(ctx.seq)}`),
        },
      };
}

/**
 * Validates a `LOAD_STATE` payload against the fold's invariants, returning the
 * next {@link FoldState} to apply or `null` to bounce. Checks:
 *   - `snapshot` is an object carrying the required `JourneyState` fields with the
 *     correct primitive/container types;
 *   - `snapshot.seed === state.journey.seed` (the game seed, pinned equal to
 *     `genesis.seed` at creation) — a foreign seed would desync every derived
 *     generator;
 *   - no run field (`avatar` / `resolvedPackage` / `draftState`) that is
 *     currently non-null is nulled by the snapshot (the run-field nullability
 *     invariant the property sweep protects);
 *   - if a battle slice is supplied, it is a well-formed {@link BattleFoldState}:
 *     a journey battle whose every init field, engine init, and engine slice
 *     parses ({@link parseJourneyBattleFoldState}), or a tutorial battle
 *     whose every `effectQueue`/`pendingPrompt` `scriptRef` resolves in the
 *     live effect tables and whose cursors address real positions in that
 *     script.
 *
 * Content values (whether a card id names a catalog card, costs, pool
 * contents) are NOT asserted — only shape and the fold invariants — so the
 * check is resilient to catalog edits.
 */
export function validateLoadedState(
  state: FoldState,
  payload: Record<string, unknown>,
  registry: JourneyModifierRegistry = journeyModifierRegistry,
): FoldState | null {
  const snapshot = payload.snapshot;
  if (!isJourneyStateShape(snapshot, registry)) return null;
  if (snapshot.seed !== state.journey.seed) return null;

  const before = state.journey;
  if (before.avatar != null && snapshot.avatar == null) return null;
  if (before.resolvedPackage != null && snapshot.resolvedPackage == null)
    return null;
  if (before.draftState != null && snapshot.draftState == null) return null;

  if ((snapshot.screen.type === "journeyPurge" || snapshot.screen.type === "journeyTransfiguration" || snapshot.screen.type === "journeyDuplication") && payload.battle != null) return null;
  let battle: BattleFoldState | null = null;
  if ("battle" in payload && payload.battle != null) {
    battle = asValidBattleFoldState(payload.battle);
    if (battle === null) return null;
  }

  if (snapshot.screen.type === "journeyStarterPurge" && !validStarterBattleBinding(snapshot, battle)) return null;
  if (snapshot.screen.type === "journeyStarterPurge" && snapshot.screen.choice.suspendedBattle?.mode === "tutorial" && (battle?.mode.kind !== "tutorial" || state.frontDoor.phase !== "tutorial" || state.frontDoor.tutorial?.runId !== battle.mode.tutorialRunId)) return null;
  if (snapshot.screen.type === "journeyDreamsign" && !validDreamsignBattleBinding(snapshot, battle)) return null;
  if (snapshot.screen.type === "journeyDreamsign" && snapshot.screen.choice.kind === "copy" && snapshot.screen.choice.suspendedBattle?.mode === "tutorial" && (battle?.mode.kind !== "tutorial" || state.frontDoor.phase !== "tutorial" || state.frontDoor.tutorial?.runId !== battle.mode.tutorialRunId)) return null;
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
    if (node.journeySiteEnhancements !== undefined) {
      if (!Array.isArray(node.journeySiteEnhancements)) return false;
      const grants = new Set<string>();
      for (const grant of node.journeySiteEnhancements) {
        if (!isRecord(grant) || dreamsignIdFromUnknown(grant.dreamsignId) === null ||
          siteIdFromUnknown(grant.siteId) === null || typeof grant.entitlement !== "number" ||
          !Number.isSafeInteger(grant.entitlement) || grant.entitlement < 0) return false;
        const key = `${String(grant.dreamsignId)}:${String(grant.entitlement)}`;
        if (grants.has(key)) return false;
        grants.add(key);
      }
    }
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
 * checked as `null`-or-of-type. Present paired prevention sources additionally
 * match their canonical UUID through the registered deck content provider.
 */
function isJourneyStateShape(value: unknown, registry: JourneyModifierRegistry): value is JourneyState {
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
  for (const [rawSiteId, runtime] of Object.entries(value.siteRuntime)) {
    if (!validCommittedPurgePrevention(runtime, id => registry.lookup(id))) return false;
    if (isRecord(runtime) && "enhancedDreamsignOffer" in runtime &&
      (siteIdFromUnknown(rawSiteId) === null || !isEnhancedDreamsignReward(runtime))) return false;
    if (isRecord(runtime) && runtime.journeyEssenceSource !== undefined &&
      (runtime.kind !== "reward" || !isRecord(runtime.reward) || runtime.reward.rewardType !== "dreamsign" ||
        dreamsignIdFromUnknown(runtime.journeyEssenceSource) === null)) return false;
    if (isRecord(runtime) && runtime.kind === "exploration" &&
      (!validJourneySiteCounters(runtime.journeySiteRerolls) ||
        (isRecord(runtime.resolution) && !validPreventedNightmareGains(runtime.resolution.preventedNightmareGains, value.deck as unknown[], runtime.resolution, (id) => registry.lookup(id), runtime.actionOffers, (cardId) => getDeckContentProvider()?.resolveCardNumber(cardId) ?? null)))) return false;
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
  for (const key of ["avatar", "resolvedPackage", "draftState"]) {
    const field = value[key];
    if (field !== null && !isRecord(field)) return false;
  }
  if (isRecord(value.draftState)) {
    const draft = value.draftState;
    const marker = draft.siteFirstEventEntryId;
    if (marker === undefined) {
      if (draft.activeSiteId !== null && draft.sitePicksCompleted !== 0) return false;
    } else {
      if (typeof draft.sitePicksCompleted !== "number" || !Number.isSafeInteger(draft.sitePicksCompleted) || draft.sitePicksCompleted < 0 ||
        typeof draft.pickNumber !== "number" || !Number.isSafeInteger(draft.pickNumber) || draft.pickNumber <= draft.sitePicksCompleted ||
        (draft.activeSiteId !== null && siteIdFromUnknown(draft.activeSiteId) === null)) return false;
      if (marker !== null && (deckEntryIdFromUnknown(marker) === null || draft.activeSiteId === null || draft.sitePicksCompleted === 0)) return false;
    }
  }
  if (isRecord(value.draftState) && value.draftState.currentOfferCount !== undefined &&
    (typeof value.draftState.currentOfferCount !== "number" ||
      !Number.isSafeInteger(value.draftState.currentOfferCount) || value.draftState.currentOfferCount < 1)) return false;
  if (
    value.currentDreamscape !== null &&
    typeof value.currentDreamscape !== "string"
  ) {
    return false;
  }
  for (const runtime of Object.values(value.siteRuntime)) {
    if (!isRecord(runtime) || runtime.kind !== "cardChoice" || runtime.choiceKind !== "transfiguration" || runtime.journeyTransfigurationCount === undefined) continue;
    const permission = runtime.journeyTransfigurationCount;
    if (!isRecord(permission)) return false;
    const id = dreamsignIdFromUnknown(permission.dreamsignId);
    const effect = id === null ? undefined : registry.lookup(id)?.journeySites;
    if (effect?.kind !== "transfigurationCount" || effect.count !== permission.count ||
      typeof permission.heldIndex !== "number" || !Number.isSafeInteger(permission.heldIndex) || permission.heldIndex < 0 ||
      !Array.isArray(runtime.acceptedEntryIds) || runtime.acceptedEntryIds.length > effect.count || new Set(runtime.acceptedEntryIds).size !== runtime.acceptedEntryIds.length) return false;
  }
  if (value.screen.type === "journeyStarterPurge" && !validStarterPurgeScreen(value.screen, value as unknown as JourneyState, registry)) return false;
  if (value.screen.type === "journeyDuplication" && !validJourneyDuplicationScreen(value.screen, value as unknown as JourneyState, registry)) return false;
  if (value.screen.type === "journeyDreamsign" && !validJourneyDreamsignScreen(value.screen, value as unknown as JourneyState, registry)) return false;
  if (value.screen.type === "journeyTransfiguration" && !validJourneyTransfigurationScreen(value.screen, value as unknown as JourneyState, registry)) return false;
  if (value.screen.type === "journeyPurge" && !validJourneyPurgeScreen(value.screen, value as unknown as JourneyState, registry)) return false;
  return true;
}

/**
 * Validates a raw battle payload into a {@link BattleFoldState}, or `null` when
 * it is malformed or names no known battle mode. Battle hosts keep their
 * display metadata, engine slice and durable tutorial checkpoints.
 */
function asValidBattleFoldState(value: unknown): BattleFoldState | null {
  if (!isRecord(value) || !isRecord(value.mode)) return null;
  if (value.mode.kind === "journey") return parseJourneyBattleFoldState(value);
  return value.mode.kind === "tutorial" ? parseTutorialBattleFoldState(value) : null;
}
