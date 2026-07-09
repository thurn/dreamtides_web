// Pure site-runtime reducer cases.
//
// This module owns the quest's per-site runtime: it generates each site's
// offer when the player opens it (`OPEN_SITE`), and resolves the player's
// choice at the site (`ACCEPT_*` / `REJECT_*` / `COMPLETE_*`). Each exported
// case relocates the DOMAIN MATH of a legacy quest mutation
// (`src/state/multiplayer-quest-context.tsx`) into a pure function of
// `(quest, payload[, ctx])`. The legacy transaction / normalization / actionLog
// wrappers are engine concerns and live elsewhere now (the root reducer folds,
// the eventlog engine persists), so they are dropped here.
//
// The src/rules/ lint rails forbid Firebase, React, and any live clock/rng:
// randomness arrives via `ctx.rng` and any minted id via `ctx.seq`. Sites are
// keyed by id and cards by UUID/entry-id only — never by name.
//
// OPEN_SITE generation splits by what the site's offer needs:
//   - Essence and DreamAugury need no async content, so they are generated
//     purely in-reducer, drawing from `ctx.rng` (replacing the legacy
//     `Math.random`).
//   - Reward / Dreamsign offer / Shop / Card choice generation reads the
//     TOML-sourced card, dreamsign, and affiliation catalogues that only load
//     asynchronously, so it is delegated to the injectable
//     {@link SiteContentProvider}, which is handed a deterministic
//     `(drawIndex) => number` rng derived from `ctx.rng`. Two clients folding
//     the same event roll byte-identical offers (the determinism fix for the
//     legacy `Math.random` the ensure* family used).

import type { EventContext } from "../../eventlog/types";
import type { DraftState } from "../../types/draft";
import type {
  DeckEntry,
  DreamAugurySiteRuntime,
  Dreamsign,
  QuestState,
  RuntimeShopSlot,
  SiteRuntimeState,
  SiteState,
  TransfigurationType,
} from "../../types/quest";
import { mintEntryId } from "./deck";

// ---------------------------------------------------------------------------
// Content-provider seam (OPEN_SITE generation for content-coupled site types)
// ---------------------------------------------------------------------------

/**
 * The generated runtime for a content-coupled site, plus the optional
 * `remainingDreamsignPool` the generation consumed (reward / dreamsign-offer
 * generation draws Dreamsigns out of the shared pool). When
 * `remainingDreamsignPool` is omitted the pool is left unchanged.
 */
export interface SiteOpenResult {
  runtime: SiteRuntimeState;
  remainingDreamsignPool?: string[];
}

/**
 * The deterministic content `OPEN_SITE` needs for the site types whose offer
 * is generated from async-loaded data (Reward, Dreamsign offer, Shop, Card
 * choice). The reducer resolves the site and enforces idempotence itself, then
 * delegates the offer generation to this provider, handing it a deterministic
 * rng derived from `ctx.rng` so two clients folding the same event produce
 * byte-identical offers.
 *
 * SEAM (Task 26): real content registration is deferred to the integration
 * task that wires the reducer into src/coop/ and relocates the legacy
 * `generateRewardSiteData` / `drawDreamsignOptions` / shop / `buildCardChoiceRuntime`
 * generators behind this seam, reading from the injected rng instead of
 * `Math.random`. Until a provider is registered, `OPEN_SITE` on a
 * content-coupled type bounces (a recorded no-op, never a throw); Essence and
 * DreamAugury are generated purely in-reducer and never need it.
 */
export interface SiteContentProvider {
  /**
   * Generate the runtime for `site` (of a content-coupled type) deterministically
   * from `(quest, site, rng)`, or `null` to bounce. Must not mutate `quest`.
   */
  openSite(input: {
    quest: QuestState;
    site: SiteState;
    rng: (drawIndex: number) => number;
  }): SiteOpenResult | null;

  /**
   * Regenerate a shop's inventory for a `REROLL_SHOP` restock. The pure reducer
   * (see `./shop`) owns the free-reroll-vs-essence decision and the essence /
   * `freeRerolls` / `rerollCount` bookkeeping; only the *content* redraw (which
   * needs the async-loaded card / Dreamsign catalogues and the run draft pool)
   * is delegated here, handed a deterministic `rng` derived from `ctx.rng`.
   * Returns the regenerated slots + Dreamsign pool + draft state, or `null` to
   * bounce.
   *
   * SEAM (Task 26): real registration relocates the legacy `generateShopInventory`
   * redraw (currently `Math.random`-seeded) behind this method, reading from the
   * injected `rng`. Absent (or `null`-returning) → `REROLL_SHOP` bounces.
   */
  rerollShop?(input: {
    quest: QuestState;
    site: SiteState;
    rng: (drawIndex: number) => number;
  }): ShopRerollResult | null;

  /**
   * Resolve a Dream Merchant `ACCEPT_MERCHANT_OFFER` / `DECLINE_MERCHANT` at
   * `site`. The whole resolution (offer lookup, essence / deck / dreamsign
   * payload application, site completion) is content-coupled — it reads the
   * merchant encounter generated from async-loaded quest content — so it lives
   * entirely behind this seam. Returns the fully-updated `QuestState` (site
   * already completed) or `null` to bounce (stale encounter, unknown offer,
   * unaffordable, already-visited). Must not mutate `quest`.
   *
   * SEAM (Task 26): real registration relocates the legacy
   * `resolveMerchantOffer` / `resolveMerchantDecline` (src/journey_v2) behind
   * this method, sourcing randomness from the injected `rng` and minting any
   * new deck entry through `seq` (via `mintEntryId(deck, seq, index)` in
   * ./deck — the SAME scheme every other minting case uses, not a second
   * independently-evolving one; audit finding P3-8). Absent (or
   * `null`-returning) → the merchant events bounce.
   */
  resolveMerchant?(input: {
    quest: QuestState;
    site: SiteState;
    action: "accept" | "decline";
    payload: Record<string, unknown>;
    rng: (drawIndex: number) => number;
    /** This event's seq — the same value `mintEntryId` keys new ids off of. */
    seq: number;
  }): QuestState | null;
}

/**
 * The regenerated content a `REROLL_SHOP` restock produces: a full replacement
 * set of unpurchased slots plus the Dreamsign pools and draft state the redraw
 * consumed. The reducer stores `slots` / `remainingDreamsignPoolIds` on the
 * shop runtime and `remainingDreamsignPool` / `draftState` on the quest.
 */
export interface ShopRerollResult {
  slots: RuntimeShopSlot[];
  remainingDreamsignPoolIds: string[];
  remainingDreamsignPool: string[];
  draftState: DraftState | null;
}

let contentProvider: SiteContentProvider | null = null;

/**
 * Register (or clear, with `null`) the deterministic content provider the
 * content-coupled `OPEN_SITE` generation delegates to. Idempotent; the last
 * registration wins.
 */
export function registerSiteContentProvider(
  provider: SiteContentProvider | null,
): void {
  contentProvider = provider;
}

/** The currently registered provider, or `null` when none is wired. */
export function getSiteContentProvider(): SiteContentProvider | null {
  return contentProvider;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const TRANSFIGURATION_TYPES: ReadonlySet<TransfigurationType> =
  new Set<TransfigurationType>([
    "Empowered",
    "Amplified",
    "Kindled",
    "Inspired",
    "Enduring",
    "Hastened",
    "Resonant",
    "Attuned",
    "Perfected",
  ]);

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampEssence(value: number, cap: number): number {
  return Math.max(0, Math.min(value, cap));
}

/** Locate a site by id anywhere in the atlas (relocated legacy `findSite`). */
export function findSite(quest: QuestState, siteId: string): SiteState | null {
  for (const node of Object.values(quest.atlas.nodes)) {
    const site = node.sites.find((candidate) => candidate.id === siteId);
    if (site !== undefined) return site;
  }
  return null;
}

/**
 * Whether `siteId` is a legal visit target (relocated legacy
 * `canVisitSite`): the site must exist and, when the player stands in a
 * dreamscape, belong to it; it must be unvisited; a Battle site must be visited
 * last (every non-Battle sibling already visited).
 */
function canVisitSite(quest: QuestState, siteId: string): boolean {
  for (const node of Object.values(quest.atlas.nodes)) {
    const site = node.sites.find((candidate) => candidate.id === siteId);
    if (site === undefined) continue;
    if (site.isVisited || quest.visitedSites.includes(siteId)) return false;
    if (quest.currentDreamscape !== null && node.id !== quest.currentDreamscape) {
      return false;
    }
    if (site.type === "Battle") {
      return node.sites.every(
        (candidate) =>
          candidate.type === "Battle" ||
          candidate.isVisited ||
          quest.visitedSites.includes(candidate.id),
      );
    }
    return true;
  }
  return false;
}

/** Mark `siteId` visited in `visitedSites` and the atlas (legacy `completeQuestSite`). */
function completeQuestSite(quest: QuestState, siteId: string): QuestState {
  if (!canVisitSite(quest, siteId)) return quest;
  const updatedNodes = { ...quest.atlas.nodes };
  for (const [nodeId, node] of Object.entries(updatedNodes)) {
    const siteIndex = node.sites.findIndex((site) => site.id === siteId);
    if (siteIndex === -1) continue;
    updatedNodes[nodeId] = {
      ...node,
      sites: node.sites.map((site, index) =>
        index === siteIndex ? { ...site, isVisited: true } : site,
      ),
    };
    break;
  }
  return {
    ...quest,
    visitedSites: [...quest.visitedSites, siteId],
    atlas: { ...quest.atlas, nodes: updatedNodes },
  };
}

/** Complete the site and return to the dreamscape (legacy `completeSiteAndReturnToDreamscape`). */
function completeAndReturn(quest: QuestState, siteId: string): QuestState {
  return {
    ...completeQuestSite(quest, siteId),
    screen: { type: "dreamscape" },
    activeSiteId: null,
  };
}

/** Store `runtime` for `siteId`, replacing any existing entry for that key. */
function withRuntime(
  quest: QuestState,
  siteId: string,
  runtime: SiteRuntimeState,
): QuestState {
  return {
    ...quest,
    siteRuntime: { ...quest.siteRuntime, [siteId]: runtime },
  };
}

function randomIntInRange(
  rng: (drawIndex: number) => number,
  drawIndex: number,
  min: number,
  max: number,
): number {
  return Math.floor(rng(drawIndex) * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// OPEN_SITE
// ---------------------------------------------------------------------------

/**
 * `OPEN_SITE { siteId }` — collapses the five legacy `ensure*SiteRuntime`
 * writers into one type-dispatched, idempotent generator. Dispatches on the
 * site's TYPE:
 *   - Essence / DreamAugury: generated purely in-reducer (Essence draws its
 *     amount from `ctx.rng`; DreamAugury seeds a fresh, un-completed runtime).
 *   - Reward / DreamsignRevelation / Shop / DreamsignMarket / Transfiguration /
 *     Duplication: delegated to the registered {@link SiteContentProvider}.
 *
 * Idempotent: if a runtime already exists for the site, the existing runtime is
 * NOT regenerated or overwritten — the same state is returned (a no-change
 * APPLIED outcome, so two players opening the same site converge without a
 * bounce toast). Bounces (null) on a malformed payload, an unknown site, a site
 * type that has no runtime, or a content-coupled type with no provider wired.
 */
export function openSite(
  quest: QuestState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): QuestState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;

  // Idempotence: an existing runtime is authoritative and must not be
  // regenerated. Return the SAME state so the fold applies a no-change event.
  if (quest.siteRuntime[siteId] !== undefined) return quest;

  const site = findSite(quest, siteId);
  if (site === null) return null;

  switch (site.type) {
    case "Essence": {
      const amount = site.isEnhanced
        ? randomIntInRange(ctx.rng, 0, 400, 600)
        : randomIntInRange(ctx.rng, 0, 200, 300);
      return withRuntime(quest, siteId, {
        kind: "essence",
        amount,
        accepted: false,
      });
    }
    case "DreamAugury": {
      // The augury encounter is generated at render time from the runtime's
      // nonce / forced archetype (see `buildMerchantContext`), so OPEN_SITE only
      // seeds a fresh, un-completed runtime.
      return withRuntime(quest, siteId, {
        kind: "dreamAugury",
        completed: false,
      });
    }
    case "Reward":
    case "DreamsignRevelation":
    case "Shop":
    case "DreamsignMarket":
    case "Transfiguration":
    case "Duplication": {
      const provider = contentProvider;
      if (provider === null) return null;
      const result = provider.openSite({ quest, site, rng: ctx.rng });
      if (result === null) return null;
      const next = withRuntime(quest, siteId, result.runtime);
      if (result.remainingDreamsignPool === undefined) return next;
      return { ...next, remainingDreamsignPool: [...result.remainingDreamsignPool] };
    }
    default:
      // Battle / Draft / Purge / TemptingOffer / Gamble / TemporalFork carry no
      // site runtime — nothing to generate.
      return null;
  }
}

// ---------------------------------------------------------------------------
// Reward / essence / dreamsign offer accept & reject
// ---------------------------------------------------------------------------

/**
 * `ACCEPT_REWARD { siteId, purgeIndex? }` — legacy `acceptRewardSite`. Grants
 * the stored reward (a Dreamsign appended, or replacing the `purgeIndex` slot;
 * or an essence gain), marks the runtime accepted, and completes the site.
 * Bounces on a missing runtime, a wrong kind, an already-accepted site, a
 * Dreamsign reward at the `maxDreamsigns` limit with no purge slot, or a
 * `purgeIndex` pointing at no held Dreamsign.
 */
export function acceptReward(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  if (quest.visitedSites.includes(siteId)) return null;
  const runtime = quest.siteRuntime[siteId];
  if (runtime === undefined || runtime.kind !== "reward" || runtime.accepted) {
    return null;
  }
  const purgeIndex = payload.purgeIndex === undefined ? undefined : integer(payload.purgeIndex);
  if (payload.purgeIndex !== undefined && purgeIndex === null) return null;

  const reward = runtime.reward;
  let next = quest;
  if (reward.rewardType === "dreamsign") {
    const purgedDreamsign =
      purgeIndex === undefined || purgeIndex === null
        ? null
        : quest.dreamsigns[purgeIndex];
    if (
      (purgeIndex !== undefined &&
        purgeIndex !== null &&
        purgedDreamsign == null) ||
      (purgeIndex === undefined &&
        quest.dreamsigns.length >= quest.maxDreamsigns)
    ) {
      return null;
    }
    next = {
      ...quest,
      dreamsigns:
        purgeIndex === undefined || purgeIndex === null
          ? [...quest.dreamsigns, reward.dreamsign]
          : quest.dreamsigns.map((existing, index) =>
              index === purgeIndex ? reward.dreamsign : existing,
            ),
    };
  } else {
    next = {
      ...quest,
      essence: clampEssence(quest.essence + reward.essenceAmount, quest.essenceCap),
    };
  }

  return completeAndReturn(
    withRuntime(next, siteId, { ...runtime, accepted: true }),
    siteId,
  );
}

/**
 * `ACCEPT_ESSENCE { siteId }` — legacy `acceptEssenceSite`. Adds the runtime
 * amount (clamped to the essence cap), marks accepted, and completes the site.
 * Bounces on a missing runtime, a wrong kind, or an already-accepted site.
 */
export function acceptEssence(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  if (quest.visitedSites.includes(siteId)) return null;
  const runtime = quest.siteRuntime[siteId];
  if (runtime === undefined || runtime.kind !== "essence" || runtime.accepted) {
    return null;
  }
  const next = withRuntime(
    {
      ...quest,
      essence: clampEssence(quest.essence + runtime.amount, quest.essenceCap),
    },
    siteId,
    { ...runtime, accepted: true },
  );
  return completeAndReturn(next, siteId);
}

/**
 * `ACCEPT_DREAMSIGN_OFFER { siteId, dreamsignId, purgeIndex? }` — legacy
 * `acceptDreamsignOffer`, keyed by UUID: the accepted Dreamsign is resolved from
 * the runtime's offered list by id (never by name). Appends it (or replaces the
 * `purgeIndex` slot), marks accepted, and completes the site. Bounces on a
 * missing runtime, a wrong kind, an already-accepted site, an unoffered id, the
 * `maxDreamsigns` limit with no purge slot, or a `purgeIndex` pointing at no
 * held Dreamsign.
 */
export function acceptDreamsignOffer(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const siteId = asString(payload.siteId);
  const dreamsignId = asString(payload.dreamsignId);
  if (siteId === null || dreamsignId === null) return null;
  if (quest.visitedSites.includes(siteId)) return null;
  const runtime = quest.siteRuntime[siteId];
  if (
    runtime === undefined ||
    runtime.kind !== "dreamsignOffer" ||
    runtime.accepted
  ) {
    return null;
  }
  const dreamsign = runtime.offeredDreamsigns.find(
    (offered) => offered.id === dreamsignId,
  );
  if (dreamsign === undefined) return null;

  const purgeIndex = payload.purgeIndex === undefined ? undefined : integer(payload.purgeIndex);
  if (payload.purgeIndex !== undefined && purgeIndex === null) return null;
  const purgedDreamsign =
    purgeIndex === undefined || purgeIndex === null
      ? null
      : quest.dreamsigns[purgeIndex];
  if (
    (purgeIndex !== undefined && purgeIndex !== null && purgedDreamsign == null) ||
    (purgeIndex === undefined && quest.dreamsigns.length >= quest.maxDreamsigns)
  ) {
    return null;
  }
  const dreamsigns =
    purgeIndex === undefined || purgeIndex === null
      ? [...quest.dreamsigns, dreamsign]
      : quest.dreamsigns.map((existing, index) =>
          index === purgeIndex ? dreamsign : existing,
        );

  return completeAndReturn(
    withRuntime({ ...quest, dreamsigns }, siteId, {
      ...runtime,
      accepted: true,
    }),
    siteId,
  );
}

/**
 * `REJECT_DREAMSIGN_OFFER { siteId }` — legacy `rejectDreamsignOffer`. Marks the
 * offer accepted (declined) and completes the site without granting anything.
 * Bounces on a missing runtime, a wrong kind, or an already-accepted site.
 */
export function rejectDreamsignOffer(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  if (quest.visitedSites.includes(siteId)) return null;
  const runtime = quest.siteRuntime[siteId];
  if (
    runtime === undefined ||
    runtime.kind !== "dreamsignOffer" ||
    runtime.accepted
  ) {
    return null;
  }
  return completeAndReturn(
    withRuntime(quest, siteId, { ...runtime, accepted: true }),
    siteId,
  );
}

// ---------------------------------------------------------------------------
// Card choice: transfiguration / duplication (Task-12 deferrals)
// ---------------------------------------------------------------------------

/**
 * `ACCEPT_TRANSFIGURATION_CHOICE { siteId, entryId, type? }` — legacy
 * `acceptTransfigurationChoice`. Stamps the chosen transfiguration onto the deck
 * entry, charges the offer's quoted essence cost (authoritative from the stored
 * runtime, never the client), records the accepted entry, and completes the
 * site. When more than one form is offered for an entry, an optional `type`
 * selects which; otherwise the first offered form for the entry is used.
 * Bounces on a missing runtime, a wrong kind/choiceKind, an already-accepted
 * site, an entry not offered, an entry already transfigured, no matching offer,
 * or insufficient essence.
 */
export function acceptTransfigurationChoice(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const siteId = asString(payload.siteId);
  const entryId = asString(payload.entryId);
  if (siteId === null || entryId === null) return null;
  if (quest.visitedSites.includes(siteId)) return null;
  const runtime = quest.siteRuntime[siteId];
  if (
    runtime === undefined ||
    runtime.kind !== "cardChoice" ||
    runtime.choiceKind !== "transfiguration" ||
    runtime.acceptedEntryIds.length > 0 ||
    !runtime.entryIds.includes(entryId)
  ) {
    return null;
  }
  const entry = quest.deck.find((candidate) => candidate.entryId === entryId);
  if (entry === undefined || entry.transfiguration !== null) return null;

  let wantType: TransfigurationType | null = null;
  if (payload.type !== undefined) {
    if (!TRANSFIGURATION_TYPES.has(payload.type as TransfigurationType)) {
      return null;
    }
    wantType = payload.type as TransfigurationType;
  }
  const offered = runtime.transfigurationOffers.find(
    (offer) =>
      offer.entryId === entryId && (wantType === null || offer.type === wantType),
  );
  if (offered === undefined) return null;

  const cost = offered.essenceCost;
  if (quest.essence < cost) return null;
  const essenceAfter = clampEssence(quest.essence - cost, quest.essenceCap);

  const next: QuestState = {
    ...quest,
    essence: essenceAfter,
    deck: quest.deck.map((candidate) =>
      candidate.entryId === entryId
        ? { ...candidate, transfiguration: offered.type }
        : candidate,
    ),
  };
  return completeAndReturn(
    withRuntime(next, siteId, { ...runtime, acceptedEntryIds: [entryId] }),
    siteId,
  );
}

/**
 * `ACCEPT_DUPLICATION_CHOICE { siteId, entryId }` — legacy
 * `acceptDuplicationChoice`. Appends one plain copy of the chosen deck entry's
 * card (a fresh seq-deterministic entry id), records the accepted entry, and
 * completes the site. Bounces on a missing runtime, a wrong kind/choiceKind, an
 * already-accepted site, an entry not offered, or a stale entry id.
 */
export function acceptDuplicationChoice(
  quest: QuestState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): QuestState | null {
  const siteId = asString(payload.siteId);
  const entryId = asString(payload.entryId);
  if (siteId === null || entryId === null) return null;
  if (quest.visitedSites.includes(siteId)) return null;
  const runtime = quest.siteRuntime[siteId];
  if (
    runtime === undefined ||
    runtime.kind !== "cardChoice" ||
    runtime.choiceKind !== "duplication" ||
    runtime.acceptedEntryIds.length > 0 ||
    !runtime.entryIds.includes(entryId)
  ) {
    return null;
  }
  const entry = quest.deck.find((candidate) => candidate.entryId === entryId);
  if (entry === undefined) return null;

  const copy: DeckEntry = {
    entryId: mintEntryId(quest.deck, ctx.seq, 0),
    cardNumber: entry.cardNumber,
    transfiguration: null,
    isBane: false,
  };
  const next: QuestState = { ...quest, deck: [...quest.deck, copy] };
  return completeAndReturn(
    withRuntime(next, siteId, { ...runtime, acceptedEntryIds: [entryId] }),
    siteId,
  );
}

// ---------------------------------------------------------------------------
// Dream Augury: complete / reroll / force
// ---------------------------------------------------------------------------

/**
 * `COMPLETE_DREAM_AUGURY { siteId }` — legacy `completeDreamAugurySite`. Marks
 * the augury runtime completed (seeding one if the site was never opened) and
 * completes the site. Bounces on a wrong (non-augury) runtime or an
 * already-completed augury.
 */
export function completeDreamAugury(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  if (quest.visitedSites.includes(siteId)) return null;
  const existing = quest.siteRuntime[siteId];
  if (
    existing !== undefined &&
    (existing.kind !== "dreamAugury" || existing.completed)
  ) {
    return null;
  }
  const runtime: DreamAugurySiteRuntime =
    existing?.kind === "dreamAugury"
      ? existing
      : { kind: "dreamAugury", completed: false };
  return completeAndReturn(
    withRuntime(quest, siteId, { ...runtime, completed: true }),
    siteId,
  );
}

/**
 * `REROLL_DREAM_AUGURY { siteId }` — legacy `rerollDreamAugury` (debug). Rebuilds
 * the augury runtime from scratch with a bumped `rerollNonce` (a clean-slate
 * encounter), preserving any debug-forced archetype. Bounces on a wrong
 * (non-augury) runtime or an already-completed augury.
 */
export function rerollDreamAugury(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  const existing = quest.siteRuntime[siteId];
  if (existing !== undefined && existing.kind !== "dreamAugury") return null;
  if (existing?.kind === "dreamAugury" && existing.completed) return null;
  const previousNonce =
    existing?.kind === "dreamAugury" ? existing.rerollNonce ?? 0 : 0;
  const forcedArchetypeId =
    existing?.kind === "dreamAugury" ? existing.forcedArchetypeId : undefined;
  const runtime: DreamAugurySiteRuntime = {
    kind: "dreamAugury",
    completed: false,
    rerollNonce: previousNonce + 1,
    ...(forcedArchetypeId === undefined ? {} : { forcedArchetypeId }),
  };
  return withRuntime(quest, siteId, runtime);
}

/**
 * `FORCE_DREAM_AUGURY_ARCHETYPE { siteId, archetypeId }` — legacy
 * `forceDreamAuguryArchetype` (debug). Rebuilds the augury runtime with a bumped
 * nonce and the forced archetype (a `null` archetype clears it). Bounces on a
 * wrong (non-augury) runtime, an already-completed augury, or a malformed
 * archetype value.
 */
export function forceDreamAuguryArchetype(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  // `archetypeId` may be a non-empty string (force) or null (clear).
  const archetypeId =
    payload.archetypeId === null ? null : asString(payload.archetypeId);
  if (payload.archetypeId !== null && archetypeId === null) return null;
  const existing = quest.siteRuntime[siteId];
  if (existing !== undefined && existing.kind !== "dreamAugury") return null;
  if (existing?.kind === "dreamAugury" && existing.completed) return null;
  const previousNonce =
    existing?.kind === "dreamAugury" ? existing.rerollNonce ?? 0 : 0;
  const runtime: DreamAugurySiteRuntime = {
    kind: "dreamAugury",
    completed: false,
    rerollNonce: previousNonce + 1,
    ...(archetypeId === null ? {} : { forcedArchetypeId: archetypeId }),
  };
  return withRuntime(quest, siteId, runtime);
}

// ---------------------------------------------------------------------------
// Generic site completion
// ---------------------------------------------------------------------------

/**
 * `COMPLETE_SITE { siteId }` — legacy `completeSite`. Marks the site visited and
 * returns to the dreamscape. Bounces (via the visited guard) when the site is
 * already visited so a double completion cannot re-fire.
 */
export function completeSite(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  if (quest.visitedSites.includes(siteId)) return null;
  return completeAndReturn(quest, siteId);
}

// ---------------------------------------------------------------------------
// PURGE_DECK_CARDS (deck removal + site coupling)
// ---------------------------------------------------------------------------

/**
 * `PURGE_DECK_CARDS { entryIds, siteId?, cost?, baneDreamsignIndices? }` —
 * legacy `purgeDeckCards`. Removes every listed deck entry. When `siteId` is
 * present the event is a Purge-site visit: it additionally charges `cost`
 * essence (clamped), removes the bane Dreamsigns at `baneDreamsignIndices` for
 * free (only indices pointing at an actual bane Dreamsign are honored), and
 * completes the site — the whole visit committing atomically. `cost` is
 * production pricing carried on the event, not computed here.
 *
 * Bounces on a malformed `entryIds` list, when no listed entry is present, or
 * (site path) when the site is already visited (the double-charge guard).
 */
export function purgeDeckCards(
  quest: QuestState,
  payload: Record<string, unknown>,
): QuestState | null {
  const raw = payload.entryIds;
  if (!Array.isArray(raw) || !raw.every((id) => typeof id === "string")) {
    return null;
  }
  const targets = new Set<string>(raw);
  const removed = quest.deck.filter((entry) => targets.has(entry.entryId));
  if (removed.length === 0) return null;
  const deck = quest.deck.filter((entry) => !targets.has(entry.entryId));

  const siteId = asString(payload.siteId);
  if (siteId === null) {
    // Deck-only purge (no site coupling).
    return { ...quest, deck };
  }

  // Site purge: double-charge guard, essence charge, free bane-dreamsign
  // removal, and site completion.
  if (quest.visitedSites.includes(siteId)) return null;

  const rawCost = finiteNumber(payload.cost) ?? 0;
  const cost = Math.max(0, rawCost);
  if (quest.essence < cost) return null;
  const baneIndicesRaw = Array.isArray(payload.baneDreamsignIndices)
    ? payload.baneDreamsignIndices
    : [];
  const baneIndexSet = new Set<number>(
    baneIndicesRaw.filter(
      (index): index is number =>
        typeof index === "number" && quest.dreamsigns[index]?.isBane === true,
    ),
  );
  const dreamsigns: Dreamsign[] = quest.dreamsigns.filter(
    (_, index) => !baneIndexSet.has(index),
  );
  const essence = clampEssence(quest.essence - cost, quest.essenceCap);

  return completeAndReturn({ ...quest, deck, dreamsigns, essence }, siteId);
}
