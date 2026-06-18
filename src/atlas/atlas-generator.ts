import type {
  AtlasConfig,
  DreamAtlas,
  DreamscapeModifier,
  DreamscapeNode,
  SiteState,
  SiteType,
} from "../types/quest";
import type { DreamscapeContent } from "../types/content";
import { draftSiteData } from "../draft/draft-site-config";
import { logEvent } from "../logging";

/** Parameters for site generation that require external data. */
export interface SiteGenerationContext {
  playerHasBanes: boolean;
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
    for (const site of node.sites) {
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
      removedTypes.add("SpecialtyShop");
    }

    if (modifier.kind === "remove_dreamsign_sites") {
      removedTypes.add("DreamsignOffering");
      removedTypes.add("DreamsignDraft");
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

/** Builds the weighted site pool based on completion level. */
function buildAdditionalSitePool(
  completionLevel: number,
  playerHasBanes: boolean,
): Array<[SiteType, number]> {
  const pool: Array<[SiteType, number]> = [];

  // Early game (all levels): Shop, Essence, DreamsignOffering, DreamsignDraft
  pool.push(["Shop", 3]);
  pool.push(["Essence", 3]);
  pool.push(["DreamsignOffering", 3]);
  pool.push(["DreamsignDraft", 1]);

  // Reward available at all levels
  pool.push(["Reward", 2]);

  // Cleanse only when player has banes
  if (playerHasBanes) {
    pool.push(["Cleanse", 2]);
  }

  // Mid game (level 3+): add DreamJourney
  if (completionLevel >= 3) {
    pool.push(["DreamJourney", 2]);
  }

  // Late game (level 5+): add Transfiguration, Duplication
  if (completionLevel >= 5) {
    pool.push(["Transfiguration", 2]);
    pool.push(["Duplication", 2]);
  }

  // SpecialtyShop uncommon at any level
  pool.push(["SpecialtyShop", 1]);

  return pool;
}

/** Returns the additional site types that can appear for the given context. */
export function additionalSiteTypesForLevel(
  completionLevel: number,
  context: SiteGenerationContext,
): SiteType[] {
  return applySiteRemovalModifiers(
    buildAdditionalSitePool(completionLevel, context.playerHasBanes),
    context.dreamscapeModifiers,
  ).map(([siteType]) => siteType);
}

/**
 * Fixed composition for the first dreamscape of a run. The opening encounter
 * is hand-tuned for onboarding — drafts to seed the deck, a Dreamsign draft to
 * introduce the sign mechanic, a Dream Journey to teach the world-effect
 * cadence, a Purge to introduce paid deck thinning, and a Battle to close it
 * out.
 */
const FIRST_DREAMSCAPE_SITE_TYPES: readonly SiteType[] = [
  "Draft",
  "Draft",
  "DreamsignDraft",
  "DreamJourney",
  "Purge",
  "Battle",
];

/** Generates the site composition for a dreamscape. Total: 3-6 sites. */
export function generateSiteComposition(
  completionLevel: number,
  isFirstDreamscape: boolean,
  context: SiteGenerationContext,
): SiteState[] {
  if (isFirstDreamscape) {
    return FIRST_DREAMSCAPE_SITE_TYPES.map((type) => ({
      id: nextSiteId(),
      type,
      isEnhanced: false,
      isVisited: false,
      ...(type === "Draft" ? { data: draftSiteData() } : {}),
    }));
  }

  const sites: SiteState[] = [];

  // Draft sites based on completion level
  let draftCount: number;
  if (completionLevel <= 1) {
    draftCount = 2;
  } else if (completionLevel <= 3) {
    draftCount = 1;
  } else {
    draftCount = 0;
  }
  for (let i = 0; i < draftCount; i++) {
    sites.push({
      id: nextSiteId(),
      type: "Draft",
      isEnhanced: false,
      isVisited: false,
      data: draftSiteData(),
    });
  }

  // Purge is guaranteed in every dreamscape so the player can always pay to
  // thin their deck. It is priced per visit (see src/purge/purge-pricing.ts).
  sites.push({
    id: nextSiteId(),
    type: "Purge",
    isEnhanced: false,
    isVisited: false,
  });

  // Additional sites from the weighted pool, clamped so total is 3-6.
  // Fixed count = drafts + guaranteed Purge + battle (always 1).
  const fixedCount = sites.length + 1;
  const minAdditional = Math.max(2, 3 - fixedCount);
  const maxAdditional = Math.max(minAdditional, 6 - fixedCount);
  const pool = applySiteAppearanceBoosts(
    applySiteRemovalModifiers(
      buildAdditionalSitePool(completionLevel, context.playerHasBanes),
      context.dreamscapeModifiers,
    ),
    context.dreamscapeModifiers,
  );
  // Every non-Draft site type appears at most once per dreamscape, so the
  // additional sites are sampled without replacement: a type is removed from
  // the working pool once it is picked.
  const remainingPool = [...pool];
  const additionalCount = Math.min(
    randomInt(minAdditional, maxAdditional),
    remainingPool.length,
  );
  for (let i = 0; i < additionalCount; i++) {
    if (remainingPool.length === 0) {
      break;
    }
    const siteType = weightedPick(remainingPool);
    sites.push({
      id: nextSiteId(),
      type: siteType,
      isEnhanced: false,
      isVisited: false,
    });
    for (let index = remainingPool.length - 1; index >= 0; index -= 1) {
      if (remainingPool[index][0] === siteType) {
        remainingPool.splice(index, 1);
      }
    }
  }

  // Battle site always last
  sites.push({
    id: nextSiteId(),
    type: "Battle",
    isEnhanced: false,
    isVisited: false,
  });

  return sites;
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
 * Marks the dreamscape's signature (enhanced) site type on matching sites.
 * Returns the enhanced site type if any site matched, null otherwise.
 */
function applyEnhancement(
  sites: SiteState[],
  signatureSite: SiteType,
): SiteType | null {
  let enhancedType: SiteType | null = null;
  for (let i = 0; i < sites.length; i++) {
    if (sites[i].type === signatureSite) {
      sites[i] = { ...sites[i], isEnhanced: true };
      enhancedType = signatureSite;
    }
  }
  return enhancedType;
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
  // Guarantee full coverage in case the diagonal skipped an endpoint.
  for (let s = 0; s < fromLayer.length; s++) {
    if (!edges.some(([a]) => a === s)) {
      addEdge(s, Math.min(s, toLayer.length - 1));
    }
  }
  for (let t = 0; t < toLayer.length; t++) {
    if (!edges.some(([, b]) => b === t)) {
      addEdge(Math.min(t, fromLayer.length - 1), t);
    }
  }

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
 * adjacency rejection: a draw that would place a dreamscape next to a connected
 * copy of itself is redrawn. After a bounded number of attempts the best
 * non-adjacent candidate is accepted so generation always terminates.
 */
function drawDreamscapeForNode(
  state: AtlasState,
  node: DreamscapeNode,
): DreamscapeContent {
  const nonStarter = state.context.dreamscapes.filter((d) => !d.isStarter);
  const connectedIds = [...node.forwardIds, ...node.backwardIds];
  const adjacentDreamscapeIds = new Set(
    connectedIds
      .map((id) => state.atlas.nodes[id]?.dreamscapeId)
      .filter((id): id is string => id !== null && id !== undefined),
  );

  const MAX_ATTEMPTS = 12;
  let fallback: DreamscapeContent | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const weighted = nonStarter.map(
      (d): [DreamscapeContent, number] => [
        d,
        state.dreamscapeWeights.get(d.id) ?? 1,
      ],
    );
    const candidate = weightedPick(weighted);
    fallback ??= candidate;
    if (!adjacentDreamscapeIds.has(candidate.id)) {
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
  if (node.dreamscapeId !== null) {
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

  const sites = generateSiteComposition(
    state.completionLevel,
    isFirstDreamscape,
    state.siteContext,
  );
  // The starter (layer 0) keeps every opening site standard, so no enhancement
  // is applied there.
  const enhancedSiteType =
    isFirstDreamscape || dreamscape === null
      ? null
      : applyEnhancement(sites, dreamscape.signatureSite);

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
  if (next !== "unrevealed" && node.dreamscapeId === null) {
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
    const dreamsignId = state.remainingDreamsignIds.shift();
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
    logEvent("atlas_generated", {
      layerWidths: widths,
      connectionAverage: build.atlasConfig.connectionAverage,
      startingNodeId,
      bossNodeId,
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

  const startRevealed = new Set<string>([startingNodeId, bossNodeId, ...bonusReveals]);

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
    if (node.dreamscapeId !== null && dreamscapeWeights.has(node.dreamscapeId)) {
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

  // Forgo the sibling choices in the completed node's layer.
  for (const siblingId of atlas.layers[completedNode.layer]) {
    if (siblingId === completedNodeId) {
      continue;
    }
    const sibling = nextAtlas.nodes[siblingId];
    if (sibling.state !== "completed") {
      nextAtlas.nodes[siblingId] = { ...sibling, state: "forgone" };
    }
  }

  // The completed node's forward targets become the next available choices.
  for (const targetId of completedNode.forwardIds) {
    setNodeState(state, targetId, "available");
  }

  // Reveal the layer two ahead of the completed layer.
  const revealLayer = completedNode.layer + 2;
  if (revealLayer < nextAtlas.layers.length) {
    for (const nodeId of nextAtlas.layers[revealLayer]) {
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
      forwardTargets: completedNode.forwardIds,
      revealedLayer: revealLayer < nextAtlas.layers.length ? revealLayer : null,
      completionLevel,
    });
  }

  return nextAtlas;
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
 * with the rest of the UI. `enhancedDescription` is the "what is special about
 * this dreamscape" line shown when the site is the dreamscape's enhanced site.
 */
const SITE_TYPE_META: Record<
  SiteType,
  {
    icon: string;
    name: string;
    description: string;
    enhancedDescription: string;
  }
> = {
  Battle: {
    icon: "bx bx-sword",
    name: "Battle",
    description: "Fight the dreamscape's keeper to clear it.",
    enhancedDescription: "Fight the dreamscape's keeper to clear it.",
  },
  Draft: {
    icon: "bx bx-rectangle-vertical",
    name: "Draft",
    description: "Pick a card from a curated offer to add to your deck.",
    enhancedDescription: "Pick a card from a curated offer to add to your deck.",
  },
  Shop: {
    icon: "bx bx-store",
    name: "Shop",
    description: "Spend essence to buy cards, dreamsigns, or rerolls.",
    enhancedDescription: "Enhanced shop: rerolling the inventory is free.",
  },
  SpecialtyShop: {
    icon: "bx bx-store-alt-2",
    name: "Specialty Shop",
    description: "A rare shop with a focused, themed inventory.",
    enhancedDescription: "A rare shop with a focused, themed inventory.",
  },
  DreamsignOffering: {
    icon: "bx bx-sparkles",
    name: "Dreamsign Offering",
    description: "Accept a dreamsign passive, or refuse for essence.",
    enhancedDescription:
      "Enhanced dreamsign site: a richer dreamsign draft is offered.",
  },
  DreamsignDraft: {
    icon: "bx bx-sparkles-alt",
    name: "Dreamsign Draft",
    description: "Choose one dreamsign from several offered options.",
    enhancedDescription:
      "Enhanced dreamsign site: a richer dreamsign draft is offered.",
  },
  DreamJourney: {
    icon: "bx bx-moon-star",
    name: "Dream Journey",
    description: "Pick a world-effect branch that shapes the run.",
    enhancedDescription: "Pick a world-effect branch that shapes the run.",
  },
  Purge: {
    icon: "bx bx-hot",
    name: "Purge",
    description: "Remove a card from your deck.",
    enhancedDescription:
      "Enhanced purge: every card removed this visit is 30% cheaper.",
  },
  Essence: {
    icon: "bx bx-diamond",
    name: "Essence",
    description: "Collect a pile of essence.",
    enhancedDescription: "Enhanced essence: the essence granted is doubled.",
  },
  Transfiguration: {
    icon: "bx bx-science",
    name: "Transfiguration",
    description: "Badge a card with a colored transfiguration.",
    enhancedDescription:
      "Enhanced transfiguration: you choose which card is transfigured.",
  },
  Duplication: {
    icon: "bx bx-copy",
    name: "Duplication",
    description: "Make a copy of a card already in your deck.",
    enhancedDescription:
      "Enhanced duplication: you choose which card is duplicated.",
  },
  Reward: {
    icon: "bx bx-treasure-chest",
    name: "Reward",
    description: "Claim a card, dreamsign, or pile of essence.",
    enhancedDescription: "Claim a card, dreamsign, or pile of essence.",
  },
  Cleanse: {
    icon: "bx bx-snowflake",
    name: "Cleanse",
    description: "Remove a bane from your deck.",
    enhancedDescription: "Remove a bane from your deck.",
  },
  DreamAugury: {
    icon: "bx bx-eye",
    name: "Dream Augury",
    description: "Claim a reward foreseen by the dreamscape's seer.",
    enhancedDescription:
      "Enhanced augury: bigger rewards, curated to your deck.",
  },
  DreamsignMarket: {
    icon: "bx bx-store",
    name: "Dreamsign Market",
    description: "Buy a dreamsign from a rotating selection.",
    enhancedDescription:
      "Enhanced market: restock the dreamsign choices once for free.",
  },
  DreamsignRevelation: {
    icon: "bx bx-sparkles",
    name: "Dreamsign Revelation",
    description: "Choose one dreamsign from several revealed options.",
    enhancedDescription:
      "Enhanced revelation: always a choice, with more options tailored to your deck.",
  },
  TemptingOffer: {
    icon: "bx bx-bolt-circle",
    name: "Tempting Offer",
    description: "Take a risky deal for an outsized payoff.",
    enhancedDescription:
      "Enhanced offer: choose between two competing offers.",
  },
  Gamble: {
    icon: "bx bx-coins",
    name: "Gamble",
    description: "Wager essence on an uncertain reward.",
    enhancedDescription:
      "Enhanced gamble: no initial fee, with bigger payouts.",
  },
  TemporalFork: {
    icon: "bx bx-hourglass",
    name: "Temporal Fork",
    description: "Defer a reward now to claim more of it later.",
    enhancedDescription:
      "Enhanced fork: longer duration and sooner future rewards.",
  },
};

/** Returns the Boxicons class name for the given site type. */
export function siteTypeIcon(siteType: SiteType): string {
  return SITE_TYPE_META[siteType].icon;
}

/**
 * Returns the line describing what is special about a dreamscape whose enhanced
 * site is `siteType` — used by the atlas hover tooltip. For site types with no
 * distinct enhanced behaviour this falls back to the standard description.
 */
export function enhancedSiteDescription(siteType: SiteType): string {
  return SITE_TYPE_META[siteType].enhancedDescription;
}

/** Returns the display name for the given site type. */
export function siteTypeName(siteType: SiteType): string {
  return SITE_TYPE_META[siteType].name;
}

/** Returns a one-line description for the given site type. */
export function siteTypeDescription(siteType: SiteType): string {
  return SITE_TYPE_META[siteType].description;
}

/**
 * Returns the preview site types for a node tooltip.
 * Shows 2-3 non-draft, non-battle site icons.
 */
export function previewSiteTypes(node: DreamscapeNode): SiteType[] {
  const excluded: Set<SiteType> = new Set(["Battle", "Draft"]);
  return node.sites
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
  const candidates = node.sites.filter(
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
