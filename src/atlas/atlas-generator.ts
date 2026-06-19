import type {
  AtlasConfig,
  DreamAtlas,
  DreamscapeModifier,
  DreamscapeNode,
  SiteState,
  SiteType,
} from "../types/quest";
import type {
  ApollyonIncarnationContent,
  DreamscapeContent,
} from "../types/content";
import { otherGuideSignatureSites } from "../data/dreamscapes";
import { draftSiteData } from "../draft/draft-site-config";
import { logEvent } from "../logging";

/** Parameters for site generation that require external data. */
export interface SiteGenerationContext {
  /**
   * Active dreamscape modifiers at generation time. Site appearance boosts
   * increase the targeted site's base pool weight by their percentage; boosts
   * for the same site type stack additively before the weight is recalculated.
   */
  dreamscapeModifiers?: readonly DreamscapeModifier[];
}

/**
 * External data the 7-layer Atlas generator needs: the dreamscape definitions it
 * assigns to nodes, the generation tuning, and the run's dreamsign pool the
 * known-dreamsign placement draws from. Sourced from the compiled TOML bundles
 * (`public/{dreamscapes,atlas-config}-data.json`) and threaded through the quest
 * content so generation stays synchronous inside reducers.
 */
export interface AtlasBuildContext {
  dreamscapes: readonly DreamscapeContent[];
  atlasConfig: AtlasConfig;
  /** Dreamsign ids eligible to be granted as pre-revealed known dreamsigns. */
  dreamsignPoolIds: readonly string[];
  /**
   * Apollyon's incarnations; generation picks one to present the boss node. May
   * be empty in legacy or test contexts, in which case no incarnation is
   * assigned and the boss falls back to its default presentation.
   */
  apollyonIncarnations?: readonly ApollyonIncarnationContent[];
}

export interface AtlasGenerationOptions {
  logEvents?: boolean;
}

/** Horizontal spacing between adjacent layers in atlas-space pixels. */
const LAYER_X_SPACING = 200;
/** Vertical spacing between adjacent column slots within one layer. */
const LAYER_Y_SPACING = 140;

let nodeIdCounter = 0;
let siteIdCounter = 0;

function nextNodeId(): string {
  nodeIdCounter += 1;
  return `dreamscape-${String(nodeIdCounter)}`;
}

function nextSiteId(): string {
  siteIdCounter += 1;
  return `site-${String(siteIdCounter)}`;
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
 * Advances the internal node/site id counters past everything already present in
 * `atlas` so a mutation applied to a persisted atlas (whose generator state has
 * since reset, e.g. across a reload) never reissues an existing id.
 */
export function syncAtlasGeneratorCounters(atlas: DreamAtlas): void {
  nodeIdCounter = Math.max(nodeIdCounter, maxNodeIdSuffix(atlas));
  siteIdCounter = Math.max(siteIdCounter, maxSiteIdSuffix(atlas));
}

/** Resets internal counters. Call when starting a new quest. */
export function resetAtlasGenerator(): void {
  nodeIdCounter = 0;
  siteIdCounter = 0;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Weighted random selection from an array of [item, weight] pairs. */
function weightedPick<T>(items: Array<[T, number]>): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) {
    return items[0][0];
  }
  let roll = Math.random() * total;
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
  const u = Math.random();
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
 * Mandatory draft count for a dreamscape by its 0-indexed atlas layer. Early
 * layers seed the deck with two drafts, the middle layers offer one, and the
 * late layers offer none (the deck is built; later layers favour engine and
 * payoff sites). Layer 0 is the starter and uses its fixed site list instead.
 */
function draftCountForLayer(layer: number): number {
  if (layer <= 1) {
    return 2;
  }
  if (layer <= 3) {
    return 1;
  }
  return 0;
}

/**
 * Whether Purge is a *mandatory* site for a dreamscape at the given 0-indexed
 * atlas layer. Purge is guaranteed in the early layers so deck-thinning is
 * always available while the deck is still forming; from the later layers it is
 * not guaranteed but can still appear in the random fill. The starter (layer 0)
 * carries its own Purge in its fixed site list, so mandatory placement covers
 * 0-indexed layers 1 and 2 (the doc's layers 2 and 3).
 */
function purgeMandatoryForLayer(layer: number): boolean {
  return layer === 1 || layer === 2;
}

/**
 * Whether Dream Augury is a *mandatory* site for a dreamscape at the given
 * 0-indexed atlas layer. An Augury is guaranteed somewhere in Layer II (0-indexed
 * layer 1) so the player always meets the seer once early in the run; in other
 * layers it can still appear through the random fill. The mandatory Augury is a
 * plain fill-style site (not the enhanced signature site).
 */
function auguryMandatoryForLayer(layer: number): boolean {
  return layer === 1;
}

/**
 * The base weighted fill pool for a dreamscape whose own enhanced site is
 * `homeSite`, at the given 0-indexed atlas layer. The fill draws from the other
 * dreamscapes' signature sites plus a generic Essence site. Transfiguration and
 * Duplication — the late-game card-shaping sites — are weighted up in the later
 * layers so deck refinement shows up once the deck is built. Bane removal is
 * handled at the Purge site, which appears in the mandatory early-layer slots.
 */
function buildFillPool(
  layer: number,
  homeSite: SiteType,
  dreamscapes: readonly DreamscapeContent[],
): Array<[SiteType, number]> {
  const lateGame = layer >= 4;
  const pool: Array<[SiteType, number]> = [];

  for (const siteType of otherGuideSignatureSites(dreamscapes, homeSite)) {
    let weight = 3;
    if (siteType === "Transfiguration" || siteType === "Duplication") {
      // The card-shaping sites become more common in the later layers.
      weight = lateGame ? 5 : 1;
    }
    pool.push([siteType, weight]);
  }

  // A generic Essence site is always an eligible fill option.
  pool.push(["Essence", 3]);

  return pool;
}

/**
 * Returns the fill site types eligible for a dreamscape at the given 0-indexed
 * layer, after applying active site-removal modifiers. `homeSite` is the
 * dreamscape's own enhanced signature site, excluded from the fill so it is
 * never duplicated.
 */
export function additionalSiteTypesForLevel(
  layer: number,
  homeSite: SiteType,
  dreamscapes: readonly DreamscapeContent[],
  context: SiteGenerationContext,
): SiteType[] {
  return applySiteRemovalModifiers(
    buildFillPool(layer, homeSite, dreamscapes),
    context.dreamscapeModifiers,
  ).map(([siteType]) => siteType);
}

/** Inputs to {@link generateSiteComposition}. */
export interface SiteCompositionInput {
  /** 0-indexed atlas layer of the node (0 = starter, 6 = boss). */
  layer: number;
  /** The dreamscape assigned to the node, or `null` if none is assigned. */
  dreamscape: DreamscapeContent | null;
  /** Every dreamscape definition, used to source the fill pool. */
  dreamscapes: readonly DreamscapeContent[];
  /** Site-generation tuning (active dreamscape modifiers). */
  context: SiteGenerationContext;
  /**
   * Whether this node carries a pre-revealed known dreamsign. When true, one
   * fill slot becomes a Dreamsign Reward site granting that dreamsign on visit.
   */
  hasKnownDreamsign?: boolean;
}

/** The result of composing a dreamscape's sites. */
export interface SiteCompositionResult {
  sites: SiteState[];
  /** The signature site type marked enhanced, or `null` when none was. */
  enhancedSiteType: SiteType | null;
}

/** Builds a fresh, unvisited site of the given type. */
function makeSite(type: SiteType, isEnhanced: boolean): SiteState {
  return {
    id: nextSiteId(),
    type,
    isEnhanced,
    isVisited: false,
    ...(type === "Draft" ? { data: draftSiteData() } : {}),
  };
}

/**
 * Generates the ordered site composition for one dreamscape node, following the
 * doc's named-dreamscape rules. Total sites stay within 3-6 and the Battle is
 * always last in visit order.
 *
 * The starter dreamscape (layer 0, `isStarter`) returns its fixed site list with
 * no enhancement and no fill. Every other dreamscape is built from:
 *
 * - **Mandatory** sites: the home guide's signature site, marked enhanced; a
 *   Purge in the early layers (see {@link purgeMandatoryForLayer}); Draft sites
 *   per {@link draftCountForLayer}; and a Battle, placed last.
 * - **Fill** sites drawn from the other dreamscapes' signature sites plus
 *   Essence (see {@link buildFillPool}), sampled without replacement so every
 *   non-Draft type appears at most once. A known-dreamsign carrier consumes one
 *   fill slot with a Dreamsign Reward site.
 *
 * The composition is logged (layer, weights, chosen sites) for reconstruction.
 */
export function generateSiteComposition(
  input: SiteCompositionInput,
  logEvents = false,
): SiteCompositionResult {
  const { layer, dreamscape, dreamscapes, context, hasKnownDreamsign } = input;

  // Starter dreamscape: fixed list, no enhancement, no fill.
  if (dreamscape?.isStarter === true && dreamscape.fixedSites !== undefined) {
    const sites = dreamscape.fixedSites.map((type) => makeSite(type, false));
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
  // Types already placed, so fill never duplicates a non-Draft type.
  const usedTypes = new Set<SiteType>();
  // Non-battle sites, in visit order. Battle is appended last at the end.
  const preBattle: SiteState[] = [];

  // --- Mandatory: home guide's signature site, enhanced. ---
  let enhancedSiteType: SiteType | null = null;
  if (homeSite !== null) {
    preBattle.push(makeSite(homeSite, true));
    usedTypes.add(homeSite);
    enhancedSiteType = homeSite;
  }

  // --- Mandatory: Draft sites per the layer table. ---
  const draftCount = draftCountForLayer(layer);
  for (let i = 0; i < draftCount; i++) {
    preBattle.push(makeSite("Draft", false));
  }

  // --- Mandatory: Purge in the early layers. ---
  if (purgeMandatoryForLayer(layer) && !usedTypes.has("Purge")) {
    preBattle.push(makeSite("Purge", false));
    usedTypes.add("Purge");
  }

  // --- Mandatory: Dream Augury in Layer II. ---
  if (auguryMandatoryForLayer(layer) && !usedTypes.has("DreamAugury")) {
    preBattle.push(makeSite("DreamAugury", false));
    usedTypes.add("DreamAugury");
  }

  // --- Known-dreamsign carrier: one fill slot becomes a Dreamsign Reward. ---
  if (hasKnownDreamsign === true && !usedTypes.has("Reward")) {
    preBattle.push(makeSite("Reward", false));
    usedTypes.add("Reward");
  }

  // --- Fill from the weighted pool until total sites reach 3-6. ---
  // The total includes the trailing Battle, so the pre-battle target is 2-5.
  // `Battle` is never a guide signature site, so passing it as the excluded home
  // site keeps every guide site in the pool when the node has no dreamscape.
  const fillPool = applySiteAppearanceBoosts(
    applySiteRemovalModifiers(
      buildFillPool(layer, homeSite ?? "Battle", dreamscapes),
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
  const minPreBattle = 2;
  const maxPreBattle = 5;
  const minFill = Math.max(0, minPreBattle - preBattle.length);
  const maxFill = Math.max(minFill, maxPreBattle - preBattle.length);
  const fillCount = Math.min(randomInt(minFill, maxFill), remainingPool.length);
  const chosenFill: SiteType[] = [];
  for (let i = 0; i < fillCount && remainingPool.length > 0; i++) {
    const siteType = weightedPick(remainingPool);
    preBattle.push(makeSite(siteType, false));
    usedTypes.add(siteType);
    chosenFill.push(siteType);
    for (let index = remainingPool.length - 1; index >= 0; index -= 1) {
      if (remainingPool[index][0] === siteType) {
        remainingPool.splice(index, 1);
      }
    }
  }

  // --- Battle, always last. ---
  const sites = [...preBattle, makeSite("Battle", false)];

  if (logEvents) {
    logEvent("dreamscape_site_composition", {
      dreamscapeId: dreamscape?.id ?? null,
      layer,
      isStarter: false,
      homeSite,
      enhancedSiteType,
      draftCount,
      purgeMandatory: purgeMandatoryForLayer(layer),
      auguryMandatory: auguryMandatoryForLayer(layer),
      hasKnownDreamsign: hasKnownDreamsign === true,
      fillWeights: fillDistribution,
      fillChosen: chosenFill,
      siteTypes: sites.map((s) => s.type),
    });
  }

  return { sites, enhancedSiteType };
}

/** Default accent colour for a node before a dreamscape is assigned. */
const UNREVEALED_NODE_COLOR = "#2d2040";

/**
 * Aesthetic accent colours cycled across dreamscapes for visual variety on the
 * Atlas. The dreamscape's identity comes from its `DreamscapeContent`; this is
 * purely flavour applied at reveal time, derived deterministically from the
 * dreamscape id so a given dreamscape always renders the same colour.
 */
const ACCENT_COLORS: readonly string[] = [
  "#34d399",
  "#c084fc",
  "#f87171",
  "#38bdf8",
  "#a78bfa",
  "#2dd4bf",
  "#fb923c",
  "#22d3ee",
  "#f472b6",
  "#facc15",
];

/**
 * FNV-1a hash of a string. Used to derive deterministic per-node and
 * per-dreamscape selections (accent colour, atlas preview site).
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

/** Deterministic accent colour for a dreamscape, by its id. */
function accentColorForDreamscape(dreamscapeId: string): string {
  return ACCENT_COLORS[fnv1aHash(dreamscapeId) % ACCENT_COLORS.length];
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
  remainingDreamsignIds: string[];
  logEvents: boolean;
}

/** Rolls each layer's width from its spec. Layers 0 and 6 are always width 1. */
function rollLayerWidths(config: AtlasConfig): number[] {
  return config.layerSpecs.map((spec) => randomInt(spec.min, spec.max));
}

/** Computes the (x, y) position of a node given its layer and column slot. */
function nodePosition(
  layer: number,
  indexInLayer: number,
  layerWidth: number,
): { x: number; y: number } {
  const x = layer * LAYER_X_SPACING;
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
 * excluded explicitly in addition to the connected neighbours. After a bounded
 * number of attempts the best candidate is accepted so generation always
 * terminates.
 */
function drawDreamscapeForNode(
  state: AtlasState,
  node: DreamscapeNode,
): DreamscapeContent {
  const nonStarter = state.context.dreamscapes.filter((d) => !d.isStarter);
  const connectedIds = [...node.forwardIds, ...node.backwardIds];
  const ineligibleDreamscapeIds = new Set(
    connectedIds
      .map((id) => state.atlas.nodes[id]?.dreamscapeId)
      .filter((id): id is string => id !== null && id !== undefined),
  );

  // No two nodes in the same layer may carry the same dreamscape. Same-layer
  // siblings are not necessarily connected to one another, so exclude every
  // already-assigned same-layer dreamscape explicitly, not just connected ones.
  const sameLayerIds = state.atlas.layers[node.layer] ?? [];
  for (const siblingId of sameLayerIds) {
    if (siblingId === node.id) {
      continue;
    }
    const siblingDreamscapeId = state.atlas.nodes[siblingId]?.dreamscapeId;
    if (siblingDreamscapeId !== null && siblingDreamscapeId !== undefined) {
      ineligibleDreamscapeIds.add(siblingDreamscapeId);
    }
  }

  const MAX_ATTEMPTS = 12;
  let fallback: DreamscapeContent | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const weighted = nonStarter.map((d): [DreamscapeContent, number] => [
      d,
      state.dreamscapeWeights.get(d.id) ?? 1,
    ]);
    const candidate = weightedPick(weighted);
    fallback ??= candidate;
    if (!ineligibleDreamscapeIds.has(candidate.id)) {
      return candidate;
    }
  }
  return fallback ?? nonStarter[0];
}

/** Reduces a placed dreamscape's draw weight, keeping it strictly positive. */
function discourageRepeat(state: AtlasState, dreamscapeId: string): void {
  const strength = Math.max(
    1,
    state.context.atlasConfig.repeatDiscourageStrength,
  );
  const current = state.dreamscapeWeights.get(dreamscapeId) ?? 1;
  state.dreamscapeWeights.set(dreamscapeId, current / strength);
}

/**
 * Assigns a dreamscape to a node and builds its sites. The layer-0 node always
 * receives the starter dreamscape; the layer-6 node and every interior node draw
 * from the non-starter dreamscapes. Idempotent: a node that already carries a
 * dreamscape is returned unchanged.
 */
function revealNodeDreamscape(state: AtlasState, nodeId: string): void {
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

  const isFirstDreamscape = node.layer === 0;
  const starter = state.context.dreamscapes.find((d) => d.isStarter);
  let dreamscape: DreamscapeContent | null;
  if (isFirstDreamscape && starter !== undefined) {
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
  // per-layer. The starter (layer 0) returns its fixed list and no enhancement.
  const { sites, enhancedSiteType } = generateSiteComposition(
    {
      layer: node.layer,
      dreamscape,
      dreamscapes: state.context.dreamscapes,
      context: state.siteContext,
      hasKnownDreamsign: (node.knownDreamsignId ?? null) !== null,
    },
    state.logEvents,
  );

  state.atlas.nodes[nodeId] = {
    ...node,
    dreamscapeId: dreamscape?.id ?? null,
    biomeName: dreamscape?.name ?? "",
    biomeColor:
      dreamscape === null
        ? UNREVEALED_NODE_COLOR
        : accentColorForDreamscape(dreamscape.id),
    sites,
    enhancedSiteType,
  };

  if (state.logEvents) {
    logEvent("atlas_node_revealed", {
      nodeId,
      layer: node.layer,
      indexInLayer: node.indexInLayer,
      dreamscapeId: dreamscape?.id ?? null,
      dreamscapeName: dreamscape?.name ?? null,
      signatureSite: dreamscape?.signatureSite ?? null,
      enhancedSiteType,
      siteTypes: sites.map((s) => s.type),
      remainingWeight:
        dreamscape === null
          ? null
          : (state.dreamscapeWeights.get(dreamscape.id) ?? 1),
    });
  }
}

/** Sets a node's lifecycle state, revealing its dreamscape when it becomes visible. */
function setNodeState(
  state: AtlasState,
  nodeId: string,
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
  const cfg = state.context.atlasConfig.knownDreamsign;
  if (cfg.maxPerAtlas <= 0 || state.remainingDreamsignIds.length === 0) {
    return;
  }

  // 0-indexed eligible layers from the (1-indexed) config.
  const eligibleLayers = cfg.eligibleLayers
    .map((layer) => layer - 1)
    .filter((layer) => layer >= 0 && layer < state.atlas.layers.length);

  // Candidate nodes, biased toward earlier layers and toward the start-reveal
  // set so a known dreamsign tends to be visible from the start.
  const candidates: Array<[string, number]> = [];
  for (const layer of eligibleLayers) {
    for (const nodeId of state.atlas.layers[layer]) {
      const earlierWeight = 1 + cfg.earlyRevealBias / (layer + 1);
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
    if (Math.random() > cfg.placementProbability) {
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
    state.atlas.nodes[chosen] = { ...node, knownDreamsignId: dreamsignId };
    carriers.push(chosen);

    if (state.logEvents) {
      logEvent("atlas_known_dreamsign_placed", {
        nodeId: chosen,
        layer: node.layer,
        indexInLayer: node.indexInLayer,
        dreamsignId,
        amongStartReveal: startRevealedNodeIds.has(chosen),
      });
    }
  }

  state.atlas.knownDreamsignCarrierIds = carriers;
}

/**
 * Builds a fresh 7-layer Atlas. The starter (layer 0) is `available` so the
 * player enters it directly; the boss (layer 6) plus a bell-curve sample of
 * bonus nodes from the deepest two layers are revealed (`revealedLocked`); every
 * other node starts `unrevealed`. Dreamscapes are assigned lazily as nodes are
 * revealed, except the starter and boss which are assigned eagerly.
 */
export function generateInitialAtlas(
  completionLevel: number,
  context: SiteGenerationContext,
  build: AtlasBuildContext,
  options: AtlasGenerationOptions = {},
): DreamAtlas {
  resetAtlasGenerator();
  const logEvents = options.logEvents !== false;

  const widths = rollLayerWidths(build.atlasConfig);
  const layers: string[][] = [];
  const nodes: Record<string, DreamscapeNode> = {};

  for (let layer = 0; layer < widths.length; layer++) {
    const layerIds: string[] = [];
    for (let indexInLayer = 0; indexInLayer < widths[layer]; indexInLayer++) {
      const id = nextNodeId();
      nodes[id] = {
        id,
        layer,
        indexInLayer,
        dreamscapeId: null,
        biomeName: "",
        biomeColor: UNREVEALED_NODE_COLOR,
        sites: [],
        position: nodePosition(layer, indexInLayer, widths[layer]),
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
  for (let layer = 0; layer < layers.length - 1; layer++) {
    const fromNodes = layers[layer].map((id) => nodes[id]);
    const toNodes = layers[layer + 1].map((id) => nodes[id]);
    wireLayerConnections(
      fromNodes,
      toNodes,
      build.atlasConfig.connectionAverage,
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
      dreamscapeWeights.set(dreamscape.id, 1);
    }
  }

  const atlas: DreamAtlas = {
    layers,
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
    const cfg = build.atlasConfig;
    // Wired forward connections, the load-bearing random output of the extra-edge
    // phase. Logged both as a per-node map (forwardIds) and a flat per-gap edge
    // list ([fromLayer, fromIndex] -> [toLayer, toIndex]) so the exact graph can
    // be reconstructed from the log alone.
    const forwardIds: Record<string, string[]> = {};
    const edges: Array<{
      from: string;
      to: string;
      fromLayer: number;
      fromIndex: number;
      toLayer: number;
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
      connectionAverage: cfg.connectionAverage,
      startingNodeId,
      bossNodeId,
      // The Apollyon guise chosen for the boss node, plus the pool it was drawn
      // from, so a log read can reconstruct why this incarnation appeared.
      bossIncarnationId,
      apollyonIncarnationIds: incarnations.map((i) => i.id),
      forwardIds,
      edges,
      // Effective TOML tuning that drove every random draw, captured because the
      // production tuning is subject to change and a later log read needs to know
      // which tuning produced this atlas.
      atlasConfig: {
        repeatDiscourageStrength: cfg.repeatDiscourageStrength,
        connectionAverage: cfg.connectionAverage,
        bonusReveal: {
          min: cfg.bonusReveal.min,
          max: cfg.bonusReveal.max,
          mode: cfg.bonusReveal.mode,
        },
        knownDreamsign: {
          maxPerAtlas: cfg.knownDreamsign.maxPerAtlas,
          eligibleLayers: [...cfg.knownDreamsign.eligibleLayers],
          placementProbability: cfg.knownDreamsign.placementProbability,
          earlyRevealBias: cfg.knownDreamsign.earlyRevealBias,
        },
      },
    });
  }

  // Bonus reveals: a bell-curve count of nodes from the deepest two interior
  // layers (0-indexed 4 and 5) revealed at the start of the run.
  const bonusCount = triangularInt(
    build.atlasConfig.bonusReveal.min,
    build.atlasConfig.bonusReveal.max,
    build.atlasConfig.bonusReveal.mode,
  );
  const bonusPool: string[] = [];
  for (const layer of [4, 5]) {
    if (layer < layers.length - 1) {
      bonusPool.push(...layers[layer]);
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
  setNodeState(state, startingNodeId, "available");
  setNodeState(state, bossNodeId, "revealedLocked");
  for (const nodeId of bonusReveals) {
    setNodeState(state, nodeId, "revealedLocked");
  }

  if (logEvents) {
    logEvent("atlas_initial_reveal", {
      startingNodeId,
      bossNodeId,
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
  completedNodeId: string,
  completionLevel: number,
  context: SiteGenerationContext,
  build: AtlasBuildContext,
  options: AtlasGenerationOptions = {},
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
      dreamscapeWeights.set(dreamscape.id, 1);
    }
  }
  for (const node of Object.values(atlas.nodes)) {
    if (
      node.dreamscapeId !== null &&
      dreamscapeWeights.has(node.dreamscapeId)
    ) {
      dreamscapeWeights.set(
        node.dreamscapeId,
        (dreamscapeWeights.get(node.dreamscapeId) ?? 1) /
          Math.max(1, build.atlasConfig.repeatDiscourageStrength),
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
    currentNodeId: completedNodeId,
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

  setNodeState(state, completedNodeId, "completed");

  // A persisted atlas can arrive with empty arrays stripped (RTDB drops them on
  // write), so iterate every array field defensively rather than throwing while
  // advancing — the boss node carries `forwardIds: []` and the starting node
  // carries `backwardIds: []`, and unrevealed layers may be missing entirely.
  const atlasLayers = Array.isArray(atlas.layers) ? atlas.layers : [];
  const completedLayer = atlasLayers[completedNode.layer];
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

  // Reveal the layer two ahead of the completed layer.
  const nextLayers = Array.isArray(nextAtlas.layers) ? nextAtlas.layers : [];
  const revealLayer = completedNode.layer + 2;
  if (revealLayer < nextLayers.length) {
    const revealLayerNodes = nextLayers[revealLayer];
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
      revealedLayer: revealLayer < nextLayers.length ? revealLayer : null,
      completionLevel,
    });
  }

  return nextAtlas;
}

/**
 * Chooses which node a progress replay should complete next. Prefers an
 * `available` node, because the live game only ever lets the player enter
 * available dreamscapes; when none is available yet (the very first step off a
 * fresh atlas before any advance) it falls back to the first node that is not
 * already completed. Returns `null` only when every node is already completed.
 * Iteration order is insertion order, so the choice is deterministic for a
 * given atlas.
 */
function pickReplayCompletionNode(atlas: DreamAtlas): string | null {
  let fallback: string | null = null;
  for (const node of Object.values(atlas.nodes)) {
    if (node.state === "available") {
      return node.id;
    }
    if (node.state !== "completed" && fallback === null) {
      fallback = node.id;
    }
  }
  return fallback;
}

/**
 * Rebuilds an atlas that reflects a player who has completed
 * `completedDreamscapes` dreamscapes, by replaying the live generation
 * algorithm rather than restoring a persisted layout. It starts from a fresh
 * initial atlas at Completion Level 0 and applies one {@link advanceAtlas}
 * expansion per completed dreamscape, advancing the Completion Level on each
 * step exactly as a battle victory does (the first expansion runs at level 1,
 * matching `battle-completion-bridge`). At each step the current frontier's
 * available node is completed, so the result is a brand-new layout whose
 * progress depth — completed nodes, the available frontier two layers behind
 * the reveal edge, and the `revealedLocked` nodes ahead — matches the player's
 * place in the run. A debug "regenerate" therefore picks up the latest
 * generation logic while preserving the player's current layer experience.
 */
export function regenerateAtlasForProgress(
  completedDreamscapes: number,
  context: SiteGenerationContext,
  build: AtlasBuildContext,
  options: AtlasGenerationOptions = {},
): DreamAtlas {
  let atlas = generateInitialAtlas(0, context, build, options);
  for (let completion = 1; completion <= completedDreamscapes; completion++) {
    const nodeToComplete = pickReplayCompletionNode(atlas);
    if (nodeToComplete === null) {
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
  }
  return atlas;
}

/**
 * Boxicons class name shown for the starting dreamscape on the atlas. The start
 * gets its own flag glyph rather than a site icon because it is special: it is
 * where the player's journey begins and it never has an enhanced site.
 */
export const STARTING_DREAMSCAPE_ICON_CLASS = "bx bx-flag";

/**
 * Metadata for each site type. `icon` is a Boxicons (v3) class name following
 * the suggestions in `docs/quests/quests.md`; icons are rendered with the
 * vendored Boxicons webfont rather than emoji so they stay visually consistent
 * with the rest of the UI.
 */
const SITE_TYPE_META: Record<
  SiteType,
  {
    icon: string;
    name: string;
    description: string;
  }
> = {
  Battle: {
    icon: "bxf bx-sword-alt",
    name: "Battle",
    description: "A battle against this dream's guardian.",
  },
  Draft: {
    icon: "bxf bx-rectangle-vertical",
    name: "Draft",
    description: "Pick 5 cards to add to your deck.",
  },
  Shop: {
    icon: "bxf bx-store-alt-2",
    name: "Card Shop",
    description: "Spend essence to buy cards.",
  },
  Purge: {
    icon: "bxf bx-hot",
    name: "Purge",
    description: "Remove cards from your deck.",
  },
  Essence: {
    icon: "bxf bx-diamond-alt",
    name: "Essence",
    description: "Collect a trove of essence.",
  },
  Transfiguration: {
    icon: "fa-solid fa-hammer",
    name: "Transfiguration",
    description: "Modify and upgrade a card in your deck.",
  },
  Duplication: {
    icon: "bxf bx-copy",
    name: "Duplication",
    description: "Make a copy of a card in your deck.",
  },
  Reward: {
    icon: "bxf bx-treasure-chest",
    name: "Reward",
    description: "Claim a reward.",
  },
  DreamAugury: {
    icon: "bxf bx-eye",
    name: "Dream Augury",
    description: "Choose one of two foreseen rewards.",
  },
  DreamsignMarket: {
    icon: "bxf bx-pyramid",
    name: "Dreamsign Market",
    description: "Purchase dreamsigns from a rotating selection.",
  },
  DreamsignRevelation: {
    icon: "bxf bx-meteor",
    name: "Dreamsign Revelation",
    description: "Receive a dreamsign.",
  },
  TemptingOffer: {
    icon: "bxf bx-law",
    name: "Offer",
    description: "Pay a cost for an outsized payoff.",
  },
  Gamble: {
    icon: "bxf bx-coin",
    name: "Gamble",
    description: "Take a risk for an uncertain reward.",
  },
  TemporalFork: {
    icon: "bxf bx-clock",
    name: "Temporal Fork",
    description: "Gain a temporary bonus or future reward.",
  },
};

/**
 * The canonical list of every {@link SiteType}, derived from the single
 * `SITE_TYPE_META` source of truth. Used by the screen-router dispatch
 * completeness tests so a newly added site type is automatically exercised.
 */
export const ALL_SITE_TYPES: readonly SiteType[] = Object.keys(
  SITE_TYPE_META,
) as SiteType[];

/**
 * Neutral metadata used when a node carries a site type that is not in the
 * current {@link SITE_TYPE_META} table. A persisted save from an earlier build
 * can reference a site type string that the current build does not define; the
 * atlas and dreamscape renderers look these values up by `site.type`, so a
 * missing entry would throw while reading `.icon`/`.name`. Falling back to this
 * placeholder keeps those screens rendering a safe neutral marker instead of
 * white-screening for a player or QA loading an old save.
 */
const FALLBACK_SITE_TYPE_META = {
  icon: "bx bx-help-circle",
  name: "Unknown Site",
  description: "An unfamiliar site from an earlier dream.",
} as const;

/**
 * Resolves the metadata for `siteType`, returning a neutral placeholder for any
 * value absent from {@link SITE_TYPE_META}. The cast on the lookup is required
 * because callers may pass a legacy site-type string that is not assignable to
 * the current {@link SiteType} union.
 */
function siteTypeMeta(siteType: SiteType): {
  icon: string;
  name: string;
  description: string;
} {
  return (
    (SITE_TYPE_META as Record<string, (typeof SITE_TYPE_META)[SiteType]>)[
      siteType
    ] ?? FALLBACK_SITE_TYPE_META
  );
}

/** Returns the Boxicons class name for the given site type. */
export function siteTypeIcon(siteType: SiteType): string {
  return siteTypeMeta(siteType).icon;
}

/** Returns the display name for the given site type. */
export function siteTypeName(siteType: SiteType): string {
  return siteTypeMeta(siteType).name;
}

/** Returns a one-line description for the given site type. */
export function siteTypeDescription(siteType: SiteType): string {
  return siteTypeMeta(siteType).description;
}

/**
 * Returns the preview site types for a node tooltip.
 * Shows 2-3 non-draft, non-battle site icons.
 */
export function previewSiteTypes(node: DreamscapeNode): SiteType[] {
  const excluded: Set<SiteType> = new Set(["Battle", "Draft"]);
  // A persisted node can lack a `sites` array entirely (RTDB drops empty arrays
  // on write); treat that as no previewable sites rather than throwing while the
  // atlas renders, matching `revealedAtlasSite`.
  const sites = Array.isArray(node.sites) ? node.sites : [];
  return sites
    .filter((s) => !excluded.has(s.type))
    .map((s) => s.type)
    .slice(0, 3);
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
 * Returns a reward preview label for atlas tooltip display, or null if not a
 * reward site. Reward sites already show "Reward" as their primary label via
 * `siteTypeName`, so returning a value here would duplicate the copy. Returning
 * null leaves the subtitle absent rather than repeating the title.
 */
export function rewardPreviewLabel(_site: SiteState): string | null {
  return null;
}
