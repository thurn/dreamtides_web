// The pure view-model builder for the Cumulus Dream Atlas screen. Every mapping
// rule between journey domain data and `AtlasScreen`'s view types lives here as
// plain, unit-testable functions — no React, no state hooks, no effects.
// `AtlasScreenAdapter` acquires live state and calls `buildAtlasView`.
//
// The atlas reads along its layer axis toward the boss. The generator lays nodes
// out with `position.x` as the layer axis (starter layer at x=0) and `position.y`
// as the within-layer spread; this builder maps those onto screen axes per the
// active orientation:
//
// - Mobile is PORTRAIT and reads bottom-up: the layer axis climbs the stage (the
//   First Light Meadow starter at the bottom, ascending to the Apollyon boss at
//   the top) and the within-layer spread runs horizontally.
// - Desktop is LANDSCAPE and reads left-to-right: the layer axis crosses the
//   stage (the starter at the left, advancing to the boss at the right) and the
//   within-layer spread runs vertically.

import {
  reachableAtlasNodeIds,
  revealedAtlasSite,
  siteTypeDescription,
  siteTypeIcon,
  siteTypeName,
} from "../../atlas/atlas-generator";
import {
  ATLAS_ANCHOR_NODE_SIZE_DESKTOP,
  ATLAS_ANCHOR_NODE_SIZE_MOBILE,
  ATLAS_BADGE_SCALE_MOBILE,
  ATLAS_NODE_SIZE_DESKTOP,
  ATLAS_NODE_SIZE_MOBILE,
  ATLAS_STAGE_HEIGHT,
  ATLAS_STAGE_WIDTH,
  BOSS_DISPLAY,
  BOSS_DREAMSCAPE_ID,
} from "../../cumulus/components/atlas/atlas-display";
import type { AtlasEdgeKind } from "../../cumulus/components/atlas/AtlasEdge";
import type {
  AtlasMapEdge,
  AtlasMapNode,
} from "../../cumulus/components/atlas/AtlasMap";
import type {
  AtlasNodeAffiliation,
  AtlasNodeDreamsign,
  AtlasNodePrimary,
  AtlasNodeSite,
} from "../../cumulus/components/atlas/AtlasNode";
import { artRef } from "../../cumulus/primitives/art";
import { glyph } from "../../cumulus/primitives/glyph";
import type { AtlasView } from "../../cumulus/screens/AtlasScreen";
import type { JourneyContent } from "../../data/journey-content";
import { tutorialSpeechBubbleDelaySeconds } from "../../data/tutorial-speech-bubble";
import type {
  DreamAtlas,
  DreamscapeNode,
  JourneyState,
} from "../../types/journey";
import type { TutorialAtlasConfiguration } from "../../types/tutorial";
import { type LayerName, layerOrdinal } from "../../types/layer-name";

/**
 * The portrait design canvas the mobile atlas stage scales to fit (letterboxed).
 * Homed in-Cumulus (`atlas-display.ts`) so the adapter and the Cumulus atlas mockup
 * share one source of truth; re-exported here for the atlas consumers.
 */
export { ATLAS_STAGE_HEIGHT, ATLAS_STAGE_WIDTH };

/** The landscape design canvas the desktop atlas stage scales to fit (letterboxed). */
export const ATLAS_STAGE_LANDSCAPE_WIDTH = 1920;
export const ATLAS_STAGE_LANDSCAPE_HEIGHT = 1080;

/**
 * The platform-varying geometry of the run graph. The whole stage scales
 * uniformly to fit the viewport, so a phone (narrow) fits by width at a small
 * scale and a desktop fits at a larger one. To read well on both, the map is
 * denser and larger on mobile and airier on desktop:
 *
 * - `orientation` selects which screen axis the layer axis runs along:
 *   `portrait` climbs it bottom→top (mobile), `landscape` crosses it left→right
 *   (desktop).
 * - `stageWidth` / `stageHeight` are the design canvas the whole stage scales to
 *   fit: portrait on mobile, landscape on desktop.
 * - `contentRect` is the stage-space rectangle the graph is fitted into. On
 *   portrait its vertical span is the layer axis and leaves room at the top for
 *   the boss node and at the bottom for the persistent JourneyStatusBar and the
 *   starter node, while its horizontal span is the within-layer spread. On
 *   landscape the axes swap: the horizontal span is the layer axis (starter left,
 *   boss right) and the vertical span is the within-layer spread, kept clear of
 *   the docked JourneyStatusBar along the bottom.
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
  /** Which screen axis the layer (starter→boss) axis runs along. */
  orientation: "portrait" | "landscape";
  /** The design canvas the whole stage scales to fit (letterboxed). */
  stageWidth: number;
  stageHeight: number;
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

/** Desktop: a landscape stage read left-to-right, with smaller nodes spread
 * across a wide content rectangle. The layer axis crosses the stage (starter at
 * the left, boss at the right); the within-layer spread fans vertically and is
 * kept clear of the docked grand JourneyStatusBar along the bottom and the
 * top-right gear button. */
export const ATLAS_LAYOUT_DESKTOP: AtlasLayoutProfile = {
  orientation: "landscape",
  stageWidth: ATLAS_STAGE_LANDSCAPE_WIDTH,
  stageHeight: ATLAS_STAGE_LANDSCAPE_HEIGHT,
  contentRect: { top: 150, bottom: 900, left: 160, right: 1760 },
  nodeSize: ATLAS_NODE_SIZE_DESKTOP,
  anchorNodeSize: ATLAS_ANCHOR_NODE_SIZE_DESKTOP,
  badgeScale: 1,
};

/** Mobile: a portrait stage read bottom-up, with larger nodes drawn together so
 * icons stay legible once the narrow portrait viewport scales the whole stage
 * down; the widest row is anchored to the device edges so same-layer nodes get
 * real gaps instead of touching. */
export const ATLAS_LAYOUT_MOBILE: AtlasLayoutProfile = {
  orientation: "portrait",
  stageWidth: ATLAS_STAGE_WIDTH,
  stageHeight: ATLAS_STAGE_HEIGHT,
  contentRect: { top: 250, bottom: 1630, left: 165, right: 915 },
  nodeSize: ATLAS_NODE_SIZE_MOBILE,
  anchorNodeSize: ATLAS_ANCHOR_NODE_SIZE_MOBILE,
  edgeAnchorHorizontal: true,
  // Enlarge the site / dreamsign badges by half again so they read clearly on
  // the phone atlas, where the whole stage is scaled down to fit the portrait
  // viewport.
  badgeScale: ATLAS_BADGE_SCALE_MOBILE,
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
 * Resolves each positioned node's stage-space centre, fitting the run graph into
 * the profile's `contentRect`. On a portrait profile the layer axis runs
 * bottom→top (starter at the bottom, boss at the top) and the within-layer
 * spread runs left→right; on a landscape profile the layer axis runs left→right
 * (starter at the left, boss at the right) and the spread runs top→bottom.
 */
export function resolveAtlasNodeGeometry(
  atlas: DreamAtlas,
  profile: AtlasLayoutProfile = ATLAS_LAYOUT_MOBILE,
): Map<string, NodeGeometry> {
  const { nodeSize, anchorNodeSize } = profile;
  // Edge-aware bounds: push the widest row's outermost node centres out to a node
  // radius (plus a small inset) from the stage edge along the spread axis, so
  // their outer edges sit just inside the device edge and the full span is used.
  const spreadExtent =
    profile.orientation === "portrait"
      ? profile.stageWidth
      : profile.stageHeight;
  const contentRect = profile.edgeAnchorHorizontal
    ? profile.orientation === "portrait"
      ? {
          ...profile.contentRect,
          left: nodeSize / 2 + EDGE_ANCHOR_INSET,
          right: spreadExtent - (nodeSize / 2 + EDGE_ANCHOR_INSET),
        }
      : {
          ...profile.contentRect,
          top: nodeSize / 2 + EDGE_ANCHOR_INSET,
          bottom: spreadExtent - (nodeSize / 2 + EDGE_ANCHOR_INSET),
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

  // Normalizes a value to [0, 1] within its range, or the range's midpoint when
  // the range is degenerate (a single layer, or a single-node spread).
  const norm = (v: number, lo: number, hi: number): number =>
    hi === lo ? 0.5 : (v - lo) / (hi - lo);
  const lerp = (t: number, a: number, b: number): number => a + t * (b - a);

  for (const node of positioned) {
    const isStarter = node.id === atlas.startingNodeId;
    const isBoss = node.id === atlas.bossNodeId;
    // The layer axis is generator `position.x` (starter min → boss max); the
    // spread axis is `position.y`, centred within the layer.
    const layer = norm(node.position.x, minX, maxX);
    const spread = norm(node.position.y, minY, maxY);
    const { left, top } =
      profile.orientation === "portrait"
        ? {
            // Portrait: layer climbs bottom→top; spread runs left→right.
            left: lerp(spread, contentRect.left, contentRect.right),
            top: lerp(layer, contentRect.bottom, contentRect.top),
          }
        : {
            // Landscape: layer crosses left→right; spread runs top→bottom.
            left: lerp(layer, contentRect.left, contentRect.right),
            top: lerp(spread, contentRect.top, contentRect.bottom),
          };
    geometry.set(node.id, {
      left,
      top,
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
  if (
    choiceLayer !== null &&
    layerOrdinal(from.layer) > layerOrdinal(choiceLayer)
  ) {
    return "locked";
  }
  return "dim";
}

/** Builds the forward connectors, styled from the endpoint states. */
export function buildAtlasMapEdges(
  atlas: DreamAtlas,
  profile: AtlasLayoutProfile = ATLAS_LAYOUT_MOBILE,
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
const STARTER_BODY = "A quiet place where every dream journey begins.";

/** Resolves a node's pre-revealed known-dreamsign card, or null when it has none. */
function buildDreamsignCard(
  node: DreamscapeNode,
  journeyContent: JourneyContent,
  isReachable: boolean,
): AtlasNodeDreamsign | null {
  // An unreachable node hides its known-dreamsign card along with the rest of
  // its revealed content.
  if (!isReachable || node.knownDreamsignId === null) {
    return null;
  }
  const dreamsign =
    journeyContent.dreamsignTemplates.find(
      (t) => t.id === node.knownDreamsignId,
    ) ?? null;
  if (dreamsign === null) {
    return null;
  }
  return {
    id: dreamsign.id,
    name: dreamsign.name,
    art:
      dreamsign.imageName != null
        ? artRef.dreamsign(dreamsign.imageName)
        : null,
    rulesText: dreamsign.effectDescription,
  };
}

/** Resolves the signature site's standard InfoCard payload. */
function buildSignatureSiteCard(
  dreamscape: NonNullable<JourneyContent["dreamscapes"][number]>,
  siteId: string,
): AtlasNodeSite {
  return {
    id: siteId,
    name: siteTypeName(dreamscape.signatureSite),
    blurb: siteTypeDescription(dreamscape.signatureSite),
    icon: glyph(siteTypeIcon(dreamscape.signatureSite)),
  };
}

/** Resolves the affiliation explanatory InfoCard payload. */
function affiliationCardTheme(name: string): string {
  const normalized = name.trim().toLowerCase();
  const withoutArticle = normalized.startsWith("the ")
    ? normalized.slice("the ".length)
    : normalized;
  const singular = withoutArticle.endsWith("s")
    ? withoutArticle.slice(0, -1)
    : withoutArticle;
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

/** Resolves the affiliation explanatory InfoCard payload. */
function buildAffiliationCard(
  affiliation: JourneyContent["affiliations"][number] | null,
): AtlasNodeAffiliation | null {
  return affiliation !== null
    ? {
        id: affiliation.id,
        name: affiliation.name,
        cardTheme: affiliationCardTheme(affiliation.name),
      }
    : null;
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
  journeyContent: JourneyContent,
  atlas: DreamAtlas,
  isReachable: boolean,
): {
  primary: AtlasNodePrimary;
  dreamsign: AtlasNodeDreamsign | null;
  site: AtlasNodeSite | null;
  affiliation: AtlasNodeAffiliation | null;
} {
  const dreamsign = buildDreamsignCard(node, journeyContent, isReachable);

  if (geo.isBoss) {
    const bossIncarnation =
      atlas.bossIncarnationId != null
        ? ((journeyContent.apollyonIncarnations ?? []).find(
            (i) => i.id === atlas.bossIncarnationId,
          ) ?? null)
        : null;
    return {
      primary: {
        sceneArt: artRef.dreamscapeScene(BOSS_DREAMSCAPE_ID),
        // The boss stands over the Limbo scene as its prominent figure.
        figureArt: artRef.dreamGuide(BOSS_DISPLAY.guideId),
        // Title with the run's chosen Apollyon incarnation (its full name, e.g.
        // "Apollyon, the World's End"), falling back to the default epithet when
        // no incarnation was assigned.
        title: bossIncarnation?.title ?? BOSS_DISPLAY.title,
        body: bossIncarnation?.description ?? BOSS_DISPLAY.intro,
        // The desktop hover card presents Limbo as the place with the chosen
        // incarnation as the guide-line; the boss has no site or affiliation.
        placeName: BOSS_DISPLAY.place,
        guideName: bossIncarnation?.title ?? BOSS_DISPLAY.title,
      },
      dreamsign,
      site: null,
      affiliation: null,
    };
  }

  // An unreachable node forgets whatever dreamscape it was revealed as, so it
  // presents the compact "unseen dream" card rather than leaking it.
  const dreamscape =
    isReachable && node.dreamscapeId !== null
      ? (journeyContent.dreamscapes.find((d) => d.id === node.dreamscapeId) ??
        null)
      : null;

  if (node.state === "unrevealed" || !isReachable || dreamscape === null) {
    return {
      primary: {
        sceneArt: null,
        figureArt: null,
        title: "An Unseen Dream",
        body: UNSEEN_DREAM_BODY,
        // A still-unseen dream can carry a pre-revealed known dreamsign (its badge
        // already shows on the node); pressing it reveals that dreamsign's own
        // companion card beneath the "unseen dream" text. Unreachable nodes hide
        // it — `buildDreamsignCard` already returns null for those.
        // An unrevealed node has no scene, so the large desktop hover card falls
        // back to the compact text card; its detail fields stay null.
        placeName: null,
        guideName: null,
      },
      dreamsign,
      site: null,
      affiliation: null,
    };
  }

  const guide =
    dreamscape.guideId != null
      ? (journeyContent.guides.find((g) => g.id === dreamscape.guideId) ?? null)
      : null;
  const affiliation =
    dreamscape.affiliationId != null
      ? (journeyContent.affiliations.find(
          (a) => a.id === dreamscape.affiliationId,
        ) ?? null)
      : null;
  // The starter carries no guide or affiliation, so its signature-site name is
  // suppressed too; a resident dreamscape shows its signature site's label.
  const revealedSite = revealedAtlasSite(node);
  const site =
    guide != null && revealedSite !== null
      ? buildSignatureSiteCard(dreamscape, revealedSite.id)
      : null;

  // Show the dreamscape scene as the full-bleed hero, with the resident guide's
  // character render standing prominently over it and the guide's name as the
  // headline. A guideless place (the starter) has no figure and titles the card
  // with the dreamscape's own name, so it never reveals as an untitled scene.
  return {
    primary: {
      sceneArt: artRef.dreamscapeScene(dreamscape.id),
      figureArt: guide != null ? artRef.dreamGuide(guide.id) : null,
      title: guide?.name ?? dreamscape.name,
      body: guide?.homeSpecialty ?? STARTER_BODY,
      // The large desktop hover card presents the place, its resident guide, the
      // signature site, and the dreamscape's affiliation as distinct fields.
      placeName: dreamscape.name,
      guideName: guide?.name ?? null,
    },
    dreamsign,
    site,
    affiliation: buildAffiliationCard(affiliation),
  };
}

/** Builds the placed node items — faces and resolved hover cards. */
export function buildAtlasMapNodes(
  atlas: DreamAtlas,
  journeyContent: JourneyContent,
  profile: AtlasLayoutProfile = ATLAS_LAYOUT_MOBILE,
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
        ? (journeyContent.dreamscapes.find((d) => d.id === node.dreamscapeId) ??
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
      geo.isBoss ||
      geo.isStarter ||
      dreamscape === null ||
      revealedSite === null
        ? null
        : glyph(siteTypeIcon(dreamscape.signatureSite));

    const dreamsignTemplate =
      isReachable && node.knownDreamsignId !== null
        ? (journeyContent.dreamsignTemplates.find(
            (t) => t.id === node.knownDreamsignId,
          ) ?? null)
        : null;
    const knownDreamsignRef =
      dreamsignTemplate?.imageName != null
        ? artRef.dreamsign(dreamsignTemplate.imageName)
        : null;

    items.push({
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
      ...buildNodeCard(node, geo, journeyContent, atlas, isReachable),
    });
  }
  return items;
}

/**
 * The full view-model for the atlas screen: the placed nodes and their forward
 * connectors. Deterministic in its arguments.
 */
export function buildAtlasView(
  atlas: DreamAtlas,
  journeyContent: JourneyContent,
  isDesktop = false,
  state?: JourneyState,
  tutorialConfiguration?: TutorialAtlasConfiguration,
): AtlasView {
  const profile = atlasLayoutProfile(isDesktop);
  return {
    stageWidth: profile.stageWidth,
    stageHeight: profile.stageHeight,
    nodes: buildAtlasMapNodes(atlas, journeyContent, profile),
    edges: buildAtlasMapEdges(atlas, profile),
    guideDialogue:
      state === undefined
        ? undefined
        : buildAtlasGuideDialogue(state, tutorialConfiguration),
  };
}

/** Build Mira's guidance only for the tutorial journey's first Atlas visit. */
export function buildAtlasGuideDialogue(
  state: JourneyState,
  configuration?: TutorialAtlasConfiguration,
): AtlasView["guideDialogue"] {
  if (
    state.isTutorialJourney !== true ||
    state.completionLevel !== 1 ||
    configuration === undefined
  ) {
    return undefined;
  }
  const speechBubble = configuration.speechBubble;
  return {
    id: `${state.runId ?? state.seed}:atlas-guidance`,
    model: {
      portrait: { kind: "character-portrait", characterId: "mira" },
      portraitAlt: "Mira",
      speakerName: "Mira",
      text: speechBubble.text,
    },
    delaySeconds: tutorialSpeechBubbleDelaySeconds(speechBubble),
    horizontalOffset: speechBubble.horizontalOffset,
    verticalOffset: speechBubble.verticalOffset,
    bubbleWidth: speechBubble.bubbleWidth,
  };
}

/** Reconstruction fields for the moment delayed Atlas guidance appears. */
export function buildAtlasGuidanceLog(
  state: JourneyState,
  dialogue: NonNullable<AtlasView["guideDialogue"]>,
): {
  readonly key: string;
  readonly fields: Record<string, unknown>;
} {
  return {
    key: `tutorial-atlas-guidance:${state.runId ?? state.seed}`,
    fields: {
      completionLevel: state.completionLevel,
      delaySeconds: dialogue.delaySeconds,
      horizontalOffsetPx: dialogue.horizontalOffset,
      verticalOffsetPx: dialogue.verticalOffset,
      bubbleWidthPx: dialogue.bubbleWidth,
      text: dialogue.model.text,
    },
  };
}
