import type {
  DreamAtlas,
  DreamscapeModifier,
  DreamscapeNode,
  SiteState,
  SiteType,
} from "../types/quest";
import { BIOMES, type Biome } from "../data/biomes";
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

const BASE_RADIUS = 200;
const RADIUS_INCREMENT = 160;

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

  // Late game (level 5+): add Transfiguration, Purge, Duplication
  if (completionLevel >= 5) {
    pool.push(["Transfiguration", 2]);
    pool.push(["Purge", 2]);
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
  return buildAdditionalSitePool(completionLevel, context.playerHasBanes).map(
    ([siteType]) => siteType,
  );
}

/**
 * Fixed composition for the first dreamscape of a run. The opening encounter
 * is hand-tuned for onboarding — drafts to seed the deck, a Dreamsign draft to
 * introduce the sign mechanic, a Dream Journey to teach the world-effect
 * cadence, and a Battle to close it out.
 */
const FIRST_DREAMSCAPE_SITE_TYPES: readonly SiteType[] = [
  "Draft",
  "Draft",
  "DreamsignDraft",
  "DreamJourney",
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
    });
  }

  // Additional sites from the weighted pool, clamped so total is 3-6.
  // Fixed count = drafts + battle (always 1).
  const fixedCount = sites.length + 1;
  const minAdditional = Math.max(2, 3 - fixedCount);
  const maxAdditional = Math.max(minAdditional, 6 - fixedCount);
  const pool = applySiteAppearanceBoosts(
    buildAdditionalSitePool(completionLevel, context.playerHasBanes),
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

/** Creates a single dreamscape node at the given position. */
function createNode(
  position: { x: number; y: number },
  completionLevel: number,
  isFirstDreamscape: boolean,
  connections: string[],
  context: SiteGenerationContext,
  usedBiomeNames: ReadonlySet<string>,
  options: AtlasGenerationOptions = {},
): DreamscapeNode {
  const id = nextNodeId();
  const biome = assignBiome(usedBiomeNames);
  const sites = generateSiteComposition(completionLevel, isFirstDreamscape, context);
  const enhancedSiteType = applyBiomeEnhancement(sites, biome);

  if (options.logEvents !== false) {
    logEvent("atlas_node_generated", {
      nodeId: id,
      connections,
      position: { x: position.x, y: position.y },
    });
  }

  if (options.logEvents !== false) {
    logEvent("dreamscape_generated", {
      dreamscapeId: id,
      biomeName: biome.name,
      siteTypes: sites.map((s) => s.type),
      enhancedSiteType,
      siteAppearanceBoosts: Array.from(
        combinedSiteAppearanceBoosts(context.dreamscapeModifiers),
        ([siteType, percent]) => ({ siteType, percent }),
      ),
    });
  }

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

/**
 * Creates the initial atlas with 2 starting dreamscapes. The first dreamscape
 * (the one the player is placed in) sits at the origin so the Atlas centres on
 * the player's current location and is the only initially `available` node.
 * The second dreamscape sits one base radius away at a random angle and starts
 * `unavailable`: it only becomes reachable once the starting dreamscape's
 * battle is completed.
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

  // First dreamscape: the player's starting position, placed at the origin.
  const startingNode = createNode(
    { x: 0, y: 0 },
    completionLevel,
    true,
    [],
    context,
    usedBiomeNames,
    options,
  );
  usedBiomeNames.add(startingNode.biomeName);
  nodes[startingNode.id] = startingNode;

  // Second dreamscape: placed one base radius away at a random angle. It is
  // not adjacent to any completed dreamscape yet, so it begins unavailable.
  const secondAngle = randomFloat(0, Math.PI * 2);
  const secondX = Math.cos(secondAngle) * BASE_RADIUS;
  const secondY = Math.sin(secondAngle) * BASE_RADIUS;
  const secondNode = createNode(
    { x: secondX, y: secondY },
    completionLevel,
    true,
    [startingNode.id],
    context,
    usedBiomeNames,
    options,
  );
  usedBiomeNames.add(secondNode.biomeName);
  nodes[secondNode.id] = { ...secondNode, status: "unavailable" };
  edges.push([startingNode.id, secondNode.id]);

  return { nodes, edges, startingNodeId: startingNode.id };
}

/**
 * Expands the atlas after a dreamscape's battle is completed. The completed
 * node is marked `completed`, its direct neighbours become the newly
 * `available` dreamscapes, and 1-2 new `unavailable` dreamscapes are added
 * adjacent to those newly-available nodes (never directly to the completed
 * node, so they stay unavailable until their neighbour is itself completed).
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

  const updatedNodes = { ...atlas.nodes };
  const updatedEdges = [...atlas.edges];

  // Mark the completed node
  updatedNodes[completedNodeId] = {
    ...completedNode,
    status: "completed",
  };

  // The dreamscapes directly connected to the just-completed node (and not
  // themselves completed) are the newly-available nodes. New dreamscapes are
  // attached to these, per the design document.
  const newlyAvailableIds: string[] = [];
  for (const [a, b] of updatedEdges) {
    const neighborId =
      a === completedNodeId ? b : b === completedNodeId ? a : null;
    if (neighborId === null) {
      continue;
    }
    const neighbor = updatedNodes[neighborId];
    if (
      neighbor !== undefined &&
      neighbor.status !== "completed" &&
      !newlyAvailableIds.includes(neighborId)
    ) {
      newlyAvailableIds.push(neighborId);
    }
  }

  // Fall back to the completed node only if it has no eligible neighbours, so
  // the atlas always keeps growing even at a dead end.
  const attachPointIds =
    newlyAvailableIds.length > 0 ? newlyAvailableIds : [completedNodeId];

  const newNodeCount = randomInt(1, 2);
  const usedBiomeNames = new Set<string>(
    Object.values(updatedNodes)
      .filter((node) => node.status !== "completed")
      .map((node) => node.biomeName),
  );

  for (let i = 0; i < newNodeCount; i++) {
    const attachId = attachPointIds[i % attachPointIds.length];
    const attachNode = updatedNodes[attachId];
    const attachDistance = distance(attachNode.position, { x: 0, y: 0 });
    const newRadius =
      Math.max(attachDistance, BASE_RADIUS) + RADIUS_INCREMENT;
    const attachAngle =
      attachDistance < 1
        ? randomFloat(0, Math.PI * 2)
        : Math.atan2(attachNode.position.y, attachNode.position.x);
    const angle = attachAngle + randomFloat(-0.4, 0.4);
    const x = Math.cos(angle) * newRadius;
    const y = Math.sin(angle) * newRadius;

    const connections = [attachId];

    // Connect to nearby non-completed nodes. Completed nodes are excluded so
    // the new dreamscape does not become available immediately.
    const proximityThreshold = RADIUS_INCREMENT * 1.5;
    for (const [existingId, existingNode] of Object.entries(updatedNodes)) {
      if (existingId === attachId || existingNode.status === "completed") {
        continue;
      }
      const dist = distance({ x, y }, existingNode.position);
      if (dist < proximityThreshold && !connections.includes(existingId)) {
        connections.push(existingId);
      }
    }

    const node = createNode(
      { x, y },
      completionLevel,
      false,
      connections,
      context,
      usedBiomeNames,
    );
    usedBiomeNames.add(node.biomeName);
    updatedNodes[node.id] = node;

    for (const connId of connections) {
      updatedEdges.push([connId, node.id]);
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

/** Metadata for each site type: icon, display name, and short description. */
const SITE_TYPE_META: Record<
  SiteType,
  { icon: string; name: string; description: string }
> = {
  Battle: {
    icon: "\u2694\uFE0F",
    name: "Battle",
    description: "Fight the dreamscape's keeper to clear it.",
  },
  Draft: {
    icon: "\uD83C\uDCCF",
    name: "Draft",
    description: "Pick a card from a curated offer to add to your deck.",
  },
  Shop: {
    icon: "\uD83C\uDFEA",
    name: "Shop",
    description: "Spend essence to buy cards, dreamsigns, or rerolls.",
  },
  SpecialtyShop: {
    icon: "\u2B50",
    name: "Specialty Shop",
    description: "A rare shop with a focused, themed inventory.",
  },
  DreamsignOffering: {
    icon: "\u2728",
    name: "Dreamsign Offering",
    description: "Accept a dreamsign passive, or refuse for essence.",
  },
  DreamsignDraft: {
    icon: "\u2728",
    name: "Dreamsign Draft",
    description: "Choose one dreamsign from several offered options.",
  },
  DreamJourney: {
    icon: "\uD83C\uDF19",
    name: "Dream Journey",
    description: "Pick a world-effect branch that shapes the run.",
  },
  Purge: {
    icon: "\uD83D\uDD25",
    name: "Purge",
    description: "Remove a card from your deck.",
  },
  Essence: {
    icon: "\uD83D\uDC8E",
    name: "Essence",
    description: "Collect a pile of essence.",
  },
  Transfiguration: {
    icon: "\u2697\uFE0F",
    name: "Transfiguration",
    description: "Badge a card with a colored transfiguration.",
  },
  Duplication: {
    icon: "\uD83D\uDCCB",
    name: "Duplication",
    description: "Make a copy of a card already in your deck.",
  },
  Reward: {
    icon: "\uD83C\uDF81",
    name: "Reward",
    description: "Claim a card, dreamsign, or pile of essence.",
  },
  Cleanse: {
    icon: "\u2744\uFE0F",
    name: "Cleanse",
    description: "Remove a bane from your deck.",
  },
};

/** Returns an emoji icon for the given site type. */
export function siteTypeIcon(siteType: SiteType): string {
  return SITE_TYPE_META[siteType].icon;
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
