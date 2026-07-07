// The pure view-model builder for the Tango Dream Atlas screen. Every mapping
// rule between quest domain data and `AtlasScreen`'s view types lives here as
// plain, unit-testable functions — no React, no state hooks, no effects.
// `AtlasScreenAdapter` acquires live state and calls `buildAtlasView`.
//
// The mobile atlas runs VERTICALLY and reads bottom-up: the generator lays
// nodes out with `position.x` as the layer axis (starter layer at x=0) and
// `position.y` as the within-layer spread. This builder swaps those onto screen
// axes so the layer axis climbs the portrait stage (the First Light Meadow
// starter at the bottom, ascending to the Apollyon boss at the top) and the
// within-layer spread runs horizontally.

import {
  reachableAtlasNodeIds,
  revealedAtlasSite,
  siteTypeIcon,
} from "../../atlas/atlas-generator";
import {
  BOSS_DISPLAY,
  BOSS_DREAMSCAPE_ID,
} from "../../tango/components/atlas/atlas-display";
import type { AtlasEdgeKind } from "../../tango/components/atlas/AtlasEdge";
import type {
  AtlasMapEdge,
  AtlasMapNode,
} from "../../tango/components/atlas/AtlasMap";
import type {
  AtlasDreamsignCard,
  AtlasNodeCard,
} from "../../tango/components/atlas/AtlasNodeReveal";
import { artRef } from "../../tango/primitives/art";
import { glyph } from "../../tango/primitives/glyph";
import type { AtlasHudView, AtlasView } from "../../tango/screens/AtlasScreen";
import type { QuestContent } from "../../data/quest-content";
import type { DreamAtlas, DreamscapeNode, QuestState } from "../../types/quest";
import { type LayerName, layerOrdinal } from "../../types/layer-name";
import { toQsbDreamcaller, toQsbDreamsigns } from "./dreamscape-view-model";

/** The portrait design canvas the atlas stage scales to fit (letterboxed). */
export const ATLAS_STAGE_WIDTH = 1080;
export const ATLAS_STAGE_HEIGHT = 1920;

/**
 * The platform-varying geometry of the run graph. The whole stage scales
 * uniformly to fit the viewport, so a phone (narrow) fits by width at a small
 * scale and a desktop fits at a larger one. To read well on both, the map is
 * denser and larger on mobile and airier on desktop:
 *
 * - `contentRect` is the stage-space rectangle the graph is fitted into. Its
 *   vertical span leaves room at the top for the app-shell menu button (and the
 *   boss node) and at the bottom for the persistent QuestStatusBar (and the
 *   starter node); the horizontal span is the within-layer spread — wider on
 *   desktop spreads the nodes out, tighter on mobile draws them together.
 * - `nodeSize` / `anchorNodeSize` are node diameters in stage pixels. Mobile
 *   draws larger nodes so that, once the smaller mobile fit-scale is applied,
 *   the on-screen node and its badges stay comfortably above the 48px touch
 *   floor; the starter and boss read a touch larger than a regular node.
 * - `edgeAnchorHorizontal` overrides `contentRect.left` / `.right` with
 *   device-edge-aware bounds derived from the node radius: the widest row's
 *   outermost nodes are pushed out until their outer edge sits just inside the
 *   stage edge, so the full viewport width is used and the horizontal slack
 *   lands as gaps *between* the nodes instead of as wasted side margin. The
 *   mobile atlas uses this so a full five-node row spreads across the whole
 *   phone width rather than crowding into the middle.
 */
export interface AtlasLayoutProfile {
  contentRect: { top: number; bottom: number; left: number; right: number };
  nodeSize: number;
  anchorNodeSize: number;
  edgeAnchorHorizontal?: boolean;
  /** Multiplier applied to the site / dreamsign badge sizes on top of their
   * node-relative fraction. Mobile enlarges the badges so they stay legible
   * once the narrow portrait viewport scales the whole stage down. */
  badgeScale: number;
}

/**
 * Stage-space breathing room left between an edge-anchored outermost node's
 * outer edge and the stage edge, so the node reads as anchored *to* the device
 * edge without appearing clipped by it.
 */
const EDGE_ANCHOR_INSET = 10;

/** Desktop: smaller nodes spread across a wide content rectangle. */
export const ATLAS_LAYOUT_DESKTOP: AtlasLayoutProfile = {
  contentRect: { top: 200, bottom: 1670, left: 120, right: 960 },
  nodeSize: 132,
  anchorNodeSize: 150,
  badgeScale: 1,
};

/** Mobile: larger nodes drawn together, so icons stay legible once the narrow
 * portrait viewport scales the whole stage down; the widest row is anchored to
 * the device edges so same-layer nodes get real gaps instead of touching. */
export const ATLAS_LAYOUT_MOBILE: AtlasLayoutProfile = {
  contentRect: { top: 250, bottom: 1630, left: 165, right: 915 },
  nodeSize: 200,
  anchorNodeSize: 224,
  edgeAnchorHorizontal: true,
  // Enlarge the site / dreamsign badges by half again so they read clearly on
  // the phone atlas, where the whole stage is scaled down to fit the portrait
  // viewport.
  badgeScale: 1.5,
};

/** Picks the layout profile for the viewport class. */
export function atlasLayoutProfile(isDesktop: boolean): AtlasLayoutProfile {
  return isDesktop ? ATLAS_LAYOUT_DESKTOP : ATLAS_LAYOUT_MOBILE;
}

/** The resolved stage geometry for one node, shared by its face and edges. */
interface NodeGeometry {
  left: number;
  top: number;
  size: number;
  isStarter: boolean;
  isBoss: boolean;
}

/**
 * Resolves each positioned node's stage-space centre, fitting the run graph
 * into {@link CONTENT_RECT} with the layer axis running bottom→top (starter at
 * the bottom, boss at the top) and the within-layer spread running left→right.
 */
export function resolveAtlasNodeGeometry(
  atlas: DreamAtlas,
  profile: AtlasLayoutProfile = ATLAS_LAYOUT_DESKTOP,
): Map<string, NodeGeometry> {
  const { nodeSize, anchorNodeSize } = profile;
  // Edge-aware horizontal bounds: push the widest row's outermost node centres
  // out to a node radius (plus a small inset) from the stage edge, so their
  // outer edges sit just inside the device edge and the full width is used.
  const contentRect = profile.edgeAnchorHorizontal
    ? {
        ...profile.contentRect,
        left: nodeSize / 2 + EDGE_ANCHOR_INSET,
        right: ATLAS_STAGE_WIDTH - (nodeSize / 2 + EDGE_ANCHOR_INSET),
      }
    : profile.contentRect;
  const positioned = Object.values(atlas.nodes).filter((node) =>
    Boolean(node.position),
  );
  const geometry = new Map<string, NodeGeometry>();
  if (positioned.length === 0) {
    return geometry;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of positioned) {
    minX = Math.min(minX, node.position.x);
    maxX = Math.max(maxX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxY = Math.max(maxY, node.position.y);
  }

  // Vertical (top): the layer axis (generator `position.x`) climbs bottom→top,
  // so the starter layer (min x) sits at the bottom of the stage and each
  // deeper layer rises toward the boss (max x) at the top.
  const mapVertical = (x: number): number =>
    maxX === minX
      ? (contentRect.top + contentRect.bottom) / 2
      : contentRect.bottom -
        ((x - minX) / (maxX - minX)) * (contentRect.bottom - contentRect.top);
  // Horizontal (left): the within-layer spread (generator `position.y`), centred.
  const mapHorizontal = (y: number): number =>
    maxY === minY
      ? (contentRect.left + contentRect.right) / 2
      : contentRect.left +
        ((y - minY) / (maxY - minY)) * (contentRect.right - contentRect.left);

  for (const node of positioned) {
    const isStarter = node.id === atlas.startingNodeId;
    const isBoss = node.id === atlas.bossNodeId;
    geometry.set(node.id, {
      left: mapHorizontal(node.position.y),
      top: mapVertical(node.position.x),
      size: isStarter || isBoss ? anchorNodeSize : nodeSize,
      isStarter,
      isBoss,
    });
  }

  return geometry;
}

/**
 * The layer the player is currently choosing into (the `available` frontier),
 * or null once nothing is available.
 */
export function atlasChoiceLayer(atlas: DreamAtlas): LayerName | null {
  const available = Object.values(atlas.nodes).find(
    (node) => node.state === "available",
  );
  return available?.layer ?? null;
}

/**
 * Picks an edge style from the endpoint states and how deep the edge sits
 * relative to the layer the player is currently choosing into. Every edge that
 * originates at the current layer or earlier is drawn solid; edges reaching
 * forward from deeper than the current frontier are dotted.
 */
export function atlasEdgeKind(
  from: DreamscapeNode,
  to: DreamscapeNode,
  choiceLayer: LayerName | null,
): AtlasEdgeKind {
  if (from.state === "completed" && to.state === "completed") {
    return "traveled";
  }
  if (from.state === "completed" && to.state === "available") {
    return "open";
  }
  if (choiceLayer !== null && layerOrdinal(from.layer) > layerOrdinal(choiceLayer)) {
    return "locked";
  }
  return "dim";
}

/** Builds the forward connectors, styled from the endpoint states. */
export function buildAtlasMapEdges(
  atlas: DreamAtlas,
  profile: AtlasLayoutProfile = ATLAS_LAYOUT_DESKTOP,
): AtlasMapEdge[] {
  const geometry = resolveAtlasNodeGeometry(atlas, profile);
  const choiceLayer = atlasChoiceLayer(atlas);
  // An edge touching a node the player can no longer reach is drawn dim, matching
  // the faded treatment of the unreachable node itself.
  const reachable = reachableAtlasNodeIds(atlas);
  const edges: AtlasMapEdge[] = [];
  for (const from of Object.values(atlas.nodes)) {
    const fromGeo = geometry.get(from.id);
    if (fromGeo === undefined) {
      continue;
    }
    for (const toId of from.forwardIds ?? []) {
      const to = atlas.nodes[toId];
      const toGeo = geometry.get(toId);
      if (to === undefined || toGeo === undefined) {
        continue;
      }
      const unreachable = !reachable.has(from.id) || !reachable.has(toId);
      edges.push({
        key: `${from.id}-${toId}`,
        x1: fromGeo.left,
        y1: fromGeo.top,
        x2: toGeo.left,
        y2: toGeo.top,
        kind: unreachable ? "dim" : atlasEdgeKind(from, to, choiceLayer),
      });
    }
  }
  return edges;
}

/** The compact "unseen dream" body shown for an unrevealed / unreachable node. */
const UNSEEN_DREAM_BODY =
  "This dreamscape is revealed only as you draw near. Travel onward to learn what waits here.";
/** The body shown for the starting dreamscape (a revealed dreamscape with no guide). */
const STARTER_BODY = "A quiet place where every dream quest begins.";

/** Resolves a node's pre-revealed known-dreamsign card, or null when it has none. */
function buildDreamsignCard(
  node: DreamscapeNode,
  questContent: QuestContent,
  isReachable: boolean,
): AtlasDreamsignCard | null {
  // An unreachable node hides its known-dreamsign card along with the rest of
  // its revealed content.
  if (!isReachable || node.knownDreamsignId === null) {
    return null;
  }
  const dreamsign =
    questContent.dreamsignTemplates.find((t) => t.id === node.knownDreamsignId) ??
    null;
  if (dreamsign === null) {
    return null;
  }
  return {
    name: dreamsign.name,
    art: dreamsign.imageName != null ? artRef.dreamsign(dreamsign.imageName) : null,
    rulesText: dreamsign.effectDescription,
  };
}

/**
 * Resolves the InfoCard reveal content for one node — the mobile-cut card the
 * atlas node reveals on press / hover.
 *
 * A revealed dreamscape shows its scene as a full-bleed hero image with the
 * resident guide's character render standing over it and the guide's name as
 * the headline. The boss shows Limbo's scene the same way, with Apollyon as the
 * figure. A guideless revealed place (the starter) shows the scene titled with
 * the dreamscape's own name and no figure. An unreachable / unrevealed node
 * shows the compact "unseen dream" text card. A pre-revealed known dreamsign is
 * carried as its own companion card. The labelled site / bonus / affiliation
 * rows of the legacy desktop card are cut.
 */
function buildNodeCard(
  node: DreamscapeNode,
  geo: NodeGeometry,
  questContent: QuestContent,
  atlas: DreamAtlas,
  isReachable: boolean,
): AtlasNodeCard {
  const dreamsign = buildDreamsignCard(node, questContent, isReachable);

  if (geo.isBoss) {
    const bossIncarnation =
      atlas.bossIncarnationId != null
        ? ((questContent.apollyonIncarnations ?? []).find(
            (i) => i.id === atlas.bossIncarnationId,
          ) ?? null)
        : null;
    return {
      isUnrevealed: false,
      isBoss: true,
      sceneArt: artRef.dreamscapeScene(BOSS_DREAMSCAPE_ID),
      // The boss stands over the Limbo scene as its prominent figure.
      figureArt: artRef.dreamGuide(BOSS_DISPLAY.guideId),
      eyebrow: null,
      // Title with the run's chosen Apollyon incarnation (its full name, e.g.
      // "Apollyon, the World's End"), falling back to the default epithet when
      // no incarnation was assigned.
      title: bossIncarnation?.title ?? BOSS_DISPLAY.title,
      body: bossIncarnation?.description ?? BOSS_DISPLAY.intro,
      dreamsign,
    };
  }

  // An unreachable node forgets whatever dreamscape it was revealed as, so it
  // presents the compact "unseen dream" card rather than leaking it.
  const dreamscape =
    isReachable && node.dreamscapeId !== null
      ? (questContent.dreamscapes.find((d) => d.id === node.dreamscapeId) ?? null)
      : null;

  if (node.state === "unrevealed" || !isReachable || dreamscape === null) {
    return {
      isUnrevealed: true,
      isBoss: false,
      sceneArt: null,
      figureArt: null,
      eyebrow: null,
      title: "An Unseen Dream",
      body: UNSEEN_DREAM_BODY,
      // A still-unseen dream can carry a pre-revealed known dreamsign (its badge
      // already shows on the node); pressing it reveals that dreamsign's own
      // companion card beneath the "unseen dream" text. Unreachable nodes hide
      // it — `buildDreamsignCard` already returns null for those.
      dreamsign,
    };
  }

  const guide =
    dreamscape.guideId != null
      ? (questContent.guides.find((g) => g.id === dreamscape.guideId) ?? null)
      : null;

  // Show the dreamscape scene as the full-bleed hero, with the resident guide's
  // character render standing prominently over it and the guide's name as the
  // headline. A guideless place (the starter) has no figure and titles the card
  // with the dreamscape's own name, so it never reveals as an untitled scene.
  return {
    isUnrevealed: false,
    isBoss: false,
    sceneArt: artRef.dreamscapeScene(dreamscape.id),
    figureArt: guide != null ? artRef.dreamGuide(guide.id) : null,
    eyebrow: null,
    title: guide?.name ?? dreamscape.name,
    body: guide?.homeSpecialty ?? STARTER_BODY,
    dreamsign,
  };
}

/** Builds the placed node items — faces and resolved hover cards. */
export function buildAtlasMapNodes(
  atlas: DreamAtlas,
  questContent: QuestContent,
  profile: AtlasLayoutProfile = ATLAS_LAYOUT_DESKTOP,
): AtlasMapNode[] {
  const geometry = resolveAtlasNodeGeometry(atlas, profile);
  // A node the player can no longer reach is faded and never reveals its site:
  // it renders as a dimmed, unrevealed frame regardless of what the generator
  // revealed while it was still on a possible route. `reachableAtlasNodeIds`
  // covers the passed-by siblings in the current and previous layers and any
  // deeper node cut off from the frontier.
  const reachable = reachableAtlasNodeIds(atlas);
  const items: AtlasMapNode[] = [];
  for (const node of Object.values(atlas.nodes)) {
    const geo = geometry.get(node.id);
    if (geo === undefined) {
      continue;
    }
    const isReachable = reachable.has(node.id);
    // An unreachable node forgets whatever dreamscape it was revealed as, so its
    // face falls back to the empty frame and it carries no site or dreamsign
    // badge.
    const dreamscape =
      isReachable && node.dreamscapeId !== null
        ? (questContent.dreamscapes.find((d) => d.id === node.dreamscapeId) ??
          null)
        : null;

    // The node face: the boss is always the icon; a revealed dreamscape shows
    // its circular icon; an unrevealed node shows the empty round frame.
    const iconRef =
      geo.isBoss || dreamscape === null
        ? null
        : artRef.dreamscapeIcon(dreamscape.id);

    // The signature-site badge is shown only for non-starter, non-boss revealed
    // dreamscapes.
    const revealedSite = revealedAtlasSite(node);
    const siteBadgeGlyph =
      geo.isBoss || geo.isStarter || dreamscape === null || revealedSite === null
        ? null
        : glyph(siteTypeIcon(dreamscape.signatureSite));

    const dreamsignTemplate =
      isReachable && node.knownDreamsignId !== null
        ? (questContent.dreamsignTemplates.find(
            (t) => t.id === node.knownDreamsignId,
          ) ?? null)
        : null;
    const knownDreamsignRef =
      dreamsignTemplate?.imageName != null
        ? artRef.dreamsign(dreamsignTemplate.imageName)
        : null;

    items.push({
      view: {
        node,
        left: geo.left,
        top: geo.top,
        size: geo.size,
        isStarter: geo.isStarter,
        isBoss: geo.isBoss,
        isReachable,
        iconRef,
        siteBadgeGlyph,
        knownDreamsignRef,
        badgeScale: profile.badgeScale,
      },
      card: buildNodeCard(node, geo, questContent, atlas, isReachable),
    });
  }
  return items;
}

/** The bottom-HUD slice of the atlas view-model, from live run state. */
export function buildAtlasHudView(state: QuestState): AtlasHudView {
  return {
    essence: state.essence,
    deck: state.deck.length,
    dreamcaller: toQsbDreamcaller(state.dreamcaller),
    dreamsigns: toQsbDreamsigns(state.dreamsigns),
  };
}

/**
 * The full view-model for the atlas screen: the placed nodes, their forward
 * connectors, and the persistent bottom-HUD data. Deterministic in its
 * arguments.
 */
export function buildAtlasView(
  atlas: DreamAtlas,
  questContent: QuestContent,
  state: QuestState,
  isDesktop = false,
): AtlasView {
  const profile = atlasLayoutProfile(isDesktop);
  return {
    stageWidth: ATLAS_STAGE_WIDTH,
    stageHeight: ATLAS_STAGE_HEIGHT,
    nodes: buildAtlasMapNodes(atlas, questContent, profile),
    edges: buildAtlasMapEdges(atlas, profile),
    hud: buildAtlasHudView(state),
  };
}
