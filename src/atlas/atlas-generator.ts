import type {
  AtlasData,
  DreamAtlas,
  DreamscapeModifier,
  DreamscapeNode,
  SiteState,
  SiteType,
} from "../types/journey";
import type {
  ApollyonIncarnationContent,
  DreamscapeContent,
} from "../types/content";
import {
  LAYER_COUNT,
  LayerName,
  layerAtOrdinal,
  layerOrdinal,
} from "../types/layer-name";
import { otherGuideSignatureSites } from "../data/dreamscapes";
import { draftSiteData } from "../draft/draft-site-config";
import { logEvent } from "../logging";
import type { RandomSiteDestinationType } from "../types/journey";
import { atlasLayerData } from "../types/atlas-data";
import type { SitesData } from "../types/sites-data";
import type { GambleData } from "../types/gamble-data";
import type { DreamsignId, GuideId } from "../types/identifiers";
import type { DreamscapeId } from "../types/identifiers";
import type { AtlasNodeId } from "../types/identifiers";
import type { SiteId } from "../types/identifiers";
import { asAtlasNodeId } from "../types/identifiers";
import { asSiteId } from "../types/identifiers";
import { asDreamsignId } from "../types/identifiers";

/** Parameters for site generation that require external data. */
export interface SiteGenerationContext {
  /**
   * Active dreamscape modifiers at generation time. Site appearance boosts
   * increase the targeted site's base pool weight by their percentage; boosts
   * for the same site type stack additively before the weight is recalculated.
   */
  dreamscapeModifiers?: readonly DreamscapeModifier[];
  /** Number of picks persisted on each newly generated Draft site. */
  draftPickCount: number;
}

/**
 * External data the 7-layer Atlas generator needs: the dreamscape definitions it
 * assigns to nodes, the generation tuning, and the run's dreamsign pool the
 * known-dreamsign placement draws from. Sourced from the compiled TOML bundles
 * (`public/dreamscapes-data.json` and `public/atlas-data.json`) and threaded through the journey
 * content so generation stays synchronous inside reducers.
 */
export interface AtlasBuildContext {
  dreamscapes: readonly DreamscapeContent[];
  atlasData: AtlasData;
  sitesData: SitesData;
  gambleData: GambleData;
  /** Dreamsign ids eligible to be granted as pre-revealed known dreamsigns. */
  dreamsignPoolIds: readonly DreamsignId[];
  /**
   * Apollyon's incarnations; generation picks one to present the boss node. May
   * be empty in legacy or test contexts, in which case no incarnation is
   * assigned and the boss falls back to its default presentation.
   */
  apollyonIncarnations?: readonly ApollyonIncarnationContent[];
}

export interface AtlasGenerationOptions {
  logEvents?: boolean;
  /**
   * Deterministic `[0, 1)` random source for the whole generation. When omitted
   * the generator draws from `Math.random` (the legacy/UI path). The coop
   * event-sourcing lifecycle provider passes a rng seeded from the run seed so
   * every client folding `START_JOURNEY` builds a byte-identical atlas (the
   * determinism rail). Set for the duration of a `generateInitialAtlas` call and
   * restored afterward, so other atlas mutators keep their own default.
   */
  rng?: () => number;
}

/** Horizontal spacing between adjacent layers in atlas-space pixels. */
const LAYER_X_SPACING = 200;
/** Vertical spacing between adjacent column slots within one layer. */
const LAYER_Y_SPACING = 140;

let nodeIdCounter = 0;
let siteIdCounter = 0;

/**
 * The active random source for the module's generation helpers. Defaults to
 * `Math.random`; {@link generateInitialAtlas} overrides it with a seeded stream
 * for the duration of a single call and restores it afterward. All internal
 * draws (`randomInt`, `weightedPick`, `triangularInt`, dreamsign placement) go
 * through this so seeding one entry point makes the whole build deterministic.
 */
let atlasRandom: () => number = Math.random;

function nextNodeId(): AtlasNodeId {
  nodeIdCounter += 1;
  return asAtlasNodeId(`dreamscape-${String(nodeIdCounter)}`);
}

function nextSiteId(): SiteId {
  siteIdCounter += 1;
  return asSiteId(`site-${String(siteIdCounter)}`);
}

function numericSuffix(id: string, prefix: string): number | null {
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
  if (match === null) {
    return null;
  }
  const suffix = Number.parseInt(match[1], 10);
  return Number.isFinite(suffix) ? suffix : null;
}

function maxNodeIdSuffix(atlas: DreamAtlas): number {
  let max = 0;
  for (const [key, node] of Object.entries(atlas.nodes)) {
    for (const id of [key, node.id]) {
      const suffix = numericSuffix(id, "dreamscape");
      if (suffix !== null && suffix > max) {
        max = suffix;
      }
    }
  }
  return max;
}

function maxSiteIdSuffix(atlas: DreamAtlas): number {
  let max = 0;
  for (const node of Object.values(atlas.nodes)) {
    // A persisted node can lack a `sites` array entirely (RTDB drops empty
    // arrays on write, and unrevealed nodes carry no sites yet), so iterate
    // defensively rather than throwing while syncing id counters.
    const sites = Array.isArray(node.sites) ? node.sites : [];
    for (const site of sites) {
      const suffix = numericSuffix(site.id, "site");
      if (suffix !== null && suffix > max) {
        max = suffix;
      }
    }
  }
  return max;
}

/**
 * Derives the node/site id counters from the input Atlas. Each generation call
 * is therefore a pure function of its explicit inputs even when an optimistic
 * fold and a confirmed refold execute sequentially in the same JavaScript
 * runtime.
 */
export function syncAtlasGeneratorCounters(atlas: DreamAtlas): void {
  nodeIdCounter = maxNodeIdSuffix(atlas);
  siteIdCounter = maxSiteIdSuffix(atlas);
}

/** Resets internal counters. Call when starting a new journey. */
export function resetAtlasGenerator(): void {
  nodeIdCounter = 0;
  siteIdCounter = 0;
}

function randomInt(min: number, max: number): number {
  return Math.floor(atlasRandom() * (max - min + 1)) + min;
}

/** Weighted random selection from an array of [item, weight] pairs. */
function weightedPick<T>(items: Array<[T, number]>): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) {
    return items[0][0];
  }
  let roll = atlasRandom() * total;
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll <= 0) {
      return item;
    }
  }
  return items[items.length - 1][0];
}

/**
 * Samples a count in `[min, max]` biased toward `mode` via a triangular draw.
 * Used for the bonus-reveal count, where the middle value is most common.
 */
function triangularInt(min: number, max: number, mode: number): number {
  if (max <= min) {
    return min;
  }
  const clampedMode = Math.min(Math.max(mode, min), max);
  const u = atlasRandom();
  const range = max - min;
  const split = (clampedMode - min) / range;
  let value: number;
  if (u < split) {
    value = min + Math.sqrt(u * range * (clampedMode - min));
  } else {
    value = max - Math.sqrt((1 - u) * range * (max - clampedMode));
  }
  return Math.round(value);
}

function combinedSiteAppearanceBoosts(
  modifiers: readonly DreamscapeModifier[] = [],
): Map<SiteType, number> {
  const boostsByType = new Map<SiteType, number>();
  for (const modifier of modifiers) {
    if (
      modifier.kind !== "boost_site_appearance" ||
      modifier.dreamscapesRemaining <= 0 ||
      modifier.percent <= 0
    ) {
      continue;
    }
    boostsByType.set(
      modifier.siteType,
      (boostsByType.get(modifier.siteType) ?? 0) + modifier.percent,
    );
  }
  return boostsByType;
}

function removedSiteTypesFromModifiers(
  modifiers: readonly DreamscapeModifier[] = [],
): Set<SiteType> {
  const removedTypes = new Set<SiteType>();

  for (const modifier of modifiers) {
    if (modifier.dreamscapesRemaining <= 0) {
      continue;
    }

    if (modifier.kind === "remove_shop_sites") {
      removedTypes.add("Shop");
    }
  }

  return removedTypes;
}

function applySiteRemovalModifiers(
  pool: Array<[SiteType, number]>,
  modifiers: readonly DreamscapeModifier[] = [],
): Array<[SiteType, number]> {
  const removedTypes = removedSiteTypesFromModifiers(modifiers);

  if (removedTypes.size === 0) {
    return pool;
  }

  return pool.filter(([siteType]) => !removedTypes.has(siteType));
}

function applySiteAppearanceBoosts(
  pool: Array<[SiteType, number]>,
  modifiers: readonly DreamscapeModifier[] = [],
): Array<[SiteType, number]> {
  const boostsByType = combinedSiteAppearanceBoosts(modifiers);

  if (boostsByType.size === 0) {
    return pool;
  }

  return pool.map(([siteType, weight]) => {
    const boostPercent = boostsByType.get(siteType) ?? 0;
    return [siteType, weight * (1 + boostPercent / 100)];
  });
}

/**
 * Resolves the authored base fill profile for a layer. Other guides' signature
 * sites receive the profile default; explicit site weights both override a
 * signature weight and add generic candidates such as Essence.
 */
function buildFillPool(
  layer: LayerName,
  homeSite: SiteType,
  dreamscapes: readonly DreamscapeContent[],
  atlasData: AtlasData,
): Array<[SiteType, number]> {
  const layerData = atlasLayerData(atlasData, layer);
  const profile =
    layerData.fillProfile === null
      ? null
      : atlasData.fillProfiles[layerData.fillProfile];
  if (profile === null || profile === undefined) return [];
  const weights = new Map<SiteType, number>();

  for (const siteType of otherGuideSignatureSites(dreamscapes, homeSite)) {
    weights.set(
      siteType,
      profile.siteWeights[siteType] ?? profile.signatureSiteWeight,
    );
  }
  for (const [siteType, weight] of Object.entries(profile.siteWeights)) {
    weights.set(siteType as SiteType, weight);
  }
  weights.delete(homeSite);
  return [...weights.entries()].filter(([, weight]) => weight > 0);
}

/**
 * Returns the fill site types eligible for a dreamscape on the given atlas
 * layer, after applying active site-removal modifiers. `homeSite` is the
 * dreamscape's own enhanced signature site, excluded from the fill so it is
 * never duplicated.
 */
export function additionalSiteTypesForLevel(
  layer: LayerName,
  homeSite: SiteType,
  dreamscapes: readonly DreamscapeContent[],
  context: SiteGenerationContext,
  atlasData: AtlasData,
): SiteType[] {
  return applySiteRemovalModifiers(
    buildFillPool(layer, homeSite, dreamscapes, atlasData),
    context.dreamscapeModifiers,
  ).map(([siteType]) => siteType);
}

/** Inputs to {@link generateSiteComposition}. */
export interface SiteCompositionInput {
  /** The node's atlas layer (`LayerName.One` = starter, `Seven` = boss). */
  layer: LayerName;
  /** The dreamscape assigned to the node, or `null` if none is assigned. */
  dreamscape: DreamscapeContent | null;
  /** Every dreamscape definition, used to source the fill pool. */
  dreamscapes: readonly DreamscapeContent[];
  /** Authored Atlas rules used for this composition. */
  atlasData: AtlasData;
  sitesData: SitesData;
  /** Site-generation tuning (active dreamscape modifiers). */
  context: SiteGenerationContext;
  /**
   * Whether this node carries a pre-revealed known dreamsign. When true, one
   * fill slot becomes a Dreamsign Reward site granting that dreamsign on visit.
   */
  hasKnownDreamsign?: boolean;
  /** Deterministic random source for direct composition tests and tools. */
  rng?: () => number;
}

/** The result of composing a dreamscape's sites. */
export interface SiteCompositionResult {
  sites: SiteState[];
  /** The signature site type marked enhanced, or `null` when none was. */
  enhancedSiteType: SiteType | null;
}

/** Builds a fresh, unvisited site of the given type. */
function makeSite(
  type: SiteType,
  isEnhanced: boolean,
  draftPickCount: number,
): SiteState {
  return {
    id: asSiteId(nextSiteId()),
    type,
    isEnhanced,
    isVisited: false,
    ...(type === "Draft" ? { data: draftSiteData(draftPickCount) } : {}),
  };
}

function randomSiteCandidates(
  sitesData: SitesData,
  usedTypes: ReadonlySet<SiteType>,
  modifiers: readonly DreamscapeModifier[] = [],
): RandomSiteDestinationType[] {
  const removed = removedSiteTypesFromModifiers(modifiers);
  return sitesData.randomSite.destinations.filter(
    (type) => !usedTypes.has(type) && !removed.has(type),
  );
}

function makeRandomSite(
  mode: "single" | "homeChoice",
  candidates: RandomSiteDestinationType[],
  homeChoiceCount: number,
  guideId: GuideId | null,
  draftPickCount: number,
): SiteState {
  if (mode === "homeChoice" && candidates.length < homeChoiceCount) {
    throw new Error(
      `Random Site home choice requires at least ${String(homeChoiceCount)} eligible destinations.`,
    );
  }
  const destinationSiteType =
    mode === "single" && candidates.length > 0
      ? candidates[randomInt(0, candidates.length - 1)]
      : undefined;
  return {
    ...makeSite("RandomSite", true, draftPickCount),
    data: draftSiteData(draftPickCount),
    randomSite: {
      mode,
      candidateSiteTypes: candidates,
      ...(destinationSiteType === undefined ? {} : { destinationSiteType }),
      ...(guideId === null ? {} : { presentingGuideId: guideId }),
    },
  };
}

/**
 * Generates the ordered site composition for one dreamscape node, following the
 * doc's named-dreamscape rules. Total sites stay within 3-6 and the Battle is
 * always last in visit order.
 *
 * The starter dreamscape ({@link LayerName.One}, `isStarter`) returns its fixed
 * site list with no enhancement and no fill. Every other dreamscape is built
 * from:
 *
 * - **Mandatory** sites: the home guide's signature site, marked enhanced;
 *   authored per-layer site counts; and a structural Battle, placed last.
 * - **Fill** sites drawn from the layer's configured profile (including other
 *   dreamscapes' signature sites), sampled without replacement so every
 *   non-Draft type appears at most once. A known-dreamsign carrier consumes one
 *   fill slot with a Dreamsign Reward site.
 *
 * The composition is logged (layer, weights, chosen sites) for reconstruction.
 */
export function generateSiteComposition(
  input: SiteCompositionInput,
  logEvents = false,
): SiteCompositionResult {
  const previousAtlasRandom = atlasRandom;
  atlasRandom = input.rng ?? atlasRandom;
  try {
    return generateSiteCompositionInternal(input, logEvents);
  } finally {
    atlasRandom = previousAtlasRandom;
  }
}

function generateSiteCompositionInternal(
  input: SiteCompositionInput,
  logEvents: boolean,
): SiteCompositionResult {
  const {
    layer,
    dreamscape,
    dreamscapes,
    atlasData,
    sitesData,
    context,
    hasKnownDreamsign,
  } = input;

  // Starter dreamscape: fixed list, no enhancement, no fill.
  if (dreamscape?.isStarter === true && dreamscape.fixedSites !== undefined) {
    const sites = dreamscape.fixedSites.map((type) =>
      makeSite(type, false, context.draftPickCount),
    );
    if (logEvents) {
      logEvent("dreamscape_site_composition", {
        dreamscapeId: dreamscape.id,
        layer,
        isStarter: true,
        siteTypes: sites.map((s) => s.type),
        enhancedSiteType: null,
      });
    }
    return { sites, enhancedSiteType: null };
  }

  const homeSite = dreamscape?.signatureSite ?? null;
  const layerData = atlasLayerData(atlasData, layer);
  const randomSiteGuideId = sitesData.randomSite.guideId;
  // Types already placed, so fill never duplicates a non-Draft type.
  const usedTypes = new Set<SiteType>();
  // Non-battle sites, in visit order. Battle is appended last at the end.
  const preBattle: SiteState[] = [];

  // --- Mandatory: home guide's signature site, enhanced. ---
  let enhancedSiteType: SiteType | null = null;
  if (homeSite !== null) {
    preBattle.push(makeSite(homeSite, true, context.draftPickCount));
    usedTypes.add(homeSite);
    enhancedSiteType = homeSite;
  }

  // --- Mandatory sites authored per layer. Draft may repeat; other types do not. ---
  for (const [mandatoryType, count] of Object.entries(
    layerData.mandatorySites,
  )) {
    const siteType = mandatoryType as SiteType;
    for (let index = 0; index < count; index += 1) {
      if (siteType !== "Draft" && usedTypes.has(siteType)) break;
      preBattle.push(makeSite(siteType, false, context.draftPickCount));
      if (siteType !== "Draft") usedTypes.add(siteType);
    }
  }

  // --- Known-dreamsign carrier: one fill slot becomes a Dreamsign Reward. ---
  const knownDreamsignSite = atlasData.siteComposition.knownDreamsignSite;
  if (hasKnownDreamsign === true && !usedTypes.has(knownDreamsignSite)) {
    preBattle.push(makeSite(knownDreamsignSite, false, context.draftPickCount));
    usedTypes.add(knownDreamsignSite);
  }

  // --- Fill from the weighted pool until total sites reach 3-6. ---
  // The total includes the trailing Battle, so the pre-battle target is 2-5.
  // `Battle` is never a guide signature site, so passing it as the excluded home
  // site keeps every guide site in the pool when the node has no dreamscape.
  const fillPool = applySiteAppearanceBoosts(
    applySiteRemovalModifiers(
      buildFillPool(layer, homeSite ?? "Battle", dreamscapes, atlasData),
      context.dreamscapeModifiers,
    ),
    context.dreamscapeModifiers,
  );
  // Sample without replacement: every non-Draft type appears at most once.
  const remainingPool = fillPool.filter(([type]) => !usedTypes.has(type));
  // Snapshot the filtered distribution before sampling depletes it, so the log
  // reflects the weights the fill picks were actually drawn from.
  const fillDistribution = remainingPool.map(([type, weight]) => ({
    type,
    weight,
  }));
  const siteCount = layerData.siteCount;
  if (siteCount === null) {
    throw new Error(
      `Atlas layer ${layer} has no non-starter site-count rules.`,
    );
  }
  const minPreBattle = Math.max(0, siteCount.min - 1);
  const maxPreBattle = Math.max(0, siteCount.max - 1);
  const minFill = Math.max(0, minPreBattle - preBattle.length);
  const maxFill = Math.max(minFill, maxPreBattle - preBattle.length);
  const fillCount = Math.min(randomInt(minFill, maxFill), remainingPool.length);
  const chosenFill: SiteType[] = [];
  for (let i = 0; i < fillCount && remainingPool.length > 0; i++) {
    if (homeSite === "RandomSite") {
      for (let index = remainingPool.length - 1; index >= 0; index -= 1) {
        const prospective = new Set(usedTypes);
        prospective.add(remainingPool[index][0]);
        if (
          randomSiteCandidates(
            sitesData,
            prospective,
            context.dreamscapeModifiers,
          ).length < sitesData.randomSite.homeChoiceCount
        ) {
          remainingPool.splice(index, 1);
        }
      }
      if (remainingPool.length === 0) break;
    }
    const siteType = weightedPick(remainingPool);
    if (siteType === "RandomSite") {
      const candidates = randomSiteCandidates(
        sitesData,
        usedTypes,
        context.dreamscapeModifiers,
      );
      const randomSite = makeRandomSite(
        "single",
        candidates,
        sitesData.randomSite.homeChoiceCount,
        randomSiteGuideId,
        context.draftPickCount,
      );
      preBattle.push(randomSite);
      if (randomSite.randomSite?.destinationSiteType !== undefined) {
        usedTypes.add(randomSite.randomSite.destinationSiteType);
        for (let index = remainingPool.length - 1; index >= 0; index -= 1) {
          if (
            remainingPool[index][0] ===
            randomSite.randomSite.destinationSiteType
          ) {
            remainingPool.splice(index, 1);
          }
        }
      }
    } else {
      preBattle.push(makeSite(siteType, false, context.draftPickCount));
    }
    usedTypes.add(siteType);
    chosenFill.push(siteType);
    for (let index = remainingPool.length - 1; index >= 0; index -= 1) {
      if (remainingPool[index][0] === siteType) {
        remainingPool.splice(index, 1);
      }
    }
  }

  if (homeSite === "RandomSite") {
    const occupiedGuideTypes = new Set<SiteType>(
      preBattle
        .map((site) => site.type)
        .filter((type) => type !== "RandomSite"),
    );
    const candidates = randomSiteCandidates(
      sitesData,
      occupiedGuideTypes,
      context.dreamscapeModifiers,
    );
    const homeIndex = preBattle.findIndex((site) => site.type === "RandomSite");
    if (homeIndex >= 0) {
      preBattle[homeIndex] = makeRandomSite(
        "homeChoice",
        candidates,
        sitesData.randomSite.homeChoiceCount,
        randomSiteGuideId,
        context.draftPickCount,
      );
    }
  }

  // --- Battle, always last. ---
  const sites = [
    ...preBattle,
    makeSite("Battle", false, context.draftPickCount),
  ];

  if (logEvents) {
    logEvent("dreamscape_site_composition", {
      dreamscapeId: dreamscape?.id ?? null,
      layer,
      isStarter: false,
      homeSite,
      enhancedSiteType,
      mandatorySites: layerData.mandatorySites,
      hasKnownDreamsign: hasKnownDreamsign === true,
      fillWeights: fillDistribution,
      fillChosen: chosenFill,
      randomSites: sites
        .filter((site) => site.randomSite !== undefined)
        .map((site) => ({
          siteId: site.id,
          mode: site.randomSite?.mode,
          candidateSiteTypes: site.randomSite?.candidateSiteTypes,
          hiddenDestinationSiteType:
            site.randomSite?.destinationSiteType ?? null,
        })),
      siteTypes: sites.map((s) => s.type),
    });
  }

  return { sites, enhancedSiteType };
}

/**
 * FNV-1a hash of a string. Used to derive deterministic per-node and
 * per-node Atlas preview selections.
 */
function fnv1aHash(value: string): number {
  const HASH_OFFSET_BASIS = 2166136261;
  const HASH_PRIME = 16777619;
  let hash = HASH_OFFSET_BASIS;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, HASH_PRIME) >>> 0;
  }
  return hash;
}

/**
 * Predicate: do the forward edges (a -> b) and (c -> d) cross, where a, c are
 * source `indexInLayer` and b, d are target `indexInLayer`? Two edges cross
 * exactly when their source order and target order disagree.
 */
export function edgesCross(
  a: number,
  b: number,
  c: number,
  d: number,
): boolean {
  return (a < c && b > d) || (a > c && b < d);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

interface AtlasState {
  atlas: DreamAtlas;
  context: AtlasBuildContext;
  siteContext: SiteGenerationContext;
  completionLevel: number;
  /**
   * Per-dreamscape placement weight. Starts at 1 for every non-starter
   * dreamscape and is reduced each time that dreamscape is placed, discouraging
   * (but never forbidding) repeats. Kept > 0 always.
   */
  dreamscapeWeights: Map<string, number>;
  /** Run dreamsign pool still available to grant as known dreamsigns. */
  remainingDreamsignIds: DreamsignId[];
  logEvents: boolean;
}

/** Rolls each layer's width from its spec. Layers I and VII are always width 1. */
function rollLayerWidths(config: AtlasData): number[] {
  return config.layers.map((layer) =>
    randomInt(layer.nodeCount.min, layer.nodeCount.max),
  );
}

/**
 * Computes the (x, y) position of a node given its 0-based layer ordinal and
 * column slot.
 */
function nodePosition(
  layerOrdinalValue: number,
  indexInLayer: number,
  layerWidth: number,
): { x: number; y: number } {
  const x = layerOrdinalValue * LAYER_X_SPACING;
  // Centre the column vertically: a width-1 layer sits at y=0, wider layers
  // spread symmetrically around it.
  const y = (indexInLayer - (layerWidth - 1) / 2) * LAYER_Y_SPACING;
  return { x, y };
}

/**
 * Wires non-crossing forward connections from `fromLayer` to `toLayer`.
 *
 * A monotonic backbone first guarantees every source has at least one forward
 * edge and every target at least one backward edge: sources and targets are
 * walked in index order so the backbone can never cross. Extra non-crossing
 * edges are then added at random toward the configured connection average; an
 * extra edge is accepted only when it crosses none of the edges already placed
 * between these two layers.
 */
function wireLayerConnections(
  fromLayer: DreamscapeNode[],
  toLayer: DreamscapeNode[],
  connectionAverage: number,
): Array<[number, number]> {
  const edges: Array<[number, number]> = [];
  const has = (s: number, t: number) =>
    edges.some(([a, b]) => a === s && b === t);
  const crossesExisting = (s: number, t: number) =>
    edges.some(([a, b]) => edgesCross(a, b, s, t));

  const addEdge = (sourceIdx: number, targetIdx: number) => {
    if (has(sourceIdx, targetIdx)) {
      return;
    }
    edges.push([sourceIdx, targetIdx]);
    fromLayer[sourceIdx].forwardIds.push(toLayer[targetIdx].id);
    toLayer[targetIdx].backwardIds.push(fromLayer[sourceIdx].id);
  };

  // Monotonic backbone. Pair sources and targets along a diagonal so every node
  // on both sides is covered and no two backbone edges cross.
  const steps = Math.max(fromLayer.length, toLayer.length);
  for (let i = 0; i < steps; i++) {
    const sourceIdx = Math.min(
      Math.floor((i * fromLayer.length) / steps),
      fromLayer.length - 1,
    );
    const targetIdx = Math.min(
      Math.floor((i * toLayer.length) / steps),
      toLayer.length - 1,
    );
    addEdge(sourceIdx, targetIdx);
  }
  // The diagonal walk above covers every source index and every target index:
  // it takes `max(fromLayer.length, toLayer.length)` steps and the floor map is
  // surjective onto both index ranges, so no orphan can remain.

  // Extra non-crossing edges toward the soft connection-average target.
  const targetEdgeCount = Math.round(connectionAverage * fromLayer.length);
  let attempts = 0;
  const maxAttempts = fromLayer.length * toLayer.length * 2;
  while (edges.length < targetEdgeCount && attempts < maxAttempts) {
    attempts += 1;
    const s = randomInt(0, fromLayer.length - 1);
    const t = randomInt(0, toLayer.length - 1);
    if (has(s, t) || crossesExisting(s, t)) {
      continue;
    }
    addEdge(s, t);
  }

  return edges;
}

/**
 * Draws a dreamscape for a node via a repeat-discouraged weighted draw with
 * rejection of ineligible dreamscapes. A draw is rejected when it would place a
 * dreamscape next to a connected copy of itself, or when it matches a dreamscape
 * already assigned to any other node in the same layer. Nodes in a layer are the
 * alternative choices the player picks between, so two of them sharing a
 * dreamscape (and thus the same signature site icon) reads as a generation
 * glitch; same-layer siblings are not necessarily connected, so they are
 * excluded explicitly in addition to the connected neighbours. The draw is
 * made from the eligible set, guaranteeing uniqueness whenever content exists.
 */
function drawDreamscapeForNode(
  state: AtlasState,
  node: DreamscapeNode,
): DreamscapeContent {
  const nonStarter = state.context.dreamscapes.filter((d) => !d.isStarter);
  const selection = state.context.atlasData.dreamscapeSelection;
  const ineligibleDreamscapeIds = new Set<string>();
  if (selection.excludeConnectedRepeats) {
    const connectedIds = [...node.forwardIds, ...node.backwardIds];
    for (const id of connectedIds) {
      const dreamscapeId = state.atlas.nodes[id]?.dreamscapeId;
      if (dreamscapeId !== null && dreamscapeId !== undefined) {
        ineligibleDreamscapeIds.add(dreamscapeId);
      }
    }
  }

  // No two nodes in the same layer may carry the same dreamscape. Same-layer
  // siblings are not necessarily connected to one another, so exclude every
  // already-assigned same-layer dreamscape explicitly, not just connected ones.
  if (selection.excludeSameLayerRepeats) {
    const sameLayerIds = state.atlas.layers[layerOrdinal(node.layer)] ?? [];
    for (const siblingId of sameLayerIds) {
      if (siblingId === node.id) continue;
      const siblingDreamscapeId = state.atlas.nodes[siblingId]?.dreamscapeId;
      if (siblingDreamscapeId !== null && siblingDreamscapeId !== undefined) {
        ineligibleDreamscapeIds.add(siblingDreamscapeId);
      }
    }
  }

  const eligible = nonStarter.filter(
    (dreamscape) => !ineligibleDreamscapeIds.has(dreamscape.id),
  );
  const candidates = eligible.length > 0 ? eligible : nonStarter;
  const weighted = candidates.map((d): [DreamscapeContent, number] => [
    d,
    state.dreamscapeWeights.get(d.id) ?? selection.baseWeight,
  ]);
  const selected = weightedPick(weighted);
  if (state.logEvents) {
    logEvent("atlas_dreamscape_selected", {
      nodeId: node.id,
      layer: node.layer,
      excludedDreamscapeIds: [...ineligibleDreamscapeIds],
      exhaustionFallbackUsed: eligible.length === 0,
      candidates: weighted.map(([dreamscape, weight]) => ({
        dreamscapeId: dreamscape.id,
        weight,
      })),
      selectedDreamscapeId: selected.id,
    });
  }
  return selected;
}

/** Reduces a placed dreamscape's draw weight, keeping it strictly positive. */
function discourageRepeat(state: AtlasState, dreamscapeId: DreamscapeId): void {
  const strength = Math.max(
    1,
    state.context.atlasData.dreamscapeSelection.repeatDiscourageStrength,
  );
  const current =
    state.dreamscapeWeights.get(dreamscapeId) ??
    state.context.atlasData.dreamscapeSelection.baseWeight;
  state.dreamscapeWeights.set(dreamscapeId, current / strength);
}

/**
 * Assigns a dreamscape to a node and builds its sites. The {@link LayerName.One}
 * node always receives the starter dreamscape; the configured boss node is the
 * special Limbo place; every interior node draws from non-starter dreamscapes.
 * Idempotent: a node that already carries a dreamscape is returned unchanged.
 */
function revealNodeDreamscape(state: AtlasState, nodeId: AtlasNodeId): void {
  const node = state.atlas.nodes[nodeId];
  // A node carries a dreamscape once it has been revealed. Treat `undefined` as
  // "not yet revealed" alongside `null`: Realtime Database drops a stored `null`
  // on write and `structuredClone` drops an `undefined`-valued key, so a node
  // arriving here off a persisted/snapshotted atlas reports `dreamscapeId` as
  // `undefined` rather than `null`. A strict `!== null` check would treat such a
  // node as already revealed and skip assigning its dreamscape and sites.
  if ((node.dreamscapeId ?? null) !== null) {
    return;
  }

  const layerRule = atlasLayerData(state.context.atlasData, node.layer);
  const isFirstDreamscape = layerRule.role === "starter";
  const isBoss = layerRule.role === "boss";
  const starter = state.context.dreamscapes.find((d) => d.isStarter);
  let dreamscape: DreamscapeContent | null;
  if (isBoss) {
    dreamscape = null;
  } else if (isFirstDreamscape && starter !== undefined) {
    dreamscape = starter;
  } else if (state.context.dreamscapes.some((d) => !d.isStarter)) {
    dreamscape = drawDreamscapeForNode(state, node);
    discourageRepeat(state, dreamscape.id);
  } else {
    dreamscape = null;
  }

  // Composition is keyed off the node's atlas layer (not the run-wide
  // completion level), since a node can be revealed ahead of the player's
  // progress (the boss and bonus reveals) and the doc's draft/Purge rules are
  // per-layer. The starter (LayerName.One) returns its fixed list and no
  // enhancement.
  const { sites, enhancedSiteType } = generateSiteComposition(
    {
      layer: node.layer,
      dreamscape,
      dreamscapes: state.context.dreamscapes,
      atlasData: state.context.atlasData,
      sitesData: state.context.sitesData,
      context: state.siteContext,
      hasKnownDreamsign: (node.knownDreamsignId ?? null) !== null,
    },
    state.logEvents,
  );

  state.atlas.nodes[nodeId] = {
    ...node,
    dreamscapeId: isBoss
      ? state.context.atlasData.boss.dreamscapeId
      : (dreamscape?.id ?? null),
    sites,
    enhancedSiteType,
  };

  if (state.logEvents) {
    logEvent("atlas_node_revealed", {
      nodeId,
      layer: node.layer,
      indexInLayer: node.indexInLayer,
      dreamscapeId: isBoss
        ? state.context.atlasData.boss.dreamscapeId
        : (dreamscape?.id ?? null),
      dreamscapeName: isBoss
        ? state.context.atlasData.boss.place
        : (dreamscape?.name ?? null),
      nodeRole: layerRule.role,
      signatureSite: dreamscape?.signatureSite ?? null,
      enhancedSiteType,
      siteTypes: sites.map((s) => s.type),
      remainingWeight:
        dreamscape === null
          ? null
          : (state.dreamscapeWeights.get(dreamscape.id) ??
            state.context.atlasData.dreamscapeSelection.baseWeight),
    });
  }
}

/** Sets a node's lifecycle state, revealing its dreamscape when it becomes visible. */
function setNodeState(
  state: AtlasState,
  nodeId: AtlasNodeId,
  next: DreamscapeNode["state"],
): void {
  const node = state.atlas.nodes[nodeId];
  // Reveal whenever the node becomes visible and has no dreamscape yet. A node
  // off a persisted/snapshotted atlas reports `dreamscapeId` as `undefined`
  // (RTDB drops a stored `null`; `structuredClone` drops an `undefined` key), so
  // the nullish check must catch `undefined` as well as `null` — otherwise an
  // advanced forward node is left without a dreamscape or sites.
  if (next !== "unrevealed" && (node.dreamscapeId ?? null) === null) {
    revealNodeDreamscape(state, nodeId);
  }
  state.atlas.nodes[nodeId] = {
    ...state.atlas.nodes[nodeId],
    state: next,
  };
}

/**
 * Places up to `maxPerAtlas` known dreamsigns on eligible nodes. Carriers are
 * drawn from the configured eligible layers, biased toward earlier layers so one
 * can land among the start-revealed set; each carrier is granted a distinct
 * dreamsign drawn (and removed) from the run pool.
 */
function placeKnownDreamsigns(
  state: AtlasState,
  startRevealedNodeIds: ReadonlySet<string>,
): void {
  const cfg = state.context.atlasData.knownDreamsign;
  if (cfg.maxPerAtlas <= 0 || state.remainingDreamsignIds.length === 0) {
    return;
  }

  // Convert authored layer names to the ordinals used by the persisted arrays.
  const eligibleOrdinals = cfg.eligibleLayers
    .map((layer) => layerOrdinal(layer))
    .filter((ordinal) => ordinal >= 0 && ordinal < state.atlas.layers.length);

  // Candidate nodes, biased toward earlier layers and toward the start-reveal
  // set so a known dreamsign tends to be visible from the start.
  const candidates: Array<[string, number]> = [];
  for (const ordinal of eligibleOrdinals) {
    for (const nodeId of state.atlas.layers[ordinal]) {
      const earlierWeight = 1 + cfg.earlyRevealBias / (ordinal + 1);
      const revealBoost = startRevealedNodeIds.has(nodeId)
        ? 1 + cfg.earlyRevealBias
        : 1;
      candidates.push([nodeId, earlierWeight * revealBoost]);
    }
  }
  if (candidates.length === 0) {
    return;
  }

  const carriers: string[] = [];
  const remainingCandidates = [...candidates];
  while (
    carriers.length < cfg.maxPerAtlas &&
    state.remainingDreamsignIds.length > 0 &&
    remainingCandidates.length > 0
  ) {
    if (atlasRandom() > cfg.placementProbability) {
      break;
    }
    const chosen = weightedPick(remainingCandidates);
    for (let i = remainingCandidates.length - 1; i >= 0; i--) {
      if (remainingCandidates[i][0] === chosen) {
        remainingCandidates.splice(i, 1);
      }
    }
    const dreamsignIndex = randomInt(0, state.remainingDreamsignIds.length - 1);
    const [dreamsignId] = state.remainingDreamsignIds.splice(dreamsignIndex, 1);
    if (dreamsignId === undefined) {
      break;
    }
    const node = state.atlas.nodes[chosen];
    state.atlas.nodes[chosen] = {
      ...node,
      knownDreamsignId: asDreamsignId(dreamsignId),
    };
    carriers.push(chosen);

    if (state.logEvents) {
      logEvent("atlas_known_dreamsign_placed", {
        nodeId: asAtlasNodeId(chosen),
        layer: node.layer,
        indexInLayer: node.indexInLayer,
        dreamsignId: asDreamsignId(dreamsignId),
        amongStartReveal: startRevealedNodeIds.has(chosen),
      });
    }
  }

  state.atlas.knownDreamsignCarrierIds = carriers.map(asAtlasNodeId);
}

/**
 * Builds a fresh 7-layer Atlas. The starter ({@link LayerName.One}) is
 * `available` so the player enters it directly; the boss
 * ({@link LayerName.Seven}) plus a bell-curve sample of bonus nodes from the
 * deepest two layers are revealed (`revealedLocked`); every other node starts
 * `unrevealed`. Dreamscapes are assigned lazily as nodes are revealed, except
 * the starter and boss which are assigned eagerly.
 */
export function generateInitialAtlas(
  completionLevel: number,
  context: SiteGenerationContext,
  build: AtlasBuildContext,
  options: AtlasGenerationOptions = {},
): DreamAtlas {
  // Seed the module's generation helpers for the duration of this call, then
  // restore, so a caller-supplied `options.rng` makes the whole build
  // deterministic while other atlas mutators keep their own `Math.random`.
  const previousAtlasRandom = atlasRandom;
  atlasRandom = options.rng ?? Math.random;
  try {
    return generateInitialAtlasInternal(
      completionLevel,
      context,
      build,
      options,
    );
  } finally {
    atlasRandom = previousAtlasRandom;
  }
}

function generateInitialAtlasInternal(
  completionLevel: number,
  context: SiteGenerationContext,
  build: AtlasBuildContext,
  options: AtlasGenerationOptions = {},
): DreamAtlas {
  resetAtlasGenerator();
  const logEvents = options.logEvents !== false;

  const widths = rollLayerWidths(build.atlasData);
  const layers: AtlasNodeId[][] = [];
  const nodes: Record<string, DreamscapeNode> = {};

  for (let ordinal = 0; ordinal < widths.length; ordinal++) {
    const layerName = layerAtOrdinal(ordinal);
    if (layerName === undefined) {
      throw new Error(
        `Atlas layer ordinal ${String(ordinal)} has no LayerName; ` +
          `atlas-data layer-specs must define at most ${String(LAYER_COUNT)} layers.`,
      );
    }
    const layerIds: AtlasNodeId[] = [];
    for (let indexInLayer = 0; indexInLayer < widths[ordinal]; indexInLayer++) {
      const id = nextNodeId();
      nodes[id] = {
        id,
        layer: layerName,
        indexInLayer,
        dreamscapeId: null,
        sites: [],
        position: nodePosition(ordinal, indexInLayer, widths[ordinal]),
        state: "unrevealed",
        enhancedSiteType: null,
        forwardIds: [],
        backwardIds: [],
        knownDreamsignId: null,
      };
      layerIds.push(id);
    }
    layers.push(layerIds);
  }

  // Wire forward connections layer by layer.
  for (let ordinal = 0; ordinal < layers.length - 1; ordinal++) {
    const fromNodes = layers[ordinal].map((id) => nodes[id]);
    const toNodes = layers[ordinal + 1].map((id) => nodes[id]);
    wireLayerConnections(
      fromNodes,
      toNodes,
      build.atlasData.graph.connectionAverage,
    );
  }

  const startingNodeId = layers[0][0];
  const bossNodeId = layers[layers.length - 1][0];

  // Pick one of Apollyon's incarnations to present the boss node for this run.
  const incarnations = build.apollyonIncarnations ?? [];
  const bossIncarnationId =
    incarnations.length > 0
      ? incarnations[randomInt(0, incarnations.length - 1)].id
      : null;

  const dreamscapeWeights = new Map<string, number>();
  for (const dreamscape of build.dreamscapes) {
    if (!dreamscape.isStarter) {
      dreamscapeWeights.set(
        dreamscape.id,
        build.atlasData.dreamscapeSelection.baseWeight,
      );
    }
  }

  const atlas: DreamAtlas = {
    layers: layers,
    nodes,
    startingNodeId,
    bossNodeId,
    bossIncarnationId,
    currentNodeId: startingNodeId,
    knownDreamsignCarrierIds: [],
  };

  const state: AtlasState = {
    atlas,
    context: build,
    siteContext: context,
    completionLevel,
    dreamscapeWeights,
    remainingDreamsignIds: [...build.dreamsignPoolIds],
    logEvents,
  };

  if (logEvents) {
    const cfg = build.atlasData;
    // Wired forward connections, the load-bearing random output of the extra-edge
    // phase. Logged both as a per-node map (forwardIds) and a flat per-gap edge
    // list ([fromLayer, fromIndex] -> [toLayer, toIndex]) so the exact graph can
    // be reconstructed from the log alone.
    const forwardIds: Record<string, string[]> = {};
    const edges: Array<{
      from: string;
      to: string;
      fromLayer: LayerName;
      fromIndex: number;
      toLayer: LayerName;
      toIndex: number;
    }> = [];
    for (const node of Object.values(nodes)) {
      forwardIds[node.id] = [...node.forwardIds];
      for (const targetId of node.forwardIds) {
        const target = nodes[targetId];
        edges.push({
          from: node.id,
          to: targetId,
          fromLayer: node.layer,
          fromIndex: node.indexInLayer,
          toLayer: target.layer,
          toIndex: target.indexInLayer,
        });
      }
    }
    logEvent("atlas_generated", {
      layerWidths: widths,
      connectionAverage: cfg.graph.connectionAverage,
      startingNodeId: asAtlasNodeId(startingNodeId),
      bossNodeId: asAtlasNodeId(bossNodeId),
      // The Apollyon guise chosen for the boss node, plus the pool it was drawn
      // from, so a log read can reconstruct why this incarnation appeared.
      bossIncarnationId,
      apollyonIncarnationIds: incarnations.map((i) => i.id),
      forwardIds,
      edges,
      // Effective TOML tuning that drove every random draw, captured because the
      // production tuning is subject to change and a later log read needs to know
      // which tuning produced this atlas.
      atlasData: {
        contentHash: cfg.contentHash,
        foldHash: cfg.foldHash,
        layers: cfg.layers,
        graph: cfg.graph,
        dreamscapeSelection: cfg.dreamscapeSelection,
        fillProfiles: cfg.fillProfiles,
        knownDreamsign: {
          maxPerAtlas: cfg.knownDreamsign.maxPerAtlas,
          eligibleLayers: [...cfg.knownDreamsign.eligibleLayers],
          placementProbability: cfg.knownDreamsign.placementProbability,
          earlyRevealBias: cfg.knownDreamsign.earlyRevealBias,
        },
      },
      sitesData: {
        foldHash: build.sitesData.foldHash,
        randomSite: build.sitesData.randomSite,
        gambleSelection: {
          fallbackGame: build.gambleData.games.find(
            (game) => game.selection.fallback,
          )?.id,
          games: build.gambleData.games.map((game) => ({
            id: game.id,
            weight: game.selection.weight,
          })),
        },
        rulesBySiteType: Object.fromEntries(
          Object.entries(build.sitesData.siteTypes).flatMap(
            ([siteType, metadata]) =>
              metadata.rules === null ? [] : [[siteType, metadata.rules]],
          ),
        ),
      },
    });
  }

  // Bonus reveals: a bell-curve count of nodes from the deepest two interior
  // layers (Layers V and VI, ordinals 4 and 5) revealed at the start of the run.
  const bonusCount = triangularInt(
    build.atlasData.graph.bonusReveal.min,
    build.atlasData.graph.bonusReveal.max,
    build.atlasData.graph.bonusReveal.mode,
  );
  const bonusPool: string[] = [];
  for (const eligibleLayer of build.atlasData.graph.bonusReveal
    .eligibleLayers) {
    const ordinal = layerOrdinal(eligibleLayer);
    if (ordinal < layers.length - 1) {
      bonusPool.push(...layers[ordinal]);
    }
  }
  const bonusReveals: string[] = [];
  const shuffledBonus = [...bonusPool];
  for (let i = 0; i < bonusCount && shuffledBonus.length > 0; i++) {
    const idx = randomInt(0, shuffledBonus.length - 1);
    bonusReveals.push(shuffledBonus.splice(idx, 1)[0]);
  }

  const startRevealed = new Set<string>([
    startingNodeId,
    bossNodeId,
    ...bonusReveals,
  ]);

  // Place known dreamsigns before driving reveal states so an early carrier can
  // be among the start-revealed nodes.
  placeKnownDreamsigns(state, startRevealed);

  // The starter is entered directly; the boss and any bonus nodes are revealed
  // but locked.
  setNodeState(state, asAtlasNodeId(startingNodeId), "available");
  setNodeState(state, asAtlasNodeId(bossNodeId), "revealedLocked");
  for (const nodeId of bonusReveals) {
    setNodeState(state, asAtlasNodeId(nodeId), "revealedLocked");
  }

  if (logEvents) {
    logEvent("atlas_initial_reveal", {
      startingNodeId: asAtlasNodeId(startingNodeId),
      bossNodeId: asAtlasNodeId(bossNodeId),
      bonusRevealCount: bonusReveals.length,
      bonusRevealNodeIds: bonusReveals,
    });
  }

  return atlas;
}

/**
 * Advances the Atlas after the player completes the dreamscape at
 * `completedNodeId`: the node is marked `completed`, its forward targets become
 * `available`, the other nodes in the completed node's layer become `forgone`,
 * and the layer two ahead of the completed layer is revealed (`revealedLocked`).
 * `currentNodeId` is set to the completed node.
 */
export function advanceAtlas(
  atlas: DreamAtlas,
  completedNodeId: AtlasNodeId,
  completionLevel: number,
  context: SiteGenerationContext,
  build: AtlasBuildContext,
  options: AtlasGenerationOptions = {},
): DreamAtlas {
  const previousAtlasRandom = atlasRandom;
  atlasRandom = options.rng ?? Math.random;
  try {
    return advanceAtlasInternal(
      atlas,
      completedNodeId,
      completionLevel,
      context,
      build,
      options,
    );
  } finally {
    atlasRandom = previousAtlasRandom;
  }
}

function advanceAtlasInternal(
  atlas: DreamAtlas,
  completedNodeId: AtlasNodeId,
  completionLevel: number,
  context: SiteGenerationContext,
  build: AtlasBuildContext,
  options: AtlasGenerationOptions,
): DreamAtlas {
  const completedNode = atlas.nodes[completedNodeId];
  if (completedNode === undefined) {
    return atlas;
  }

  syncAtlasGeneratorCounters(atlas);
  const logEvents = options.logEvents !== false;

  // Rebuild weights from already-revealed dreamscapes so repeat-discourage stays
  // consistent across a reload that reset the in-memory weights.
  const dreamscapeWeights = new Map<string, number>();
  for (const dreamscape of build.dreamscapes) {
    if (!dreamscape.isStarter) {
      dreamscapeWeights.set(
        dreamscape.id,
        build.atlasData.dreamscapeSelection.baseWeight,
      );
    }
  }
  for (const node of Object.values(atlas.nodes)) {
    if (
      node.dreamscapeId !== null &&
      dreamscapeWeights.has(node.dreamscapeId)
    ) {
      dreamscapeWeights.set(
        node.dreamscapeId,
        (dreamscapeWeights.get(node.dreamscapeId) ??
          build.atlasData.dreamscapeSelection.baseWeight) /
          Math.max(
            1,
            build.atlasData.dreamscapeSelection.repeatDiscourageStrength,
          ),
      );
    }
  }

  const remainingDreamsignIds = build.dreamsignPoolIds.filter(
    (id) =>
      !Object.values(atlas.nodes).some((node) => node.knownDreamsignId === id),
  );

  const nextAtlas: DreamAtlas = {
    ...atlas,
    nodes: { ...atlas.nodes },
    currentNodeId: asAtlasNodeId(completedNodeId),
  };
  const state: AtlasState = {
    atlas: nextAtlas,
    context: build,
    siteContext: context,
    completionLevel,
    dreamscapeWeights,
    remainingDreamsignIds,
    logEvents,
  };

  setNodeState(state, asAtlasNodeId(completedNodeId), "completed");

  // A persisted atlas can arrive with empty arrays stripped (RTDB drops them on
  // write), so iterate every array field defensively rather than throwing while
  // advancing — the boss node carries `forwardIds: []` and the starting node
  // carries `backwardIds: []`, and unrevealed layers may be missing entirely.
  const atlasLayers = Array.isArray(atlas.layers) ? atlas.layers : [];
  const completedLayer = atlasLayers[layerOrdinal(completedNode.layer)];
  // Forgo the sibling choices in the completed node's layer.
  for (const siblingId of Array.isArray(completedLayer) ? completedLayer : []) {
    if (siblingId === completedNodeId) {
      continue;
    }
    const sibling = nextAtlas.nodes[siblingId];
    if (sibling.state !== "completed") {
      nextAtlas.nodes[siblingId] = { ...sibling, state: "forgone" };
    }
  }

  // The completed node's forward targets become the next available choices. The
  // boss node has no forward targets, so its stripped `forwardIds` reads as
  // `undefined` off a persisted atlas — guard so winning the final boss never
  // throws and aborts the post-victory advance.
  const forwardIds = Array.isArray(completedNode.forwardIds)
    ? completedNode.forwardIds
    : [];
  for (const targetId of forwardIds) {
    setNodeState(state, targetId, "available");
  }

  // Reveal the configured number of layers ahead of the completed layer.
  const nextLayers = Array.isArray(nextAtlas.layers) ? nextAtlas.layers : [];
  const revealOrdinal =
    layerOrdinal(completedNode.layer) +
    build.atlasData.graph.revealLookaheadLayers;
  if (revealOrdinal < nextLayers.length) {
    const revealLayerNodes = nextLayers[revealOrdinal];
    for (const nodeId of Array.isArray(revealLayerNodes)
      ? revealLayerNodes
      : []) {
      const node = nextAtlas.nodes[nodeId];
      if (node.state === "unrevealed") {
        setNodeState(state, nodeId, "revealedLocked");
      }
    }
  }

  if (logEvents) {
    logEvent("atlas_advanced", {
      completedNodeId,
      completedLayer: completedNode.layer,
      forwardTargets: forwardIds,
      revealedLayer:
        revealOrdinal < nextLayers.length
          ? (layerAtOrdinal(revealOrdinal) ?? null)
          : null,
      completionLevel,
    });
  }

  return nextAtlas;
}

/**
 * Chooses the next node a progress replay advances into after completing
 * `completedNodeId`: the topmost of that node's forward-connected successors
 * that {@link advanceAtlas} just made `available`. This mirrors the live game's
 * movement rule — the player can only enter a dreamscape their current node
 * connects forward to — so following this pick keeps the completed path a
 * connected chain. Returns `null` when the completed node has no available
 * forward successor (the boss layer, or a malformed atlas), signalling the
 * replay to stop rather than jump to an unreachable node.
 */
function pickForwardFrontierNode(
  atlas: DreamAtlas,
  completedNodeId: AtlasNodeId,
): AtlasNodeId | null {
  const node = atlas.nodes[completedNodeId];
  if (node === undefined) {
    return null;
  }
  const forwardIds = Array.isArray(node.forwardIds) ? node.forwardIds : [];
  const available = forwardIds
    .map((id) => atlas.nodes[id])
    .filter(
      (candidate): candidate is DreamscapeNode =>
        candidate !== undefined && candidate.state === "available",
    );
  if (available.length === 0) {
    return null;
  }
  // Deterministic pick: the topmost reachable successor (lowest layer ordinal,
  // then lowest column index). Ordering by the node's own layer/column — not by
  // `atlas.nodes` key iteration order — keeps the replayed route stable and
  // independent of how the node map happens to be keyed. (A persisted atlas read
  // back from Realtime Database returns its nodes in lexicographic key order,
  // e.g. `dreamscape-10` before `dreamscape-2`; a picker that trusted iteration
  // order would wander off the frontier there.)
  const [next] = [...available].sort(
    (a, b) =>
      layerOrdinal(a.layer) - layerOrdinal(b.layer) ||
      a.indexInLayer - b.indexInLayer,
  );
  return next.id;
}

/**
 * Verifies that `path` is a single connected chain: every node is a forward
 * neighbour of the one before it. The replay guarantees this by construction, so
 * a `false` here is a generation regression, not a data condition; it is
 * recorded in the completion log so a log read can confirm the invariant held.
 */
function completedPathIsConnected(
  atlas: DreamAtlas,
  path: readonly string[],
): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    const node = atlas.nodes[path[i]];
    const forwardIds = Array.isArray(node?.forwardIds) ? node.forwardIds : [];
    if (!forwardIds.includes(asAtlasNodeId(path[i + 1]))) {
      return false;
    }
  }
  return true;
}

/**
 * Rebuilds an atlas that reflects a player who has completed
 * `completedDreamscapes` dreamscapes by replaying the live progression. It
 * starts from a fresh initial atlas at
 * Completion Level 0 and applies one {@link advanceAtlas} expansion per
 * completed dreamscape — the same primitive the authoritative post-victory
 * reducer transition drives — advancing the Completion Level on each
 * step as a battle victory does (the first expansion runs at level 1). The
 * result is a brand-new layout whose progress depth — completed nodes, the
 * available frontier two layers behind the reveal edge, and the
 * `revealedLocked` nodes ahead — matches the player's place in the run, so a
 * debug "regenerate" or a `?goto=atlasN` jump picks up the latest generation
 * logic while reproducing the player's current layer experience.
 *
 * The replay obeys the same movement rule the live game enforces on the player:
 * you begin inside the starter dreamscape (the only `available` node on a fresh
 * atlas) and may only ever advance into a node your current node connects
 * *forward* to. Each completion is therefore a forward successor of the previous
 * one, so the completed nodes form a connected chain by construction. The
 * frontier is walked edge by edge from the starter — never by scanning for "some
 * available node" — so the replay cannot fabricate an impossible layout with
 * disconnected `completed` segments. If the forward frontier runs dry before the
 * requested depth (e.g. the boss layer is reached), the replay stops rather than
 * jumping to an unreachable node.
 */
export function regenerateAtlasForProgress(
  completedDreamscapes: number,
  context: SiteGenerationContext,
  build: AtlasBuildContext,
  options: AtlasGenerationOptions = {},
): DreamAtlas {
  const logEvents = options.logEvents !== false;
  let atlas = generateInitialAtlas(0, context, build, options);

  // The player always starts inside the starter dreamscape; the replay begins
  // by completing it, then follows forward edges to the next node to enter.
  let nodeToComplete: AtlasNodeId | null = atlas.startingNodeId;
  const completedPath: AtlasNodeId[] = [];
  for (let completion = 1; completion <= completedDreamscapes; completion++) {
    if (nodeToComplete === null) {
      if (logEvents) {
        logEvent("atlas_replay_frontier_exhausted", {
          requestedCompletions: completedDreamscapes,
          reachedCompletions: completion - 1,
          completedPath: [...completedPath],
        });
      }
      break;
    }
    atlas = advanceAtlas(
      atlas,
      nodeToComplete,
      completion,
      context,
      build,
      options,
    );
    completedPath.push(nodeToComplete);
    nodeToComplete = pickForwardFrontierNode(atlas, nodeToComplete);
  }

  if (logEvents) {
    logEvent("atlas_replay_completed", {
      requestedCompletions: completedDreamscapes,
      reachedCompletions: completedPath.length,
      completedPath: [...completedPath],
      // Connectivity invariant, recorded so a log read can confirm the replay
      // produced a single connected chain (each node forward-linked to the
      // next), matching what the live game guarantees.
      connected: completedPathIsConnected(atlas, completedPath),
    });
  }

  return atlas;
}

/**
 * Returns the single site to reveal on the Atlas screen for the given
 * dreamscape node. Selection rules:
 *
 * 1. If the dreamscape has an enhanced site (other than Battle or Draft),
 *    reveal it — the enhanced site is the visual signature of the dreamscape.
 * 2. Otherwise, pick deterministically from the non-Battle, non-Draft sites
 *    using a hash of the node id. The Battle and Draft sites are always kept
 *    hidden so the atlas preview never reveals them.
 *
 * Returns `null` only for nodes with no previewable sites (e.g. unrevealed).
 */
export function revealedAtlasSite(node: DreamscapeNode): SiteState | null {
  // A legacy persisted node can lack a `sites` array entirely; treat that as no
  // previewable site rather than throwing while the atlas renders.
  const sites = Array.isArray(node.sites) ? node.sites : [];
  const candidates = sites.filter(
    (s) => s.type !== "Battle" && s.type !== "Draft",
  );
  if (candidates.length === 0) {
    return null;
  }

  if (
    node.enhancedSiteType !== null &&
    node.enhancedSiteType !== "Battle" &&
    node.enhancedSiteType !== "Draft"
  ) {
    const enhanced = candidates.find(
      (s) => s.type === node.enhancedSiteType && s.isEnhanced,
    );
    if (enhanced) {
      return enhanced;
    }
  }

  const index = fnv1aHash(node.id) % candidates.length;
  return candidates[index];
}

/**
 * The set of node ids that can still lie on the player's path and should
 * therefore render on the Dream Atlas. Every other node has been left behind
 * for good and is hidden. A node is reachable iff:
 *
 * - it is `completed` — part of the traveled path behind the player, which is
 *   always shown; or
 * - it is forward-reachable from the current `available` frontier by following
 *   `forwardIds` (the available nodes themselves count as reachable).
 *
 * This hides the `forgone` siblings the player passed by in the current and
 * previous layers, and any deeper node whose every route in runs through a node
 * that has already been passed by — i.e. a future node that can no longer be
 * reached from where the player now stands. `forwardIds` only point to the next
 * layer, so a node behind the frontier can never be re-reached by the forward
 * walk; before the first choice the entire graph is reachable from the starter
 * `available` node, so nothing is hidden.
 */
export function reachableAtlasNodeIds(atlas: DreamAtlas): Set<string> {
  const reachable = new Set<string>();
  const frontier: string[] = [];
  for (const node of Object.values(atlas.nodes)) {
    // The traveled path is always kept.
    if (node.state === "completed") {
      reachable.add(node.id);
    }
    // The available frontier seeds the forward walk into still-locked layers.
    if (node.state === "available") {
      reachable.add(node.id);
      frontier.push(node.id);
    }
  }

  while (frontier.length > 0) {
    const id = frontier.pop();
    if (id === undefined) {
      continue;
    }
    const node = atlas.nodes[id];
    if (node === undefined) {
      continue;
    }
    for (const toId of node.forwardIds ?? []) {
      if (!reachable.has(toId) && atlas.nodes[toId] !== undefined) {
        reachable.add(toId);
        frontier.push(toId);
      }
    }
  }

  return reachable;
}
