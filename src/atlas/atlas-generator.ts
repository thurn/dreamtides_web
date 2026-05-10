import type {
  DreamAtlas,
  DreamscapeNode,
  SiteState,
  SiteType,
} from "../types/quest";
import { BIOMES, type Biome } from "../data/biomes";
import { logEvent } from "../logging";

/** Parameters for site generation that require external data. */
export interface SiteGenerationContext {
  playerHasBanes: boolean;
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

  // Mid game (level 3+): add DreamJourney, TemptingOffer
  if (completionLevel >= 3) {
    pool.push(["DreamJourney", 2]);
    pool.push(["TemptingOffer", 2]);
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
  const pool = buildAdditionalSitePool(completionLevel, context.playerHasBanes);
  const additionalCount = randomInt(minAdditional, maxAdditional);
  for (let i = 0; i < additionalCount; i++) {
    const siteType = weightedPick(pool);
    sites.push({
      id: nextSiteId(),
      type: siteType,
      isEnhanced: false,
      isVisited: false,
    });
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

/** Creates the initial atlas with the Nexus and 2-3 starting dreamscapes. */
export function generateInitialAtlas(
  completionLevel: number,
  context: SiteGenerationContext,
  options: AtlasGenerationOptions = {},
): DreamAtlas {
  resetAtlasGenerator();

  const nexusId = "nexus";
  const nodes: Record<string, DreamscapeNode> = {};
  const edges: Array<[string, string]> = [];

  // Nexus at center
  nodes[nexusId] = {
    id: nexusId,
    biomeName: "Nexus",
    biomeColor: "#7c3aed",
    sites: [],
    position: { x: 0, y: 0 },
    status: "completed",
    enhancedSiteType: null,
  };

  const nodeCount = 2;
  const baseAngle = randomFloat(0, Math.PI * 2);

  const usedBiomeNames = new Set<string>();
  for (let i = 0; i < nodeCount; i++) {
    const angle =
      baseAngle +
      (i * Math.PI * 2) / nodeCount +
      randomFloat(-0.3, 0.3);
    const x = Math.cos(angle) * BASE_RADIUS;
    const y = Math.sin(angle) * BASE_RADIUS;

    const node = createNode(
      { x, y },
      completionLevel,
      true,
      [nexusId],
      context,
      usedBiomeNames,
      options,
    );
    usedBiomeNames.add(node.biomeName);
    nodes[node.id] = node;
    edges.push([nexusId, node.id]);
  }

  return { nodes, edges, nexusId };
}

/**
 * Generates 2-4 new nodes after completing a dreamscape.
 * New nodes connect to the completed node and any geometrically
 * nearby existing nodes (within 1.5x the radius increment).
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

  // Determine the generation ring (how many levels deep)
  const completedDistance = distance(
    completedNode.position,
    { x: 0, y: 0 },
  );
  const newRadius = completedDistance + RADIUS_INCREMENT;

  // Angle from center to the completed node
  const parentAngle = Math.atan2(
    completedNode.position.y,
    completedNode.position.x,
  );

  const isFirstExpansion = completedDistance <= BASE_RADIUS + 1;
  const newNodeCount = isFirstExpansion ? 1 : randomInt(2, 3);
  const spread = Math.PI / 3; // 60-degree spread for children
  const usedBiomeNames = new Set<string>(
    Object.values(updatedNodes)
      .filter((node) => node.id !== atlas.nexusId && node.status !== "completed")
      .map((node) => node.biomeName),
  );

  for (let i = 0; i < newNodeCount; i++) {
    const angleOffset =
      ((i - (newNodeCount - 1) / 2) * spread) / Math.max(newNodeCount - 1, 1);
    const angle = parentAngle + angleOffset + randomFloat(-0.15, 0.15);
    const x = Math.cos(angle) * newRadius;
    const y = Math.sin(angle) * newRadius;

    const connections = [completedNodeId];

    // Connect to nearby existing nodes
    const proximityThreshold = RADIUS_INCREMENT * 1.5;
    for (const [existingId, existingNode] of Object.entries(updatedNodes)) {
      if (existingId === completedNodeId) continue;
      if (existingId === atlas.nexusId) continue;
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

  // Update availability: a node is available if connected to nexus or any completed node
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
    nexusId: atlas.nexusId,
  };
}

/** Metadata for each site type: icon and display name in one table. */
const SITE_TYPE_META: Record<SiteType, { icon: string; name: string }> = {
  Battle: { icon: "\u2694\uFE0F", name: "Battle" },
  Draft: { icon: "\uD83C\uDCCF", name: "Draft" },
  Shop: { icon: "\uD83C\uDFEA", name: "Shop" },
  SpecialtyShop: { icon: "\u2B50", name: "Specialty Shop" },
  DreamsignOffering: { icon: "\u2728", name: "Dreamsign Offering" },
  DreamsignDraft: { icon: "\u2728", name: "Dreamsign Draft" },
  DreamJourney: { icon: "\uD83C\uDF19", name: "Dream Journey" },
  TemptingOffer: { icon: "\u2696\uFE0F", name: "Tempting Offer" },
  Purge: { icon: "\uD83D\uDD25", name: "Purge" },
  Essence: { icon: "\uD83D\uDC8E", name: "Essence" },
  Transfiguration: { icon: "\u2697\uFE0F", name: "Transfiguration" },
  Duplication: { icon: "\uD83D\uDCCB", name: "Duplication" },
  Reward: { icon: "\uD83C\uDF81", name: "Reward" },
  Cleanse: { icon: "\u2744\uFE0F", name: "Cleanse" },
};

/** Returns an emoji icon for the given site type. */
export function siteTypeIcon(siteType: SiteType): string {
  return SITE_TYPE_META[siteType].icon;
}

/** Returns the display name for the given site type. */
export function siteTypeName(siteType: SiteType): string {
  return SITE_TYPE_META[siteType].name;
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
 * Returns a reward preview label for atlas tooltip display, or null if not a
 * reward site. FIND-01-7: Reward sites already show "Reward" as their primary
 * label via `siteTypeName`, so returning "Reward" here duplicated the copy.
 * Return null instead — the absence of a subtitle is preferable to repeating
 * the title.
 */
export function rewardPreviewLabel(_site: SiteState): string | null {
  return null;
}
