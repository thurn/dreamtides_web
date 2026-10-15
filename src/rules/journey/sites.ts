import type { JourneyShopSlotReplacement, ShopReplacementItem } from "../../types/journey";
// Pure site-runtime reducer cases.
//
// This module owns the journey's per-site runtime: it generates each site's
// offer when the player opens it (`OPEN_SITE`), and resolves the player's
// choice at the site (`ACCEPT_*` / `REJECT_*` / `COMPLETE_*`). Each exported
// case is a pure function of `(journey, payload[, ctx])`; the root reducer
// folds the event and the eventlog engine persists it.
//
// The src/rules/ lint rails forbid React and any live clock/rng:
// randomness arrives via `ctx.rng` and any minted id via `ctx.seq`. Sites are
// keyed by id and cards by UUID/entry-id only — never by name.
//
// OPEN_SITE generation splits by what the site's offer needs:
//   - Essence and Augury need no async content, so they are generated
//     purely in-reducer, drawing from `ctx.rng`.
//   - Reward / Dreamsign offer / Shop / Card choice generation reads the
//     catalog-sourced card, dreamsign, and affiliation catalogues that only load
//     asynchronously, so it is delegated to the injectable
//     {@link SiteContentProvider}, which is handed a deterministic
//     `(drawIndex) => number` rng derived from `ctx.rng`, so folding the same
//     event always rolls byte-identical offers.

import type { EventContext } from "../../eventlog/types";
import type { EconomyData } from "../../types/economy-data";
import type { GambleData } from "../../types/gamble-data";
import type { SitesData } from "../../types/sites-data";
import type { DraftState } from "../../types/draft";
import type { GambleGameId } from "../../types/gamble";
import {
  parseSelectionRulesVersion,
  type SelectionRulesVersion,
} from "../../reward-selection/types";
import type {
  Dreamsign,
  RewardSiteRuntime,
  EnhancedDreamsignRewardOffer,
  JourneyPurgeTransition,
  ExplorationSiteRuntime,
  AugurySiteRuntime,
  JourneyState,
  RuntimeShopSlot,
  ShopModifiers,
  SiteRuntimeState,
  SiteState,
  TransfigurationType,
  TransfiguredSiteOfferModifier,
} from "../../types/journey";
import { duplicateDeckEntry } from "./deck";
import { duplicationSiteQuote } from "./journey-duplication";
import { projectJourneySite } from "./journey-sites";
import { essenceReplacementSource, essencePurgeSource } from "./journey-essence";
import type { JourneyModifierRegistry } from "./modifier-registry";
import { purgeVisitCost } from "../../purge/purge-pricing";
import {
  isRandomSiteDestinationType,
  materializeRandomSite,
} from "../../random-site/random-site";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import type {
  DeckEntryId,
  DreamsignId,
  SiteId,
} from "../../types/identifiers";
import { identityEntries, siteIdFromUnknown } from "../../types/identifiers";
import { dreamsignIdFromUnknown } from "../../types/identifiers";
import { deckEntryIdFromUnknown } from "../../types/identifiers";
import { auguryArchetypeIdFromUnknown } from "../../types/identifiers";

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
  remainingDreamsignPool?: DreamsignId[];
  /** Updated shop modifier queues when this open consumed an entry. */
  shopModifiers?: ShopModifiers;
  /** Updated one-use modifier queue when this site consumed an entry. */
  siteOfferModifiers?: readonly TransfiguredSiteOfferModifier[];
}

/**
 * The deterministic content `OPEN_SITE` needs for the site types whose offer
 * is generated from async-loaded data (Reward, Dreamsign offer, Shop, Card
 * choice). The reducer resolves the site and enforces idempotence itself, then
 * delegates the offer generation to this provider, handing it a deterministic
 * rng derived from `ctx.rng` so every fold of the same event produces
 * byte-identical offers.
 *
 * `createSiteContentProvider` (src/session/providers/site-provider.ts)
 * supplies every member from the loaded journey content. Until a provider is
 * registered, every provider-backed site event bounces (a recorded no-op,
 * never a throw).
 */
export interface SiteContentProvider {
  prepareAfterBattleDreamsignOffer?(input: { journey: JourneyState; offerCount: number; random: () => number }): { offeredDreamsigns: readonly Dreamsign[]; remainingDreamsignPool: readonly DreamsignId[] } | null;
  /** Immutable validated site rules captured with the provider registration. */
  sitesData: SitesData;
  /** Immutable validated economy data captured with the provider registration. */
  economyData: EconomyData;
  /** Immutable validated Gamble catalog captured with provider registration. */
  gambleData: GambleData;
  /**
   * Generate the runtime for `site` (of a content-coupled type) deterministically
   * from `(journey, site, rng)`, or `null` to bounce. Must not mutate `journey`.
   */
  /** Redraw a usable unresolved Exploration without applying a reward. */
  rerollExploration(input: {
    journey: JourneyState;
    site: SiteState;
    runtime: ExplorationSiteRuntime;
    selectionRulesVersion: SelectionRulesVersion;
  }): ExplorationSiteRuntime | null;
  /** Prepare exactly one free Dreamsign for an Essence replacement, or bounce. */
  openEssenceDreamsignReward(input: {
    journey: JourneyState;
    site: SiteState;
    rng: (drawIndex: number) => number;
    offerCount: 1;
  }): SiteOpenResult | null;
  openSite(input: {
    journey: JourneyState;
    site: SiteState;
    rng: (drawIndex: number) => number;
    /** Selection protocol named by the OPEN_SITE intent. */
    selectionRulesVersion: SelectionRulesVersion;
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
   */
  /** Prepare exactly one purchase vacancy; null result refuses, null slot exhausts. */
  replacePurchasedShopSlot?(input: {
    journey: JourneyState;
    site: SiteState;
    slotIndex: number;
    purchasedSlot: RuntimeShopSlot;
    random: () => number;
  }): ShopSlotReplacementResult | null;

  rerollShop(input: {
    journey: JourneyState;
    site: SiteState;
    rng: (drawIndex: number) => number;
  }): ShopRerollResult | null;

  /**
   * Resolve a Augury `ACCEPT_AUGURY_OFFER` / `DECLINE_AUGURY` at
   * `site`. The whole resolution (offer lookup, essence / deck / dreamsign
   * payload application, site completion) is content-coupled — it reads the
   * augury encounter generated from async-loaded journey content — so it lives
   * entirely behind this seam. Returns the fully-updated `JourneyState` (site
   * already completed) or `null` to bounce (stale encounter, unknown offer,
   * unaffordable, already-visited). Must not mutate `journey`. Any new deck
   * entry is minted through `seq` via `mintEntryId(deck, seq, index)` in
   * ./deck, the same scheme every other minting case uses.
   */
  resolveAugury(input: {
    journey: JourneyState;
    site: SiteState;
    action: "accept" | "decline";
    payload: Record<string, unknown>;
    rng: (drawIndex: number) => number;
    /** This event's seq — the same value `mintEntryId` keys new ids off of. */
    seq: number;
  }): JourneyPurgeTransition | null;

  /** Resolve one Exploration action against its persisted deterministic offer. */
  resolveExploration(input: {
    journey: JourneyState;
    site: SiteState;
    payload: Record<string, unknown>;
    seq: number;
  }): JourneyPurgeTransition | null;
}

/**
 * The regenerated content a `REROLL_SHOP` restock produces: a full replacement
 * set of unpurchased slots plus the Dreamsign pools and draft state the redraw
 * consumed. The reducer stores `slots` / `remainingDreamsignPoolIds` on the
 * shop runtime and `remainingDreamsignPool` / `draftState` on the journey.
 */
export interface ShopRerollResult {
  slots: RuntimeShopSlot[];
  remainingDreamsignPoolIds: DreamsignId[];
  remainingDreamsignPool: DreamsignId[];
  draftState: DraftState | null;
}

/** One consumed stock draw, distinct from a whole-shelf Restock. */
export interface ShopSlotReplacementResult {
  slot: RuntimeShopSlot | null;
  purchasedItem: ShopReplacementItem;
  replacementItem: ShopReplacementItem | null;
  remainingDreamsignPoolIds: DreamsignId[];
  remainingDreamsignPool: DreamsignId[];
  draftState: DraftState | null;
  draftSupplyBefore: JourneyShopSlotReplacement["draftSupplyBefore"];
  draftSupplyAfter: JourneyShopSlotReplacement["draftSupplyAfter"];
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

/** Strict public boundary for the optional persisted enhanced Reward quote. */
export function isEnhancedDreamsignReward(value: unknown): value is RewardSiteRuntime & {
  enhancedDreamsignOffer: EnhancedDreamsignRewardOffer;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const runtime = value as Partial<RewardSiteRuntime>;
  const quote = runtime.enhancedDreamsignOffer;
  if (runtime.kind !== "reward" || typeof runtime.accepted !== "boolean" ||
    runtime.journeyEssenceSource !== undefined || runtime.reward?.rewardType !== "dreamsign" ||
    quote === undefined || quote === null || typeof quote !== "object" ||
    !Number.isSafeInteger(quote.requestedCount) || quote.requestedCount < 1 ||
    typeof quote.selectionRulesVersion !== "string" || quote.selectionRulesVersion.length === 0 ||
    dreamsignIdFromUnknown(quote.standardDreamsignId) === null ||
    quote.standardDreamsignId !== runtime.reward.dreamsign?.id ||
    !Array.isArray(quote.offeredDreamsigns) || quote.offeredDreamsigns.length === 0 ||
    quote.offeredDreamsigns.length > quote.requestedCount ||
    !Array.isArray(runtime.remainingDreamsignPoolIds)) return false;
  const alternatives: readonly unknown[] = quote.offeredDreamsigns;
  for (const value of [runtime.reward.dreamsign, ...alternatives]) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const sign = value as Partial<Dreamsign>;
    if (dreamsignIdFromUnknown(sign.id) === null || typeof sign.name !== "string" ||
      typeof sign.effectDescription !== "string" ||
      (sign.imageName !== undefined && typeof sign.imageName !== "string") ||
      (sign.imageAlt !== undefined && typeof sign.imageAlt !== "string")) return false;
  }
  const offeredIds = new Set<DreamsignId>();
  for (const value of alternatives) {
    const id = dreamsignIdFromUnknown((value as Dreamsign).id);
    if (id === null || offeredIds.has(id)) return false;
    offeredIds.add(id);
  }
  const standard = runtime.reward.dreamsign;
  const offeredStandard = (alternatives as readonly Dreamsign[]).find((sign) => sign.id === quote.standardDreamsignId);
  // UUID selects the content; duplicated stored fields must describe the same prepared reward.
  if (offeredStandard === undefined || offeredStandard.name !== standard.name ||
    offeredStandard.effectDescription !== standard.effectDescription ||
    offeredStandard.imageName !== standard.imageName || offeredStandard.imageAlt !== standard.imageAlt) return false;
  const remaining = new Set<DreamsignId>();
  for (const id of runtime.remainingDreamsignPoolIds) {
    if (dreamsignIdFromUnknown(id) === null || offeredIds.has(id) || remaining.has(id)) return false;
    remaining.add(id);
  }
  return true;
}

/** Enhanced Reward decisions resolve only a pending quote at the current site. */
function pendingEnhancedReward(journey: JourneyState, siteId: SiteId) {
  const runtime = journey.siteRuntime[siteId];
  if (!isEnhancedDreamsignReward(runtime) || runtime.accepted ||
    findSite(journey, siteId)?.type !== "Reward" || !canVisitSite(journey, siteId) ||
    journey.currentDreamscape === null ||
    !journey.atlas.nodes[journey.currentDreamscape]?.sites.some((site) => site.id === siteId) ||
    (journey.screen.type !== "dreamscape" &&
      (journey.screen.type !== "site" || journey.screen.siteId !== siteId))) return null;
  return runtime;
}

/** Clamp an essence amount to zero or greater. */
export function clampEssence(value: number): number {
  return Math.max(0, value);
}

/** Locate a site by id anywhere in the atlas. */
export function findSite(
  journey: Readonly<Pick<JourneyState, "atlas">>,
  siteId: SiteId,
): SiteState | null {
  for (const node of Object.values(journey.atlas.nodes)) {
    const site = node.sites.find((candidate) => candidate.id === siteId);
    if (site !== undefined) return site;
  }
  return null;
}

/**
 * Whether the atlas marks `siteId` visited. The site's `isVisited` flag is the
 * single record of completion; a site id absent from the atlas is unvisited.
 */
export function isSiteVisited(journey: JourneyState, siteId: SiteId): boolean {
  return findSite(journey, siteId)?.isVisited === true;
}

/**
 * The site the player currently stands in: the screen's site while a site
 * screen is showing, otherwise `null`.
 */
export function activeSiteIdOf(journey: JourneyState): SiteId | null {
  return journey.screen.type === "site" ? journey.screen.siteId : null;
}

/**
 * Whether `siteId` is a legal visit target: the site must exist and, when the
 * player stands in a dreamscape, belong to it; it must be unvisited; a Battle
 * site must be visited last (every non-Battle sibling already visited).
 */
export function canVisitSite(journey: JourneyState, siteId: SiteId): boolean {
  for (const node of Object.values(journey.atlas.nodes)) {
    const site = node.sites.find((candidate) => candidate.id === siteId);
    if (site === undefined) continue;
    if (site.isVisited) return false;
    if (
      journey.currentDreamscape !== null &&
      node.id !== journey.currentDreamscape
    ) {
      return false;
    }
    if (site.type === "Battle") {
      return node.sites.every(
        (candidate) => candidate.type === "Battle" || candidate.isVisited,
      );
    }
    return true;
  }
  return false;
}

/** Mark `siteId` visited in the atlas. */
export function completeJourneySite(
  journey: JourneyState,
  siteId: SiteId,
): JourneyState {
  if (!canVisitSite(journey, siteId)) return journey;
  const updatedNodes = { ...journey.atlas.nodes };
  for (const [nodeId, node] of identityEntries(updatedNodes)) {
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
    atlas: { ...journey.atlas, nodes: updatedNodes },
  };
}

/** Complete the site and return to the dreamscape. */
export function completeAndReturn(
  journey: JourneyState,
  siteId: SiteId,
): JourneyState {
  return {
    ...completeJourneySite(journey, siteId),
    screen: { type: "dreamscape" },
  };
}

/** Store `runtime` for `siteId`, replacing any existing entry for that key. */
function withRuntime(
  journey: JourneyState,
  siteId: SiteId,
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
 * `OPEN_SITE { siteId, selectionRulesVersion }` — one type-dispatched
 * generator for every site runtime. Every open names the selection protocol it
 * was written under. Dispatches on the site's TYPE:
 *   - RandomSite / Essence: generated purely in-reducer from `ctx.rng`.
 *   - Augury / Exploration: delegated to the registered
 *     {@link SiteContentProvider} under the payload's `selectionRulesVersion`,
 *     which must name the current selection protocol.
 *   - Reward / DreamsignRevelation / Shop / DreamsignBazaar / Transfiguration /
 *     Duplication / Gamble: delegated to the registered {@link SiteContentProvider}.
 *
 * An existing runtime is authoritative, so a repeated event bounces without
 * regenerating it. The event-log intent key prevents repeated screen mounts
 * from appending that repeated event. Bounces also cover a
 * malformed payload (including a missing `selectionRulesVersion`), an unknown
 * site, a site type that has no runtime, a content-coupled type with no
 * provider wired, or an Augury / Exploration open whose
 * `selectionRulesVersion` names another protocol.
 */
function prepareEssenceReplacement(
  journey: JourneyState,
  site: SiteState,
  ctx: EventContext,
  source: { dreamsignId: DreamsignId; offerCount: 1 },
): JourneyState | null {
  const result = contentProvider?.openEssenceDreamsignReward({
    journey, site, rng: ctx.rng, offerCount: source.offerCount,
  });
  if (result == null || result.runtime.kind !== "reward" || result.runtime.accepted ||
    result.runtime.reward.rewardType !== "dreamsign") return null;
  const next = withRuntime(journey, site.id, {
    ...result.runtime, journeyEssenceSource: source.dreamsignId,
  });
  return { ...next, ...(result.remainingDreamsignPool === undefined ? {} :
    { remainingDreamsignPool: [...result.remainingDreamsignPool] }) };
}

export function openSite(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  modifiers?: JourneyModifierRegistry,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;

  if (journey.siteRuntime[siteId] !== undefined) return null;

  const storedSite = findSite(journey, siteId);
  if (storedSite === null) return null;
  const site = modifiers === undefined ? storedSite : projectJourneySite(journey, storedSite, modifiers);
  const rawGambleGameId = payload.gambleGameId;
  const rawSelectionRulesVersion = asString(payload.selectionRulesVersion);
  if (rawSelectionRulesVersion === null || rawSelectionRulesVersion === "") {
    return null;
  }
  const selectionRulesVersion = parseSelectionRulesVersion(
    rawSelectionRulesVersion,
  );
  if (
    rawGambleGameId !== undefined &&
    rawGambleGameId !== "gravok-three-gate-wager" &&
    rawGambleGameId !== "tidemark-ladder-climb" &&
    rawGambleGameId !== "starway-stairs" &&
    rawGambleGameId !== "four-suit-reprise" &&
    rawGambleGameId !== "blackjack"
  ) {
    return null;
  }

  if (site.type === "Reward" && site.isEnhanced &&
    (selectionRulesVersion !== SELECTION_RULES_VERSION || !canVisitSite(journey, siteId))) return null;

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
      if (site.isVisited) return null;
      const source = modifiers === undefined ? null : essenceReplacementSource(journey, modifiers);
      if (source !== null) return prepareEssenceReplacement(journey, site, ctx, source);
      if (modifiers !== undefined && essencePurgeSource(journey, modifiers) !== null && !canVisitSite(journey, siteId)) return null;
      const economy = contentProvider?.economyData.siteRewards.essence;
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
        selectionRulesVersion !== SELECTION_RULES_VERSION ||
        contentProvider === null
      ) {
        return null;
      }
      const result = contentProvider.openSite({
        journey,
        site,
        rng: ctx.rng,
        selectionRulesVersion,
      });
      if (result === null) return null;
      return withRuntime(journey, siteId, result.runtime);
    }
    case "Reward":
    case "DreamsignRevelation":
    case "Shop":
    case "DreamsignBazaar":
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
        selectionRulesVersion,
        ...(rawGambleGameId === undefined
          ? {}
          : { gambleGameId: rawGambleGameId }),
      });
      if (result === null) return null;
      if (site.type === "Reward") {
        const hasChoice = "enhancedDreamsignOffer" in result.runtime;
        if (hasChoice) {
          const runtime = result.runtime;
          if (!site.isEnhanced || !isEnhancedDreamsignReward(runtime) || runtime.accepted ||
            runtime.enhancedDreamsignOffer.selectionRulesVersion !== selectionRulesVersion) return null;
          const remaining = runtime.remainingDreamsignPoolIds;
          if (result.remainingDreamsignPool === undefined || result.remainingDreamsignPool.length !== remaining.length ||
            result.remainingDreamsignPool.some((id, index) => id !== remaining[index])) return null;
        }
        if (site.isEnhanced && (result.runtime.kind !== "reward" || result.runtime.accepted ||
          (result.runtime.reward.rewardType === "dreamsign" && !hasChoice))) return null;
      }
      const next = withRuntime(journey, siteId, result.runtime);
      return {
        ...next,
        ...(result.remainingDreamsignPool === undefined
          ? {}
          : { remainingDreamsignPool: [...result.remainingDreamsignPool] }),
        ...(result.siteOfferModifiers === undefined
          ? {}
          : { siteOfferModifiers: [...result.siteOfferModifiers] }),
        ...(result.shopModifiers === undefined
          ? {}
          : { shopModifiers: result.shopModifiers }),
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
  const siteId = siteIdFromUnknown(payload.siteId);
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
): JourneyPurgeTransition | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;
  const site = findSite(journey, siteId);
  if (site?.type !== "Exploration") return null;
  if (contentProvider === null) return null;
  return contentProvider.resolveExploration({
    journey,
    site,
    payload,
    seq: ctx.seq,
  });
}

// ---------------------------------------------------------------------------
// Reward / essence / dreamsign offer accept & reject
// ---------------------------------------------------------------------------

/**
 * `ACCEPT_REWARD { siteId, purgeIndex? }` grants
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
  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;
  if (isSiteVisited(journey, siteId)) return null;
  const runtime = journey.siteRuntime[siteId];
  if (runtime === undefined || runtime.kind !== "reward" || runtime.accepted) {
    return null;
  }
  const purgeIndex =
    payload.purgeIndex === undefined ? undefined : integer(payload.purgeIndex);
  if (payload.purgeIndex !== undefined && purgeIndex === null) return null;

  if ("enhancedDreamsignOffer" in runtime) return null;
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
 * `ACCEPT_ESSENCE { siteId }` generates the
 * site's deterministic reward when it has not been opened, adds the amount,
 * marks accepted, and completes the site.
 * Bounces on a wrong site/runtime kind or an already-accepted site.
 */
export function acceptEssence(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  modifiers?: JourneyModifierRegistry,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;
  if (isSiteVisited(journey, siteId)) return null;
  const existing = journey.siteRuntime[siteId];
  if (existing !== undefined && existing.kind !== "essence") {
    return null;
  }
  if (existing?.accepted) return null;
  const site = findSite(journey, siteId);
  if (site?.type !== "Essence") return null;
  const source = existing === undefined && modifiers !== undefined ? essenceReplacementSource(journey, modifiers) : null;
  if (source !== null) return prepareEssenceReplacement(journey, site, ctx, source);
  const economy = contentProvider?.economyData.siteRewards.essence;
  if (economy === undefined) return null;
  const rewardRange = site.isEnhanced ? economy.enhanced : economy.standard;
  const runtime =
    existing ??
    ({
      kind: "essence" as const,
      amount: randomIntInRange(ctx.rng, 0, rewardRange.min, rewardRange.max),
      accepted: false,
    } satisfies SiteRuntimeState);
  if (existing === undefined && modifiers !== undefined && essencePurgeSource(journey, modifiers) !== null) {
    return canVisitSite(journey, siteId) ? withRuntime(journey, siteId, runtime) : null;
  }
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
 * `ACCEPT_DREAMSIGN_OFFER { siteId, dreamsignId, purgeIndex? }`, keyed by UUID:
 * the accepted Dreamsign is resolved from the runtime's offered list by id
 * (never by name). Appends it (or replaces the `purgeIndex` slot), marks
 * accepted, and completes the site. Bounces on a missing runtime, a wrong kind,
 * an already-accepted site, an unoffered id, the `maxDreamsigns` limit with no
 * purge slot, or a `purgeIndex` pointing at no held Dreamsign.
 */
export function acceptDreamsignOffer(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const dreamsignId = dreamsignIdFromUnknown(payload.dreamsignId);
  if (siteId === null || dreamsignId === null) return null;
  if (isSiteVisited(journey, siteId)) return null;
  const runtime = journey.siteRuntime[siteId];
  const enhanced = pendingEnhancedReward(journey, siteId);
  if (runtime === undefined || (runtime.kind !== "dreamsignOffer" && runtime.kind !== "reward") ||
    runtime.accepted || (runtime.kind !== "dreamsignOffer" && enhanced === null)) return null;
  const offeredDreamsigns = runtime.kind === "dreamsignOffer"
    ? runtime.offeredDreamsigns : enhanced!.enhancedDreamsignOffer.offeredDreamsigns;
  const dreamsign = offeredDreamsigns.find(
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
 * `REJECT_DREAMSIGN_OFFER { siteId }` marks the
 * offer accepted (declined) and completes the site without granting anything.
 * Bounces on a missing runtime, a wrong kind, or an already-accepted site.
 */
export function rejectDreamsignOffer(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;
  if (isSiteVisited(journey, siteId)) return null;
  const runtime = journey.siteRuntime[siteId];
  if (
    runtime === undefined ||
    (runtime.kind !== "dreamsignOffer" && runtime.kind !== "reward") ||
    (runtime.kind === "reward" && pendingEnhancedReward(journey, siteId) === null) ||
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
// Card choice: transfiguration / duplication
// ---------------------------------------------------------------------------

/**
 * `ACCEPT_TRANSFIGURATION_CHOICE { siteId, entryId, type? }` stamps the chosen
 * transfiguration onto the deck entry, charges the offer's quoted essence cost
 * (authoritative from the stored runtime, never the client), records the
 * accepted entry, and completes the prepared allowance. When more than one form is offered
 * for an entry, an optional `type` selects which; otherwise the first offered
 * form for the entry is used. Bounces on a missing runtime, a wrong
 * kind/choiceKind, an already-accepted site, an entry not offered, an entry
 * already transfigured, no matching offer, or insufficient essence.
 */
export function acceptTransfigurationChoice(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const entryId = deckEntryIdFromUnknown(payload.entryId);
  if (siteId === null || entryId === null) return null;
  if (isSiteVisited(journey, siteId)) return null;
  const runtime = journey.siteRuntime[siteId];
  if (
    runtime === undefined ||
    runtime.kind !== "cardChoice" ||
    runtime.choiceKind !== "transfiguration" ||
    (runtime.journeyTransfigurationCount !== undefined && (journey.screen.type !== "site" || journey.screen.siteId !== siteId)) ||
    runtime.acceptedEntryIds.length >= (runtime.journeyTransfigurationCount?.count ?? 1) ||
    runtime.acceptedEntryIds.includes(entryId) ||
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
  const acceptedEntryIds = [...runtime.acceptedEntryIds, entryId];
  const prepared = withRuntime(next, siteId, { ...runtime, acceptedEntryIds });
  return acceptedEntryIds.length >= (runtime.journeyTransfigurationCount?.count ?? 1)
    ? completeAndReturn(prepared, siteId) : prepared;
}

/**
 * `ACCEPT_DUPLICATION_CHOICE { siteId, entryId }` appends the live quoted count
 * of copies carrying the selected entry's production modifications, each with
 * a fresh seq-deterministic entry id, and records the
 * accepted entry, and completes the site. Bounces on a missing runtime, a wrong
 * kind/choiceKind, an already-accepted site, an entry not offered, or a stale
 * entry id.
 */
export function acceptDuplicationChoice(
  journey: JourneyState,
  payload: Record<string, unknown>,
  ctx: EventContext,
  modifiers?: Pick<JourneyModifierRegistry, "lookup">,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const entryId = deckEntryIdFromUnknown(payload.entryId);
  if (siteId === null || entryId === null) return null;
  if (isSiteVisited(journey, siteId)) return null;
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

  let next = journey;
  const count = duplicationSiteQuote(journey, modifiers).copies;
  for (let i = 0; i < count; i++) {
    const copied = duplicateDeckEntry(next, { entryId }, ctx);
    if (copied === null) return null;
    next = copied;
  }
  return completeAndReturn(
    withRuntime(next, siteId, { ...runtime, acceptedEntryIds: [entryId] }),
    siteId,
  );
}

// ---------------------------------------------------------------------------
// Augury: complete / reroll / force
// ---------------------------------------------------------------------------

/**
 * `COMPLETE_AUGURY { siteId }` marks
 * the augury runtime completed (seeding one if the site was never opened) and
 * completes the site. Bounces on a wrong (non-augury) runtime or an
 * already-completed augury.
 */
export function completeAugury(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;
  if (isSiteVisited(journey, siteId)) return null;
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
      : {
          kind: "augury",
          completed: false,
          selectionRulesVersion: SELECTION_RULES_VERSION,
        };
  return completeAndReturn(
    withRuntime(journey, siteId, { ...runtime, completed: true }),
    siteId,
  );
}

/**
 * `REROLL_AUGURY { siteId }` (debug) rebuilds
 * the augury runtime from scratch with a bumped `rerollNonce` (a clean-slate
 * encounter), preserving any debug-forced archetype. Bounces on a wrong
 * (non-augury) runtime or an already-completed augury.
 */
export function rerollAugury(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
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
    selectionRulesVersion: SELECTION_RULES_VERSION,
    rerollNonce: previousNonce + 1,
    ...(forcedArchetypeId === undefined ? {} : { forcedArchetypeId }),
  };
  return withRuntime(journey, siteId, runtime);
}

/**
 * `FORCE_AUGURY_ARCHETYPE { siteId, archetypeId }` (debug) rebuilds the augury
 * runtime with a bumped nonce and the forced archetype (a `null` archetype
 * clears it). Bounces on a wrong (non-augury) runtime, an already-completed
 * augury, or a malformed archetype value.
 */
export function forceAuguryArchetype(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;
  // `archetypeId` may be a known archetype (force) or null (clear).
  const archetypeId =
    payload.archetypeId === null
      ? null
      : auguryArchetypeIdFromUnknown(payload.archetypeId);
  if (payload.archetypeId !== null && archetypeId === null) return null;
  const existing = journey.siteRuntime[siteId];
  if (existing !== undefined && existing.kind !== "augury") return null;
  if (existing?.kind === "augury" && existing.completed) return null;
  const previousNonce =
    existing?.kind === "augury" ? (existing.rerollNonce ?? 0) : 0;
  const runtime: AugurySiteRuntime = {
    kind: "augury",
    completed: false,
    selectionRulesVersion: SELECTION_RULES_VERSION,
    rerollNonce: previousNonce + 1,
    ...(archetypeId === null ? {} : { forcedArchetypeId: archetypeId }),
  };
  return withRuntime(journey, siteId, runtime);
}

// ---------------------------------------------------------------------------
// Generic site completion
// ---------------------------------------------------------------------------

/**
 * `COMPLETE_SITE { siteId }` marks the site visited and
 * returns to the dreamscape. Bounces (via the visited guard) when the site is
 * already visited so a double completion cannot re-fire.
 */
export function completeSite(
  journey: JourneyState,
  payload: Record<string, unknown>,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;
  const runtime = journey.siteRuntime[siteId];
  if (runtime?.kind === "reward" && "enhancedDreamsignOffer" in runtime) return null;
  const inlinePearl = journey.screen.type === "dreamscape" &&
    journey.currentDreamscape !== null &&
    journey.atlas.nodes[journey.currentDreamscape]?.sites.some((site) =>
      site.id === siteId && site.type === "Essence") === true &&
    runtime?.kind === "reward" && !runtime.accepted &&
    runtime.journeyEssenceSource !== undefined && runtime.reward.rewardType === "dreamsign";
  const inlineReward = journey.screen.type === "dreamscape" &&
    journey.currentDreamscape !== null &&
    journey.atlas.nodes[journey.currentDreamscape]?.sites.some((site) =>
      site.id === siteId && site.type === "Reward") === true &&
    runtime?.kind === "reward" && runtime.accepted === false &&
    runtime.journeyEssenceSource === undefined && runtime.reward.rewardType === "dreamsign" &&
    journey.dreamsigns.length >= journey.maxDreamsigns;
  if ((!inlinePearl && !inlineReward && (journey.screen.type !== "site" || journey.screen.siteId !== siteId)) ||
    !canVisitSite(journey, siteId)) return null;
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
): JourneyPurgeTransition | null {
  const raw = payload.entryIds;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const entryIds: DeckEntryId[] = [];
  for (const value of raw) {
    const entryId = deckEntryIdFromUnknown(value);
    if (entryId === null) return null;
    entryIds.push(entryId);
  }
  const targets = new Set<DeckEntryId>(entryIds);
  if (targets.size !== entryIds.length) return null;
  const removed = journey.deck.filter((entry) => targets.has(entry.entryId));
  if (removed.length !== targets.size) return null;
  const deck = journey.deck.filter((entry) => !targets.has(entry.entryId));

  const siteId = siteIdFromUnknown(payload.siteId);
  if (siteId === null) return null;
  const site = findSite(journey, siteId);
  if (
    site?.type !== "Purge" ||
    !canVisitSite(journey, siteId) ||
    activeSiteIdOf(journey) !== siteId
  ) {
    return null;
  }
  const paidCount = removed.filter((entry) => !entry.isBane).length;
  const purgeConfig = contentProvider?.economyData.purge;
  if (purgeConfig === undefined || paidCount > purgeConfig.marginalCosts.length)
    return null;
  const cost = purgeVisitCost(purgeConfig, paidCount, {
    isEnhanced: site.isEnhanced,
    essenceDiscountPercent: journey.shopModifiers.essenceDiscountPercent,
  });
  if (journey.essence < cost) return null;
  const essence = clampEssence(journey.essence - cost);

  return { journey: completeAndReturn({ ...journey, deck, essence }, siteId),
    purges: removed.map(({ entryId }) => ({ entryId })) };
}

/** Real pool preparation for one earned source; absence is not an empty pool. */
export function prepareAfterBattleDreamsignOffer(journey: JourneyState, offerCount: number, random: () => number) {
  return contentProvider?.prepareAfterBattleDreamsignOffer?.({ journey, offerCount, random }) ?? null;
}
