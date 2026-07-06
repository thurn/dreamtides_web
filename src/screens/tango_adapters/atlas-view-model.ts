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
  revealedAtlasSite,
  siteTypeIcon,
  siteTypeName,
} from "../../atlas/atlas-generator";
import {
  dreamscapeSceneUrl,
  dreamsignIconUrl,
  guidePortraitUrl,
} from "../../tango/components/atlas/atlas-display";
import type { AtlasEdgeKind } from "../../tango/components/atlas/AtlasEdge";
import type {
  AtlasMapEdge,
  AtlasMapNode,
} from "../../tango/components/atlas/AtlasMap";
import type {
  AtlasDreamsignModel,
  AtlasPreviewModel,
} from "../../tango/components/atlas/AtlasPreview";
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
 * Stage-space rectangle the run graph is fitted into. The vertical span leaves
 * room at the top for the app-shell menu button (and the boss node that sits
 * there) and at the bottom for the persistent QuestStatusBar (and the starter
 * node); the horizontal span keeps the within-layer spread clear of the stage
 * edges.
 */
const CONTENT_RECT = { top: 210, bottom: 1660, left: 150, right: 930 };

/** Node diameter in stage pixels: the starter and boss read a touch larger. */
const NODE_SIZE = 132;
const ANCHOR_NODE_SIZE = 150;

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
): Map<string, NodeGeometry> {
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
      ? (CONTENT_RECT.top + CONTENT_RECT.bottom) / 2
      : CONTENT_RECT.bottom -
        ((x - minX) / (maxX - minX)) * (CONTENT_RECT.bottom - CONTENT_RECT.top);
  // Horizontal (left): the within-layer spread (generator `position.y`), centred.
  const mapHorizontal = (y: number): number =>
    maxY === minY
      ? (CONTENT_RECT.left + CONTENT_RECT.right) / 2
      : CONTENT_RECT.left +
        ((y - minY) / (maxY - minY)) * (CONTENT_RECT.right - CONTENT_RECT.left);

  for (const node of positioned) {
    const isStarter = node.id === atlas.startingNodeId;
    const isBoss = node.id === atlas.bossNodeId;
    geometry.set(node.id, {
      left: mapHorizontal(node.position.y),
      top: mapVertical(node.position.x),
      size: isStarter || isBoss ? ANCHOR_NODE_SIZE : NODE_SIZE,
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
export function buildAtlasMapEdges(atlas: DreamAtlas): AtlasMapEdge[] {
  const geometry = resolveAtlasNodeGeometry(atlas);
  const choiceLayer = atlasChoiceLayer(atlas);
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
      edges.push({
        key: `${from.id}-${toId}`,
        x1: fromGeo.left,
        y1: fromGeo.top,
        x2: toGeo.left,
        y2: toGeo.top,
        kind: atlasEdgeKind(from, to, choiceLayer),
      });
    }
  }
  return edges;
}

/** Resolves the hover-preview model for one node from quest content. */
function buildPreviewModel(
  node: DreamscapeNode,
  geo: NodeGeometry,
  questContent: QuestContent,
  atlas: DreamAtlas,
): AtlasPreviewModel {
  const isBoss = geo.isBoss;
  const dreamscape =
    node.dreamscapeId !== null
      ? (questContent.dreamscapes.find((d) => d.id === node.dreamscapeId) ?? null)
      : null;
  const guide =
    dreamscape?.guideId != null
      ? (questContent.guides.find((g) => g.id === dreamscape.guideId) ?? null)
      : null;
  const affiliation =
    dreamscape?.affiliationId != null
      ? (questContent.affiliations.find((a) => a.id === dreamscape.affiliationId) ??
        null)
      : null;
  const bossIncarnation =
    isBoss && atlas.bossIncarnationId != null
      ? ((questContent.apollyonIncarnations ?? []).find(
          (i) => i.id === atlas.bossIncarnationId,
        ) ?? null)
      : null;

  return {
    anchorLeft: geo.left,
    anchorTop: geo.top,
    isUnrevealed: node.state === "unrevealed" && !isBoss,
    isBoss,
    bossSubtitle: bossIncarnation?.title ?? null,
    bossDescription: bossIncarnation?.description ?? null,
    dreamscapeName: dreamscape?.name ?? null,
    sceneUrl: dreamscape !== null ? dreamscapeSceneUrl(dreamscape.id) : null,
    guideName: guide?.name ?? null,
    guidePortraitUrl: guide !== null ? guidePortraitUrl(guide.id) : null,
    siteName: dreamscape !== null ? siteTypeName(dreamscape.signatureSite) : null,
    siteIconClass:
      dreamscape !== null ? siteTypeIcon(dreamscape.signatureSite) : null,
    bonusText: guide?.homeSpecialty ?? null,
    affiliationName: affiliation?.name ?? null,
  };
}

/** Resolves the known-dreamsign card model for a node, or null when it has none. */
function buildDreamsignModel(
  node: DreamscapeNode,
  geo: NodeGeometry,
  questContent: QuestContent,
): AtlasDreamsignModel | null {
  if (node.knownDreamsignId === null) {
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
    iconUrl:
      dreamsign.imageName != null ? dreamsignIconUrl(dreamsign.imageName) : null,
    rulesText: dreamsign.effectDescription,
    anchorLeft: geo.left,
    anchorTop: geo.top,
  };
}

/** Builds the placed node items — faces and resolved hover cards. */
export function buildAtlasMapNodes(
  atlas: DreamAtlas,
  questContent: QuestContent,
): AtlasMapNode[] {
  const geometry = resolveAtlasNodeGeometry(atlas);
  const items: AtlasMapNode[] = [];
  for (const node of Object.values(atlas.nodes)) {
    const geo = geometry.get(node.id);
    if (geo === undefined) {
      continue;
    }
    const dreamscape =
      node.dreamscapeId !== null
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
      node.knownDreamsignId !== null
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
        iconRef,
        siteBadgeGlyph,
        knownDreamsignRef,
      },
      preview: buildPreviewModel(node, geo, questContent, atlas),
      dreamsign: buildDreamsignModel(node, geo, questContent),
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
): AtlasView {
  return {
    stageWidth: ATLAS_STAGE_WIDTH,
    stageHeight: ATLAS_STAGE_HEIGHT,
    nodes: buildAtlasMapNodes(atlas, questContent),
    edges: buildAtlasMapEdges(atlas),
    hud: buildAtlasHudView(state),
  };
}
