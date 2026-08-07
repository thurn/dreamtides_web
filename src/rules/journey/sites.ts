// Pure site-runtime reducer cases.
//
// This module owns the journey's per-site runtime: it generates each site's
// offer when the player opens it (`OPEN_SITE`), and resolves the player's
// choice at the site (`ACCEPT_*` / `REJECT_*` / `COMPLETE_*`). Each exported
// case relocates the DOMAIN MATH of a legacy journey mutation
// (`src/state/multiplayer-journey-context.tsx`) into a pure function of
// `(journey, payload[, ctx])`. The legacy transaction / normalization / actionLog
// wrappers are engine concerns and live elsewhere now (the root reducer folds,
// the eventlog engine persists), so they are dropped here.
//
// The src/rules/ lint rails forbid Firebase, React, and any live clock/rng:
// randomness arrives via `ctx.rng` and any minted id via `ctx.seq`. Sites are
// keyed by id and cards by UUID/entry-id only — never by name.
//
// OPEN_SITE generation splits by what the site's offer needs:
//   - Essence and Augury need no async content, so they are generated
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
import type { EconomyData } from "../../types/economy-data";
import type { SitesData } from "../../types/sites-data";
import type { DraftState } from "../../types/draft";
import type { GambleGameId } from "../../types/gamble";
import type {
  DeckEntry,
  AugurySiteRuntime,
  JourneyState,
  RuntimeShopSlot,
  SiteRuntimeState,
  SiteState,
  TransfigurationType,
  TransfiguredSiteOfferModifier,
} from "../../types/journey";
import { mintEntryId } from "./deck";
import { purgeVisitCost } from "../../purge/purge-pricing";
import {
  isRandomSiteDestinationType,
  materializeRandomSite,
} from "../../random-site/random-site";
import { SELECTION_RULES_VERSION } from "../../reward-selection";

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
  /** Updated one-use modifier queue when this site consumed an entry. */
  siteOfferModifiers?: readonly TransfiguredSiteOfferModifier[];
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
 * Augury are generated purely in-reducer and never need it.
 */
export interface SiteContentProvider {
  /** Immutable validated site rules captured with the provider registration. */
  sitesData: SitesData;
  /** Immutable validated economy data captured with the provider registration. */
  economyData?: EconomyData;
  /**
   * Generate the runtime for `site` (of a content-coupled type) deterministically
   * from `(journey, site, rng)`, or `null` to bounce. Must not mutate `journey`.
   */
  openSite(input: {
    journey: JourneyState;
    site: SiteState;
    rng: (drawIndex: number) => number;
    selectionRulesVersion?: string;
    /** Optional URL-selected Gamble game written into the OPEN_SITE intent. */
    gambleGameId?: GambleGameId;
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
    journey: JourneyState;
    site: SiteState;
    rng: (drawIndex: number) => number;
  }): ShopRerollResult | null;

  /**
   * Resolve a Dream Merchant `ACCEPT_MERCHANT_OFFER` / `DECLINE_MERCHANT` at
   * `site`. The whole resolution (offer lookup, essence / deck / dreamsign
   * payload application, site completion) is content-coupled — it reads the
   * merchant encounter generated from async-loaded journey content — so it lives
   * entirely behind this seam. Returns the fully-updated `JourneyState` (site
   * already completed) or `null` to bounce (stale encounter, unknown offer,
   * unaffordable, already-visited). Must not mutate `journey`.
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
    journey: JourneyState;
    site: SiteState;
    action: "accept" | "decline";
    payload: Record<string, unknown>;
    rng: (drawIndex: number) => number;
    /** This event's seq — the same value `mintEntryId` keys new ids off of. */
    seq: number;
  }): JourneyState | null;

  /** Resolve one Exploration action against its persisted deterministic offer. */
  resolveExploration?(input: {
    journey: JourneyState;
    site: SiteState;
    payload: Record<string, unknown>;
    seq: number;
  }): JourneyState | null;
}

/**
 * The regenerated content a `REROLL_SHOP` restock produces: a full replacement
 * set of unpurchased slots plus the Dreamsign pools and draft state the redraw
 * consumed. The reducer stores `slots` / `remainingDreamsignPoolIds` on the
 * shop runtime and `remainingDreamsignPool` / `draftState` on the journey.
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

function clampEssence(value: number): number {
  return Math.max(0, value);
}

/** Locate a site by id anywhere in the atlas (relocated legacy `findSite`). */
export function findSite(
  journey: JourneyState,
  siteId: string,
): SiteState | null {
  for (const node of Object.values(journey.atlas.nodes)) {
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
export function canVisitSite(journey: JourneyState, siteId: string): boolean {
  for (const node of Object.values(journey.atlas.nodes)) {
    const site = node.sites.find((candidate) => candidate.id === siteId);
    if (site === undefined) continue;
    if (site.isVisited || journey.visitedSites.includes(siteId)) return false;
    if (
      journey.currentDreamscape !== null &&
      node.id !== journey.currentDreamscape
    ) {
      return false;
    }
    if (site.type === "Battle") {
      return node.sites.every(
        (candidate) =>
          candidate.type === "Battle" ||
          candidate.isVisited ||
          journey.visitedSites.includes(candidate.id),
      );
    }
    return true;
  }
  return false;
}

/** Mark `siteId` visited in `visitedSites` and the atlas (legacy `completeJourneySite`). */
export function completeJourneySite(
  journey: JourneyState,
  siteId: string,
): JourneyState {
  if (!canVisitSite(journey, siteId)) return journey;
  const updatedNodes = { ...journey.atlas.nodes };
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
    ...journey,
    visitedSites: [...journey.visitedSites, siteId],
    atlas: { ...journey.atlas, nodes: updatedNodes },
  };
}

/** Complete the site and return to the dreamscape (legacy `completeSiteAndReturnToDreamscape`). */
function completeAndReturn(
  journey: JourneyState,
  siteId: string,
): JourneyState {
  return {
    ...completeJourneySite(journey, siteId),
    screen: { type: "dreamscape" },
    activeSiteId: null,
  };
}

/** Store `runtime` for `siteId`, replacing any existing entry for that key. */
function withRuntime(
  journey: JourneyState,
  siteId: string,
  runtime: SiteRuntimeState,
): JourneyState {
  return {
    ...journey,
    siteRuntime: { ...journey.siteRuntime, [siteId]: runtime },
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
 * writers into one type-dispatched generator. Dispatches on the
 * site's TYPE:
 *   - Essence / Augury: generated purely in-reducer (Essence draws its
 *     amount from `ctx.rng`; Augury seeds a fresh, un-completed runtime).
 *   - Reward / DreamsignRevelation / Shop / DreamsignMarket / Transfiguration /
 *     Duplication / Gamble: delegated to the registered {@link SiteContentProvider}.
 *
 * An existing runtime is authoritative, so a repeated event bounces without
 * regenerating it. The event-log intent key prevents repeated screen mounts and
 * connected clients from appending that repeated event. Bounces also cover a
 * malformed payload, an unknown site, a site type that has no runtime, or a
 * content-coupled type with no provider wired.
 */
export function openSite(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;

  if (journey.siteRuntime[siteId] !== undefined) return null;

  const site = findSite(journey, siteId);
  if (site === null) return null;
  const rawGambleGameId = payload.gambleGameId;
  const rawSelectionRulesVersion = asString(payload.selectionRulesVersion);
  if (
    rawGambleGameId !== undefined &&
    rawGambleGameId !== "gravok-three-gate-wager" &&
    rawGambleGameId !== "tidemark-ladder-climb" &&
    rawGambleGameId !== "starway-stairs" &&
    rawGambleGameId !== "four-suit-reprise"
  ) {
    return null;
  }

  switch (site.type) {
    case "RandomSite": {
      const choiceCount = contentProvider?.sitesData.randomSite.homeChoiceCount;
      if (
        choiceCount === undefined ||
        site.randomSite?.mode !== "homeChoice" ||
        site.randomSite.candidateSiteTypes.length < choiceCount
      ) {
        return null;
      }
      const remaining = [...site.randomSite.candidateSiteTypes];
      const offeredSiteTypes: typeof remaining = [];
      for (let index = 0; index < choiceCount; index += 1) {
        const choiceIndex = Math.floor(ctx.rng(index) * remaining.length);
        offeredSiteTypes.push(remaining.splice(choiceIndex, 1)[0]);
      }
      return withRuntime(journey, siteId, {
        kind: "randomSite",
        offeredSiteTypes,
        selectedSiteType: null,
      });
    }
    case "Essence": {
      const economy = contentProvider?.economyData?.siteRewards.essence;
      if (economy === undefined) return null;
      const rewardRange = site.isEnhanced ? economy.enhanced : economy.standard;
      const amount = randomIntInRange(
        ctx.rng,
        0,
        rewardRange.min,
        rewardRange.max,
      );
      return withRuntime(journey, siteId, {
        kind: "essence",
        amount,
        accepted: false,
      });
    }
    case "Augury": {
      if (
        rawSelectionRulesVersion === SELECTION_RULES_VERSION &&
        contentProvider !== null
      ) {
        const result = contentProvider.openSite({
          journey,
          site,
          rng: ctx.rng,
          selectionRulesVersion: rawSelectionRulesVersion,
        });
        if (result === null) return null;
        return withRuntime(journey, siteId, result.runtime);
      }
      return withRuntime(journey, siteId, {
        kind: "augury",
        completed: false,
      });
    }
    case "Reward":
    case "DreamsignRevelation":
    case "Shop":
    case "DreamsignMarket":
    case "Transfiguration":
    case "Duplication":
    case "Gamble":
    case "Exploration": {
      const provider = contentProvider;
      if (provider === null) return null;
      const result = provider.openSite({
        journey,
        site,
        rng: ctx.rng,
        ...(rawSelectionRulesVersion === null
          ? {}
          : { selectionRulesVersion: rawSelectionRulesVersion }),
        ...(rawGambleGameId === undefined
          ? {}
          : { gambleGameId: rawGambleGameId }),
      });
      if (result === null) return null;
      const next = withRuntime(journey, siteId, result.runtime);
      return {
        ...next,
        ...(result.remainingDreamsignPool === undefined
          ? {}
          : { remainingDreamsignPool: [...result.remainingDreamsignPool] }),
        ...(result.siteOfferModifiers === undefined
          ? {}
          : { siteOfferModifiers: [...result.siteOfferModifiers] }),
      };
    }
    default:
      // Battle / Draft / Purge carry no
      // site runtime — nothing to generate.
      return null;
  }
}

/** Select and materialize one of Random Site's persisted home destinations. */
export function chooseRandomSite(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  const siteType = payload.siteType;
  if (siteId === null || !isRandomSiteDestinationType(siteType)) return null;
  if (journey.screen.type !== "site" || journey.screen.siteId !== siteId) {
    return null;
  }
  const site = findSite(journey, siteId);
  const runtime = journey.siteRuntime[siteId];
  if (
    site?.type !== "RandomSite" ||
    site.randomSite?.mode !== "homeChoice" ||
    runtime?.kind !== "randomSite" ||
    runtime.selectedSiteType !== null ||
    !runtime.offeredSiteTypes.includes(siteType)
  ) {
    return null;
  }
  const nodes = { ...journey.atlas.nodes };
  const owner = Object.values(nodes).find((node) =>
    node.sites.some((candidate) => candidate.id === siteId),
  );
  if (owner === undefined) return null;
  nodes[owner.id] = {
    ...owner,
    sites: owner.sites.map((candidate) =>
      candidate.id === siteId
        ? materializeRandomSite(
            candidate,
            siteType,
            contentProvider?.sitesData.randomSite.guideId,
          )
        : candidate,
    ),
  };
  const siteRuntime = { ...journey.siteRuntime };
  delete siteRuntime[siteId];
  return {
    ...journey,
    atlas: { ...journey.atlas, nodes },
    siteRuntime,
  };
}

/** Resolve one authored Exploration action while leaving its response on screen. */
export function resolveExplorationChoice(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  const site = findSite(journey, siteId);
  if (site?.type !== "Exploration") return null;
  const provider = contentProvider;
  if (provider?.resolveExploration === undefined) return null;
  return provider.resolveExploration({ journey, site, payload, seq: ctx.seq });
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
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  if (journey.visitedSites.includes(siteId)) return null;
  const runtime = journey.siteRuntime[siteId];
  if (runtime === undefined || runtime.kind !== "reward" || runtime.accepted) {
    return null;
  }
  const purgeIndex =
    payload.purgeIndex === undefined ? undefined : integer(payload.purgeIndex);
  if (payload.purgeIndex !== undefined && purgeIndex === null) return null;

  const reward = runtime.reward;
  let next = journey;
  if (reward.rewardType === "dreamsign") {
    const purgedDreamsign =
      purgeIndex === undefined || purgeIndex === null
        ? null
        : journey.dreamsigns[purgeIndex];
    if (
      (purgeIndex !== undefined &&
        purgeIndex !== null &&
        purgedDreamsign == null) ||
      (purgeIndex === undefined &&
        journey.dreamsigns.length >= journey.maxDreamsigns)
    ) {
      return null;
    }
    next = {
      ...journey,
      dreamsigns:
        purgeIndex === undefined || purgeIndex === null
          ? [...journey.dreamsigns, reward.dreamsign]
          : journey.dreamsigns.map((existing, index) =>
              index === purgeIndex ? reward.dreamsign : existing,
            ),
    };
  } else {
    next = {
      ...journey,
      essence: clampEssence(journey.essence + reward.essenceAmount),
    };
  }

  return completeAndReturn(
    withRuntime(next, siteId, { ...runtime, accepted: true }),
    siteId,
  );
}

/**
 * `ACCEPT_ESSENCE { siteId }` — legacy `acceptEssenceSite`. Generates the
 * site's deterministic reward when it has not been opened, adds the amount,
 * marks accepted, and completes the site.
 * Bounces on a wrong site/runtime kind or an already-accepted site.
 */
export function acceptEssence(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  if (journey.visitedSites.includes(siteId)) return null;
  const existing = journey.siteRuntime[siteId];
  if (existing !== undefined && existing.kind !== "essence") {
    return null;
  }
  if (existing?.accepted) return null;
  const site = findSite(journey, siteId);
  if (site?.type !== "Essence") return null;
  const economy = contentProvider?.economyData?.siteRewards.essence;
  if (economy === undefined) return null;
  const rewardRange = site.isEnhanced ? economy.enhanced : economy.standard;
  const runtime =
    existing ??
    ({
      kind: "essence" as const,
      amount: randomIntInRange(ctx.rng, 0, rewardRange.min, rewardRange.max),
      accepted: false,
    } satisfies SiteRuntimeState);
  const next = withRuntime(
    {
      ...journey,
      essence: clampEssence(journey.essence + runtime.amount),
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
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  const dreamsignId = asString(payload.dreamsignId);
  if (siteId === null || dreamsignId === null) return null;
  if (journey.visitedSites.includes(siteId)) return null;
  const runtime = journey.siteRuntime[siteId];
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

  const purgeIndex =
    payload.purgeIndex === undefined ? undefined : integer(payload.purgeIndex);
  if (payload.purgeIndex !== undefined && purgeIndex === null) return null;
  const purgedDreamsign =
    purgeIndex === undefined || purgeIndex === null
      ? null
      : journey.dreamsigns[purgeIndex];
  if (
    (purgeIndex !== undefined &&
      purgeIndex !== null &&
      purgedDreamsign == null) ||
    (purgeIndex === undefined &&
      journey.dreamsigns.length >= journey.maxDreamsigns)
  ) {
    return null;
  }
  const dreamsigns =
    purgeIndex === undefined || purgeIndex === null
      ? [...journey.dreamsigns, dreamsign]
      : journey.dreamsigns.map((existing, index) =>
          index === purgeIndex ? dreamsign : existing,
        );

  return completeAndReturn(
    withRuntime({ ...journey, dreamsigns }, siteId, {
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
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  if (journey.visitedSites.includes(siteId)) return null;
  const runtime = journey.siteRuntime[siteId];
  if (
    runtime === undefined ||
    runtime.kind !== "dreamsignOffer" ||
    runtime.accepted
  ) {
    return null;
  }
  return completeAndReturn(
    withRuntime(journey, siteId, { ...runtime, accepted: true }),
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
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  const entryId = asString(payload.entryId);
  if (siteId === null || entryId === null) return null;
  if (journey.visitedSites.includes(siteId)) return null;
  const runtime = journey.siteRuntime[siteId];
  if (
    runtime === undefined ||
    runtime.kind !== "cardChoice" ||
    runtime.choiceKind !== "transfiguration" ||
    runtime.acceptedEntryIds.length > 0 ||
    !runtime.entryIds.includes(entryId)
  ) {
    return null;
  }
  const entry = journey.deck.find((candidate) => candidate.entryId === entryId);
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
      offer.entryId === entryId &&
      (wantType === null || offer.type === wantType),
  );
  if (offered === undefined) return null;

  const cost = offered.essenceCost;
  if (journey.essence < cost) return null;
  const essenceAfter = clampEssence(journey.essence - cost);

  const next: JourneyState = {
    ...journey,
    essence: essenceAfter,
    deck: journey.deck.map((candidate) =>
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
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  const entryId = asString(payload.entryId);
  if (siteId === null || entryId === null) return null;
  if (journey.visitedSites.includes(siteId)) return null;
  const runtime = journey.siteRuntime[siteId];
  if (
    runtime === undefined ||
    runtime.kind !== "cardChoice" ||
    runtime.choiceKind !== "duplication" ||
    runtime.acceptedEntryIds.length > 0 ||
    !runtime.entryIds.includes(entryId)
  ) {
    return null;
  }
  const entry = journey.deck.find((candidate) => candidate.entryId === entryId);
  if (entry === undefined) return null;

  const copy: DeckEntry = {
    entryId: mintEntryId(journey.deck, ctx.seq, 0),
    cardNumber: entry.cardNumber,
    transfiguration: null,
    isBane: false,
  };
  const next: JourneyState = { ...journey, deck: [...journey.deck, copy] };
  return completeAndReturn(
    withRuntime(next, siteId, { ...runtime, acceptedEntryIds: [entryId] }),
    siteId,
  );
}

// ---------------------------------------------------------------------------
// Augury: complete / reroll / force
// ---------------------------------------------------------------------------

/**
 * `COMPLETE_AUGURY { siteId }` — legacy `completeAugurySite`. Marks
 * the augury runtime completed (seeding one if the site was never opened) and
 * completes the site. Bounces on a wrong (non-augury) runtime or an
 * already-completed augury.
 */
export function completeAugury(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  if (journey.visitedSites.includes(siteId)) return null;
  const existing = journey.siteRuntime[siteId];
  if (
    existing !== undefined &&
    (existing.kind !== "augury" || existing.completed)
  ) {
    return null;
  }
  const runtime: AugurySiteRuntime =
    existing?.kind === "augury"
      ? existing
      : { kind: "augury", completed: false };
  return completeAndReturn(
    withRuntime(journey, siteId, { ...runtime, completed: true }),
    siteId,
  );
}

/**
 * `REROLL_AUGURY { siteId }` — legacy `rerollAugury` (debug). Rebuilds
 * the augury runtime from scratch with a bumped `rerollNonce` (a clean-slate
 * encounter), preserving any debug-forced archetype. Bounces on a wrong
 * (non-augury) runtime or an already-completed augury.
 */
export function rerollAugury(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  const existing = journey.siteRuntime[siteId];
  if (existing !== undefined && existing.kind !== "augury") return null;
  if (existing?.kind === "augury" && existing.completed) return null;
  const previousNonce =
    existing?.kind === "augury" ? (existing.rerollNonce ?? 0) : 0;
  const forcedArchetypeId =
    existing?.kind === "augury" ? existing.forcedArchetypeId : undefined;
  const runtime: AugurySiteRuntime = {
    kind: "augury",
    completed: false,
    rerollNonce: previousNonce + 1,
    ...(forcedArchetypeId === undefined ? {} : { forcedArchetypeId }),
  };
  return withRuntime(journey, siteId, runtime);
}

/**
 * `FORCE_AUGURY_ARCHETYPE { siteId, archetypeId }` — legacy
 * `forceAuguryArchetype` (debug). Rebuilds the augury runtime with a bumped
 * nonce and the forced archetype (a `null` archetype clears it). Bounces on a
 * wrong (non-augury) runtime, an already-completed augury, or a malformed
 * archetype value.
 */
export function forceAuguryArchetype(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  // `archetypeId` may be a non-empty string (force) or null (clear).
  const archetypeId =
    payload.archetypeId === null ? null : asString(payload.archetypeId);
  if (payload.archetypeId !== null && archetypeId === null) return null;
  const existing = journey.siteRuntime[siteId];
  if (existing !== undefined && existing.kind !== "augury") return null;
  if (existing?.kind === "augury" && existing.completed) return null;
  const previousNonce =
    existing?.kind === "augury" ? (existing.rerollNonce ?? 0) : 0;
  const runtime: AugurySiteRuntime = {
    kind: "augury",
    completed: false,
    rerollNonce: previousNonce + 1,
    ...(archetypeId === null ? {} : { forcedArchetypeId: archetypeId }),
  };
  return withRuntime(journey, siteId, runtime);
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
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = asString(payload.siteId);
  if (
    siteId === null ||
    journey.screen.type !== "site" ||
    journey.screen.siteId !== siteId ||
    journey.activeSiteId !== siteId ||
    !canVisitSite(journey, siteId)
  ) {
    return null;
  }
  const runtime = journey.siteRuntime[siteId];
  if (runtime?.kind === "gamble") {
    if (
      runtime.gameId === "gravok-three-gate-wager" &&
      runtime.result?.essenceSettled === false
    ) {
      return null;
    }
    if (
      runtime.gameId === "tidemark-ladder-climb" &&
      (runtime.result?.resultSettled === false ||
        runtime.result?.pendingDreamsignReplacement === true)
    ) {
      return null;
    }
    if (runtime.gameId === "starway-stairs") {
      const latestResult = runtime.results[runtime.results.length - 1];
      if (
        latestResult?.resultSettled === false ||
        (runtime.results.length > 0 && runtime.terminalReason === null)
      ) {
        return null;
      }
    }
    if (runtime.gameId === "four-suit-reprise") {
      const latestRound = runtime.rounds[runtime.rounds.length - 1];
      if (
        runtime.phase === "result" &&
        (latestRound === undefined || !latestRound.resultSettled)
      ) {
        return null;
      }
    }
  }
  if (runtime?.kind === "exploration" && runtime.resolution === null) {
    return null;
  }
  return completeAndReturn(journey, siteId);
}

// ---------------------------------------------------------------------------
// PURGE_DECK_CARDS (deck removal + site coupling)
// ---------------------------------------------------------------------------

/**
 * `PURGE_DECK_CARDS { siteId, entryIds }` — remove the selected deck entries,
 * derive the visit price from authoritative state, charge essence, and complete
 * the Purge site atomically. Nightmare, the sole Bane card, is free; paid cards
 * use the canonical visit price ladder and folded discounts.
 *
 * Bounces on malformed or duplicate ids, an ineligible/non-Purge site, an
 * oversized paid selection, or insufficient essence.
 */
export function purgeDeckCards(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const raw = payload.entryIds;
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    !raw.every((id) => typeof id === "string")
  ) {
    return null;
  }
  const targets = new Set<string>(raw);
  if (targets.size !== raw.length) return null;
  const removed = journey.deck.filter((entry) => targets.has(entry.entryId));
  if (removed.length !== targets.size) return null;
  const deck = journey.deck.filter((entry) => !targets.has(entry.entryId));

  const siteId = asString(payload.siteId);
  if (siteId === null) return null;
  const site = findSite(journey, siteId);
  if (
    site?.type !== "Purge" ||
    !canVisitSite(journey, siteId) ||
    journey.screen.type !== "site" ||
    journey.activeSiteId !== siteId
  ) {
    return null;
  }
  const paidCount = removed.filter((entry) => !entry.isBane).length;
  const purgeConfig = contentProvider?.economyData?.purge;
  if (purgeConfig === undefined || paidCount > purgeConfig.marginalCosts.length)
    return null;
  const cost = purgeVisitCost(purgeConfig, paidCount, {
    isEnhanced: site.isEnhanced,
    essenceDiscountPercent: journey.shopModifiers.essenceDiscountPercent,
  });
  if (journey.essence < cost) return null;
  const essence = clampEssence(journey.essence - cost);

  return completeAndReturn({ ...journey, deck, essence }, siteId);
}
