// Shared Dream Atlas node fixtures for the Tango docs surfaces — the `atlas-node`
// demo (one node per lifecycle state, laid out in a grid) and the `atlas-map`
// mockup (the same nodes placed into a vertical run graph on the real AtlasMap).
// Both need a representative `AtlasNodeRevealItem` (a placed `AtlasNodeView` face
// plus its resolved `AtlasNodeCard` reveal) for every lifecycle state, built the
// same way the live atlas view-model builds them — art resolves from real
// dreamscape ids through `artRef`, the boss presents Limbo / Apollyon, and the
// forgone node carries the forced-blank unreachable shape. This module owns that
// per-state construction so neither surface copies it; each consumer only decides
// where the returned items sit.
//
// The `__*__` filename keeps this helper out of the generated-metadata and
// component-doc globs — it is fixture plumbing, not a documented component.

import type { DreamscapeNode } from "../../types/quest";
import { LayerName } from "../../types/layer-name";
import {
  ATLAS_ANCHOR_NODE_SIZE_DESKTOP,
  ATLAS_ANCHOR_NODE_SIZE_MOBILE,
  ATLAS_BADGE_SCALE_MOBILE,
  ATLAS_NODE_SIZE_DESKTOP,
  ATLAS_NODE_SIZE_MOBILE,
} from "../components/atlas/atlas-display";
import type {
  AtlasNodeCard,
  AtlasNodeRevealItem,
} from "../components/atlas/AtlasNodeReveal";
import { artRef } from "../primitives/art";
import { glyph } from "../primitives/glyph";

/** Builds an atlas node in the given lifecycle state. */
export function makeNode(
  id: string,
  state: DreamscapeNode["state"],
  overrides: Partial<DreamscapeNode> = {},
): DreamscapeNode {
  return {
    id,
    layer: LayerName.One,
    indexInLayer: 0,
    dreamscapeId: "demo_dreamscape",
    biomeName: "Demo Dreamscape",
    biomeColor: "#2d2040",
    sites: [],
    position: { x: 0, y: 0 },
    state,
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
    ...overrides,
  };
}

/** The compact "unseen dream" reveal card an unrevealed / unreachable node shows. */
export function unseenCard(): AtlasNodeCard {
  return {
    isUnrevealed: true,
    isBoss: false,
    sceneArt: null,
    figureArt: null,
    title: "An Unseen Dream",
    body: "This dreamscape is revealed only as you draw near. Travel onward to learn what waits here.",
    dreamsign: null,
    placeName: null,
    guideName: null,
    siteName: null,
    affiliation: null,
    siteCard: null,
    affiliationCard: null,
  };
}

/** A revealed dreamscape's full-bleed scene reveal card. */
export function sceneCard(
  dreamscapeId: string,
  overrides: Partial<AtlasNodeCard> = {},
): AtlasNodeCard {
  return {
    isUnrevealed: false,
    isBoss: false,
    sceneArt: artRef.dreamscapeScene(dreamscapeId),
    figureArt: null,
    title: "A Revealed Dream",
    body: "A place whose shape you have already glimpsed on the road ahead.",
    dreamsign: null,
    placeName: null,
    guideName: null,
    siteName: null,
    affiliation: null,
    siteCard: null,
    affiliationCard: null,
    ...overrides,
  };
}

/** The active node-size set — production desktop or mobile. */
export interface NodeSizing {
  nodeSize: number;
  anchorNodeSize: number;
  badgeScale: number;
}

/** The production node-size set for the requested viewport class. */
export function nodeSizing(mobileSizing: boolean): NodeSizing {
  return mobileSizing
    ? {
        nodeSize: ATLAS_NODE_SIZE_MOBILE,
        anchorNodeSize: ATLAS_ANCHOR_NODE_SIZE_MOBILE,
        badgeScale: ATLAS_BADGE_SCALE_MOBILE,
      }
    : {
        nodeSize: ATLAS_NODE_SIZE_DESKTOP,
        anchorNodeSize: ATLAS_ANCHOR_NODE_SIZE_DESKTOP,
        badgeScale: 1,
      };
}

/** The lifecycle role each fixture node stands for, so consumers can place them. */
export type AtlasFixtureRole =
  | "starter"
  | "completed"
  | "available"
  | "revealedLocked"
  | "unrevealed"
  | "forgone"
  | "boss";

/** One fixture node: its lifecycle role plus the (as-yet unplaced) reveal item. */
export interface AtlasFixtureNode {
  role: AtlasFixtureRole;
  item: AtlasNodeRevealItem;
}

/**
 * The atlas fixture nodes — one per lifecycle state plus the starter / boss
 * anchors — each carrying the production node face and its resolved reveal card.
 * `view.left` / `view.top` are left at 0; each consumer places the nodes (a grid
 * for the demo, a vertical run graph for the mockup). A signature-site badge
 * glyph (Boxicons filled) is static presentation, not game data — the live atlas
 * resolves these per site type at render time.
 */
export function atlasFixtureNodes(sizing: NodeSizing): AtlasFixtureNode[] {
  const { nodeSize, anchorNodeSize, badgeScale } = sizing;
  const shopBadge = glyph("bxf bx-store-alt-2");

  return [
    {
      role: "unrevealed",
      item: {
        view: {
          node: makeNode("n-unrevealed", "unrevealed", {
            biomeName: "",
            dreamscapeId: null,
          }),
          left: 0,
          top: 0,
          size: nodeSize,
          isStarter: false,
          isBoss: false,
          isReachable: true,
          iconRef: null,
          siteBadgeGlyph: null,
          knownDreamsignRef: null,
          badgeScale,
        },
        card: unseenCard(),
      },
    },
    {
      role: "revealedLocked",
      item: {
        view: {
          node: makeNode("n-locked", "revealedLocked"),
          left: 0,
          top: 0,
          size: nodeSize,
          isStarter: false,
          isBoss: false,
          isReachable: true,
          iconRef: artRef.dreamscapeIcon("hopes_end"),
          siteBadgeGlyph: shopBadge,
          knownDreamsignRef: null,
          badgeScale,
        },
        card: sceneCard("hopes_end"),
      },
    },
    {
      role: "available",
      item: {
        view: {
          node: makeNode("n-available", "available"),
          left: 0,
          top: 0,
          size: nodeSize,
          isStarter: false,
          isBoss: false,
          isReachable: true,
          iconRef: artRef.dreamscapeIcon("frostforge"),
          siteBadgeGlyph: shopBadge,
          knownDreamsignRef: artRef.dreamsign("acorn_gold.png"),
          badgeScale,
        },
        card: sceneCard("frostforge", {
          dreamsign: {
            name: "Golden Acorn",
            art: artRef.dreamsign("acorn_gold.png"),
            rulesText: "Whenever you play a card, gain 1 essence.",
          },
        }),
      },
    },
    {
      role: "completed",
      item: {
        view: {
          node: makeNode("n-completed", "completed"),
          left: 0,
          top: 0,
          size: nodeSize,
          isStarter: false,
          isBoss: false,
          isReachable: true,
          iconRef: artRef.dreamscapeIcon("tumbleleaf_village"),
          siteBadgeGlyph: shopBadge,
          knownDreamsignRef: null,
          badgeScale,
        },
        card: sceneCard("tumbleleaf_village"),
      },
    },
    {
      // The forgone node carries the forced-blank shape `buildAtlasMapNodes`
      // produces for an unreachable node: no icon, no site badge, no known
      // dreamsign, and `isReachable: false` so it renders as the dimmed empty
      // frame beside its still-reachable siblings. Its reveal is the "unseen
      // dream" text card — it leaks nothing about the dreamscape it forwent.
      role: "forgone",
      item: {
        view: {
          node: makeNode("n-forgone", "forgone", {
            biomeName: "",
            dreamscapeId: null,
          }),
          left: 0,
          top: 0,
          size: nodeSize,
          isStarter: false,
          isBoss: false,
          isReachable: false,
          iconRef: null,
          siteBadgeGlyph: null,
          knownDreamsignRef: null,
          badgeScale,
        },
        card: unseenCard(),
      },
    },
    {
      role: "starter",
      item: {
        view: {
          node: makeNode("n-starter", "available", {
            biomeName: "Firstlight Meadow",
          }),
          left: 0,
          top: 0,
          size: anchorNodeSize,
          isStarter: true,
          isBoss: false,
          isReachable: true,
          iconRef: artRef.dreamscapeIcon("firstlight_meadow"),
          siteBadgeGlyph: null,
          knownDreamsignRef: null,
          badgeScale,
        },
        card: sceneCard("firstlight_meadow", {
          title: "Firstlight Meadow",
          body: "A quiet place where every dream quest begins.",
        }),
      },
    },
    {
      role: "boss",
      item: {
        view: {
          node: makeNode("n-boss", "revealedLocked", { biomeName: "" }),
          left: 0,
          top: 0,
          size: anchorNodeSize,
          isStarter: false,
          isBoss: true,
          isReachable: true,
          iconRef: null,
          siteBadgeGlyph: null,
          knownDreamsignRef: null,
          badgeScale,
        },
        card: {
          isUnrevealed: false,
          isBoss: true,
          sceneArt: artRef.dreamscapeScene("limbo"),
          figureArt: artRef.dreamGuide("apollyon"),
          title: "Apollyon, the Doom of Humanity",
          body: "A Dreamcaller of annihilating power — his own deck, dreamsigns, and abilities bend the dream toward ruin.",
          dreamsign: null,
          placeName: "Limbo",
          guideName: "Apollyon, the Doom of Humanity",
          siteName: null,
          affiliation: null,
          siteCard: null,
          affiliationCard: null,
        },
      },
    },
  ];
}
