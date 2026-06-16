import type {
  DreamAtlas,
  DreamscapeModifier,
  DreamscapeNode,
  SiteState,
  SiteType,
} from "../types/quest";
import { BIOMES, type Biome } from "../data/biomes";
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

export interface AtlasGenerationOptions {
  logEvents?: boolean;
}

/** Radial distance from the origin to the starting node's direct children. */
const BASE_RADIUS = 200;
/** Radial distance added per tree level as the atlas grows outward. */
const LEVEL_SPACING = 200;
/**
 * Minimum allowed distance between any two dreamscape centres. Placement
 * searches for a free slot that keeps every node at least this far from all
 * others so the atlas never renders overlapping dreamscapes.
 */
const MIN_NODE_SEPARATION = 150;
/** Each dreamscape branches into this many forward choices. */
const CHILDREN_PER_NODE = 2;
/** Total angular spread (radians) a node's children fan across. */
const CHILD_FAN_RADIANS = 1.5;
/**
 * Bounded re-roll budget when forcing sibling dreamscapes to show distinct
 * atlas icons. A handful of attempts is always enough given the number of
 * biomes and site types.
 */
const DISTINCT_ICON_MAX_ATTEMPTS = 12;

const ORIGIN = { x: 0, y: 0 } as const;

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

function syncAtlasGeneratorCounters(atlas: DreamAtlas): void {
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

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function distance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Angle (radians) of a point measured from the origin. */
function angleFromOrigin(p: { x: number; y: number }): number {
  return Math.atan2(p.y, p.x);
}

/** Smallest distance from `pos` to any of the given occupied positions. */
function minDistanceToPositions(
  pos: { x: number; y: number },
  occupied: readonly { x: number; y: number }[],
): number {
  let min = Infinity;
  for (const q of occupied) {
    min = Math.min(min, distance(pos, q));
  }
  return min;
}

/**
 * Finds a placement near (`preferredAngle`, `preferredRadius`) that keeps the
 * new node at least {@link MIN_NODE_SEPARATION} away from every occupied
 * position. The search widens the angle and pushes the radius outward in
 * fixed steps and returns the first non-colliding slot; if every candidate
 * collides it returns the least-crowded one so generation always makes
 * progress.
 */
function findFreeSlot(
  preferredAngle: number,
  preferredRadius: number,
  occupied: readonly { x: number; y: number }[],
): { x: number; y: number } {
  const radiusOffsets = [0, 28, 56, 92, 140, 200];
  const angleOffsets = [
    0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, 1.6, -1.6, 2.1, -2.1,
  ];
  let best: { x: number; y: number } | null = null;
  let bestClearance = -Infinity;
  for (const dr of radiusOffsets) {
    for (const da of angleOffsets) {
      const radius = preferredRadius + dr;
      const angle = preferredAngle + da;
      const pos = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
      const clearance = minDistanceToPositions(pos, occupied);
      if (clearance >= MIN_NODE_SEPARATION) {
        return pos;
      }
      if (clearance > bestClearance) {
        bestClearance = clearance;
        best = pos;
      }
    }
  }
  return (
    best ?? {
      x: Math.cos(preferredAngle) * preferredRadius,
      y: Math.sin(preferredAngle) * preferredRadius,
    }
  );
}

/**
 * Evenly fans `count` child angles across {@link CHILD_FAN_RADIANS}, centred on
 * the parent's outward direction, so a node's children spread to its sides
 * rather than stacking on one bearing.
 */
function childPreferredAngles(parentAngle: number, count: number): number[] {
  if (count <= 1) {
    return [parentAngle];
  }
  const angles: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1) - 0.5;
    angles.push(parentAngle + t * CHILD_FAN_RADIANS);
  }
  return angles;
}

/** The site type the atlas would reveal for a node, or null if none. */
function revealedSiteType(node: DreamscapeNode): SiteType | null {
  return revealedAtlasSite(node)?.type ?? null;
}

/** Returns the non-completed neighbours of a node. */
function nonCompletedNeighborIds(
  nodeId: string,
  edges: ReadonlyArray<[string, string]>,
  nodes: Record<string, DreamscapeNode>,
): string[] {
  const result: string[] = [];
  for (const [a, b] of edges) {
    const other = a === nodeId ? b : b === nodeId ? a : null;
    if (other === null) {
      continue;
    }
    const neighbor = nodes[other];
    if (
      neighbor !== undefined &&
      neighbor.status !== "completed" &&
      !result.includes(other)
    ) {
      result.push(other);
    }
  }
  return result;
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

/** Randomly assigns a biome, preferring those whose names are not already in use. */
export function assignBiome(usedBiomeNames: ReadonlySet<string> = new Set()): Biome {
  const available = BIOMES.filter((biome) => !usedBiomeNames.has(biome.name));
  return pickRandom(available.length > 0 ? available : BIOMES);
}

/**
 * Marks the biome's enhanced site type on matching sites.
 * Returns the enhanced site type if found, null otherwise.
 */
function applyBiomeEnhancement(
  sites: SiteState[],
  biome: Biome,
): SiteType | null {
  let enhancedType: SiteType | null = null;
  for (let i = 0; i < sites.length; i++) {
    if (sites[i].type === biome.enhancedSiteType) {
      sites[i] = { ...sites[i], isEnhanced: true };
      enhancedType = biome.enhancedSiteType;
    }
  }
  return enhancedType;
}

/**
 * Builds a single dreamscape node at the given position without emitting any
 * log events. Pure construction is separated from logging so that the
 * distinct-icon search can discard candidate nodes without polluting the quest
 * log; the chosen node is logged afterwards via {@link logNodeGeneration}.
 */
function buildNode(
  position: { x: number; y: number },
  completionLevel: number,
  isFirstDreamscape: boolean,
  context: SiteGenerationContext,
  usedBiomeNames: ReadonlySet<string>,
): DreamscapeNode {
  const id = nextNodeId();
  const biome = assignBiome(usedBiomeNames);
  const sites = generateSiteComposition(completionLevel, isFirstDreamscape, context);
  // The first dreamscape gets a randomly assigned biome for visual variety, but
  // none of its sites are enhanced — the onboarding encounter is kept uniform so
  // the opening Purge (and every other opening site) is always standard.
  const enhancedSiteType = isFirstDreamscape
    ? null
    : applyBiomeEnhancement(sites, biome);

  return {
    id,
    biomeName: biome.name,
    biomeColor: biome.color,
    sites,
    position,
    status: "available",
    enhancedSiteType,
  };
}

/** Emits the generation log events for a freshly created dreamscape node. */
function logNodeGeneration(
  node: DreamscapeNode,
  connections: string[],
  context: SiteGenerationContext,
): void {
  logEvent("atlas_node_generated", {
    nodeId: node.id,
    connections,
    position: { x: node.position.x, y: node.position.y },
  });

  logEvent("dreamscape_generated", {
    dreamscapeId: node.id,
    biomeName: node.biomeName,
    siteTypes: node.sites.map((s) => s.type),
    enhancedSiteType: node.enhancedSiteType,
    siteAppearanceBoosts: Array.from(
      combinedSiteAppearanceBoosts(context.dreamscapeModifiers),
      ([siteType, percent]) => ({ siteType, percent }),
    ),
    removedSiteTypes: Array.from(
      removedSiteTypesFromModifiers(context.dreamscapeModifiers),
    ),
  });
}

/**
 * Creates `count` child dreamscapes branching off `parent`. Children are fanned
 * around the parent's outward direction, each placed in a collision-free slot
 * (see {@link findFreeSlot}) so dreamscapes never overlap, and each is forced
 * to reveal a different atlas icon from its siblings so the player's choices are
 * visually distinct. Returns the new nodes (status `available`; callers set the
 * appropriate status) and the edges connecting them to `parent`.
 *
 * `occupiedPositions` and `usedBiomeNames` are mutated in place so that
 * successive batches stay non-overlapping and keep their biomes varied.
 */
function createChildNodes(
  parent: DreamscapeNode,
  count: number,
  completionLevel: number,
  context: SiteGenerationContext,
  occupiedPositions: Array<{ x: number; y: number }>,
  usedBiomeNames: Set<string>,
  options: AtlasGenerationOptions,
): { nodes: DreamscapeNode[]; edges: Array<[string, string]> } {
  const parentDistance = distance(parent.position, ORIGIN);
  const parentAngle =
    parentDistance < 1
      ? randomFloat(0, Math.PI * 2)
      : angleFromOrigin(parent.position);
  const childRadius = Math.max(parentDistance + LEVEL_SPACING, BASE_RADIUS);
  const angles = childPreferredAngles(parentAngle, count);

  const nodes: DreamscapeNode[] = [];
  const edges: Array<[string, string]> = [];
  const siblingRevealedTypes = new Set<SiteType>();

  for (let i = 0; i < count; i++) {
    const position = findFreeSlot(angles[i], childRadius, occupiedPositions);

    // Roll a node whose revealed atlas icon differs from its siblings. Re-rolls
    // also exclude the biomes already tried so the search converges quickly.
    let node = buildNode(position, completionLevel, false, context, usedBiomeNames);
    const triedBiomes = new Set<string>([node.biomeName]);
    let attempts = 0;
    while (attempts < DISTINCT_ICON_MAX_ATTEMPTS) {
      const revealed = revealedSiteType(node);
      if (revealed === null || !siblingRevealedTypes.has(revealed)) {
        break;
      }
      node = buildNode(position, completionLevel, false, context, new Set([
        ...usedBiomeNames,
        ...triedBiomes,
      ]));
      triedBiomes.add(node.biomeName);
      attempts += 1;
    }

    const revealed = revealedSiteType(node);
    if (revealed !== null) {
      siblingRevealedTypes.add(revealed);
    }
    usedBiomeNames.add(node.biomeName);
    occupiedPositions.push(position);
    nodes.push(node);
    edges.push([parent.id, node.id]);

    if (options.logEvents !== false) {
      logNodeGeneration(node, [parent.id], context);
    }
  }

  return { nodes, edges };
}

/**
 * Creates the initial atlas as a two-deep binary tree rooted at the starting
 * dreamscape. The starting dreamscape (the one the player is placed in) sits at
 * the origin so the Atlas centres on the player's current location and is the
 * only initially `available` node. It branches into {@link CHILDREN_PER_NODE}
 * direct children — the two choices the player faces once they clear the
 * starting dreamscape — and each child in turn branches into
 * {@link CHILDREN_PER_NODE} grandchildren, so the player can already see where
 * each first choice leads. Every node but the start begins `unavailable`; the
 * children become reachable only after the starting dreamscape's battle is
 * completed.
 *
 * All nodes are placed in collision-free slots, and the two child dreamscapes
 * are guaranteed to reveal different atlas icons so the opening choice always
 * looks distinct.
 */
export function generateInitialAtlas(
  completionLevel: number,
  context: SiteGenerationContext,
  options: AtlasGenerationOptions = {},
): DreamAtlas {
  resetAtlasGenerator();

  const nodes: Record<string, DreamscapeNode> = {};
  const edges: Array<[string, string]> = [];
  const usedBiomeNames = new Set<string>();
  const occupiedPositions: Array<{ x: number; y: number }> = [];

  // Starting dreamscape: the player's starting position, placed at the origin.
  const startingNode = buildNode(
    { x: 0, y: 0 },
    completionLevel,
    true,
    context,
    usedBiomeNames,
  );
  usedBiomeNames.add(startingNode.biomeName);
  occupiedPositions.push(startingNode.position);
  nodes[startingNode.id] = startingNode;
  if (options.logEvents !== false) {
    logNodeGeneration(startingNode, [], context);
  }

  // Two direct children: the choices revealed when the start is completed.
  const children = createChildNodes(
    startingNode,
    CHILDREN_PER_NODE,
    completionLevel,
    context,
    occupiedPositions,
    usedBiomeNames,
    options,
  );
  for (const child of children.nodes) {
    nodes[child.id] = { ...child, status: "unavailable" };
  }
  for (const edge of children.edges) {
    edges.push(edge);
  }

  // Two grandchildren per child: where each first choice leads.
  for (const child of children.nodes) {
    const grandchildren = createChildNodes(
      child,
      CHILDREN_PER_NODE,
      completionLevel,
      context,
      occupiedPositions,
      usedBiomeNames,
      options,
    );
    for (const grandchild of grandchildren.nodes) {
      nodes[grandchild.id] = { ...grandchild, status: "unavailable" };
    }
    for (const edge of grandchildren.edges) {
      edges.push(edge);
    }
  }

  return { nodes, edges, startingNodeId: startingNode.id };
}

/**
 * Expands the atlas after a dreamscape's battle is completed. The completed
 * node is marked `completed` and its direct neighbours become the newly
 * `available` choices. To preserve the two-deep look-ahead, every newly
 * available dreamscape is topped up with forward children until it leads to
 * {@link CHILDREN_PER_NODE} onward dreamscapes — so a dreamscape created with no
 * children of its own (deeper in the tree) sprouts its two onward branches the
 * moment it becomes a live choice, while the initial children, which already
 * carry their grandchildren, generate nothing new. New dreamscapes attach only
 * to the newly-available nodes, never to the completed node, so they stay
 * `unavailable` until their own parent is completed.
 */
export function generateNewNodes(
  atlas: DreamAtlas,
  completedNodeId: string,
  completionLevel: number,
  context: SiteGenerationContext,
): DreamAtlas {
  const completedNode = atlas.nodes[completedNodeId];
  if (!completedNode) {
    return atlas;
  }

  syncAtlasGeneratorCounters(atlas);

  const updatedNodes = { ...atlas.nodes };
  const updatedEdges = [...atlas.edges];

  // Mark the completed node.
  updatedNodes[completedNodeId] = {
    ...completedNode,
    status: "completed",
  };

  // The dreamscapes directly connected to the just-completed node (and not
  // themselves completed) are the newly-available choices.
  const newlyAvailableIds = nonCompletedNeighborIds(
    completedNodeId,
    updatedEdges,
    updatedNodes,
  );

  const occupiedPositions = Object.values(updatedNodes).map(
    (node) => node.position,
  );
  const usedBiomeNames = new Set<string>(
    Object.values(updatedNodes)
      .filter((node) => node.status !== "completed")
      .map((node) => node.biomeName),
  );

  // Top each newly-available dreamscape up to CHILDREN_PER_NODE forward
  // branches so the player always sees where every live choice leads.
  for (const availableId of newlyAvailableIds) {
    const availableNode = updatedNodes[availableId];
    const existingForwardCount = nonCompletedNeighborIds(
      availableId,
      updatedEdges,
      updatedNodes,
    ).length;
    const needed = CHILDREN_PER_NODE - existingForwardCount;
    if (needed <= 0) {
      continue;
    }
    const batch = createChildNodes(
      availableNode,
      needed,
      completionLevel,
      context,
      occupiedPositions,
      usedBiomeNames,
      {},
    );
    for (const child of batch.nodes) {
      updatedNodes[child.id] = { ...child, status: "unavailable" };
    }
    for (const edge of batch.edges) {
      updatedEdges.push(edge);
    }
  }

  // Update availability: a node is available iff it is directly connected to
  // any completed node.
  const completedIds = new Set(
    Object.values(updatedNodes)
      .filter((n) => n.status === "completed")
      .map((n) => n.id),
  );

  for (const [nodeId, node] of Object.entries(updatedNodes)) {
    if (node.status === "completed") continue;
    const isConnectedToCompleted = updatedEdges.some(
      ([a, b]) =>
        (a === nodeId && completedIds.has(b)) ||
        (b === nodeId && completedIds.has(a)),
    );
    updatedNodes[nodeId] = {
      ...node,
      status: isConnectedToCompleted ? "available" : "unavailable",
    };
  }

  return {
    nodes: updatedNodes,
    edges: updatedEdges,
    startingNodeId: atlas.startingNodeId,
  };
}

/**
 * Chooses which node a progress replay should complete next. Prefers an
 * `available` node (the live game only ever lets the player enter available
 * dreamscapes); if none is available yet it falls back to the first
 * not-yet-completed node so the replay can still advance from the initial
 * atlas's lone available start. Returns `null` only when every node is already
 * completed. Iteration order is insertion order, so the choice is deterministic
 * for a given atlas.
 */
function pickReplayCompletionNode(atlas: DreamAtlas): string | null {
  let fallback: string | null = null;
  for (const node of Object.values(atlas.nodes)) {
    if (node.status === "available") {
      return node.id;
    }
    if (node.status !== "completed" && fallback === null) {
      fallback = node.id;
    }
  }
  return fallback;
}

/**
 * Rebuilds an atlas that reflects a player who has completed
 * `completedDreamscapes` dreamscapes, by replaying the live generation
 * algorithm rather than restoring a persisted layout. It starts from a fresh
 * initial atlas at Completion Level 0 and applies one expansion per completed
 * dreamscape, advancing the Completion Level on each step exactly as a battle
 * victory does (the first expansion runs at level 1, matching
 * `battle-completion-bridge`). The result is a brand-new layout whose progress
 * depth matches the player's place in the run, so a debug "regenerate" picks up
 * the latest generation logic — including node placement and expansion shape —
 * without resetting the player to an empty quest.
 */
export function regenerateAtlasForProgress(
  completedDreamscapes: number,
  context: SiteGenerationContext,
  options: AtlasGenerationOptions = {},
): DreamAtlas {
  let atlas = generateInitialAtlas(0, context, options);
  for (let completion = 1; completion <= completedDreamscapes; completion++) {
    const nodeToComplete = pickReplayCompletionNode(atlas);
    if (nodeToComplete === null) {
      break;
    }
    atlas = generateNewNodes(atlas, nodeToComplete, completion, context);
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
};

/** Returns the Boxicons class name for the given site type. */
export function siteTypeIcon(siteType: SiteType): string {
  return SITE_TYPE_META[siteType].icon;
}

/**
 * Returns the line describing what is special about a dreamscape whose enhanced
 * site is `siteType` \u2014 used by the atlas hover tooltip. For site types with no
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
  const excluded: Set<SiteType> = new Set([
    "Battle",
    "Draft",
  ]);
  return node.sites
    .filter((s) => !excluded.has(s.type))
    .map((s) => s.type)
    .slice(0, 3);
}

/**
 * FNV-1a hash of a string. Used to derive deterministic per-node random
 * selections on the Atlas (so the same dreamscape reveals the same site
 * across reloads).
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
 * Returns the single site to reveal on the Atlas screen for the given
 * dreamscape node. Selection rules:
 *
 * 1. If the dreamscape has a biome-enhanced site (other than Battle or Draft),
 *    reveal it — the enhanced site is the visual signature of the biome.
 * 2. Otherwise, pick deterministically from the non-Battle, non-Draft sites
 *    using a hash of the node id. The Battle and Draft sites are always kept
 *    hidden so the atlas preview never reveals them.
 *
 * Returns `null` only for nodes with no previewable sites.
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
 * reward site. FIND-01-7: Reward sites already show "Reward" as their primary
 * label via `siteTypeName`, so returning "Reward" here duplicated the copy.
 * Return null instead — the absence of a subtitle is preferable to repeating
 * the title.
 */
export function rewardPreviewLabel(_site: SiteState): string | null {
  return null;
}
