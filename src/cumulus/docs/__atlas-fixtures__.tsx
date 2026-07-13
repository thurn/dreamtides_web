import { LayerName } from "../../types/layer-name";
import type { DreamscapeNode } from "../../types/quest";
import type { AtlasNodeModel, AtlasNodePrimary } from "../components/atlas/AtlasNode";
import {
  ATLAS_ANCHOR_NODE_SIZE_DESKTOP,
  ATLAS_ANCHOR_NODE_SIZE_MOBILE,
  ATLAS_BADGE_SCALE_MOBILE,
  ATLAS_NODE_SIZE_DESKTOP,
  ATLAS_NODE_SIZE_MOBILE,
  BOSS_DISPLAY,
  BOSS_DREAMSCAPE_ID,
} from "../components/atlas/atlas-display";
import { artRef } from "../primitives/art";
import { glyph } from "../primitives/glyph";

export interface NodeSizing { nodeSize: number; anchorNodeSize: number; badgeScale: number }

export function nodeSizing(mobile: boolean): NodeSizing {
  return mobile
    ? { nodeSize: ATLAS_NODE_SIZE_MOBILE, anchorNodeSize: ATLAS_ANCHOR_NODE_SIZE_MOBILE, badgeScale: ATLAS_BADGE_SCALE_MOBILE }
    : { nodeSize: ATLAS_NODE_SIZE_DESKTOP, anchorNodeSize: ATLAS_ANCHOR_NODE_SIZE_DESKTOP, badgeScale: 1 };
}

export type AtlasFixtureRole = "starter" | "completed" | "available" | "revealedLocked" | "unrevealed" | "forgone" | "boss";
export interface AtlasFixtureNode { role: AtlasFixtureRole; item: AtlasNodeModel }

const UUIDS: Record<AtlasFixtureRole, string> = {
  starter: "00000000-0000-4000-8000-000000000081",
  completed: "00000000-0000-4000-8000-000000000082",
  available: "00000000-0000-4000-8000-000000000083",
  revealedLocked: "00000000-0000-4000-8000-000000000084",
  unrevealed: "00000000-0000-4000-8000-000000000085",
  forgone: "00000000-0000-4000-8000-000000000086",
  boss: "00000000-0000-4000-8000-000000000087",
};

function node(role: AtlasFixtureRole, state: DreamscapeNode["state"]): DreamscapeNode {
  return {
    id: UUIDS[role], layer: LayerName.One, indexInLayer: 0,
    dreamscapeId: role === "unrevealed" ? null : role,
    biomeName: role === "unrevealed" ? "" : role === "boss" ? "Limbo" : "Demo Dreamscape",
    biomeColor: "#2d2040", sites: [], position: { x: 0, y: 0 }, state,
    enhancedSiteType: null, forwardIds: [], backwardIds: [],
    knownDreamsignId: role === "available" ? "00000000-0000-4000-8000-000000000088" : null,
  };
}

function primary(role: AtlasFixtureRole): AtlasNodePrimary {
  if (role === "unrevealed" || role === "forgone") {
    return { sceneArt: null, figureArt: null, placeName: null, guideName: null, title: "An Unseen Dream", body: "Travel onward to learn what waits here." };
  }
  if (role === "boss") {
    return { sceneArt: artRef.dreamscapeScene(BOSS_DREAMSCAPE_ID), figureArt: artRef.dreamGuide(BOSS_DISPLAY.guideId), placeName: BOSS_DISPLAY.place, guideName: BOSS_DISPLAY.title, title: BOSS_DISPLAY.title, body: BOSS_DISPLAY.intro };
  }
  const id = role === "starter" ? "firstlight_meadow" : role === "completed" ? "tumbleleaf_village" : role === "available" ? "frostforge" : "hopes_end";
  return { sceneArt: artRef.dreamscapeScene(id), figureArt: null, placeName: "A Revealed Dream", guideName: null, title: "A Revealed Dream", body: "A place whose shape you have already glimpsed." };
}

export function atlasFixtureNodes(sizing: NodeSizing): AtlasFixtureNode[] {
  const states: Array<[AtlasFixtureRole, DreamscapeNode["state"]]> = [
    ["unrevealed", "unrevealed"], ["revealedLocked", "revealedLocked"],
    ["available", "available"], ["completed", "completed"],
    ["forgone", "revealedLocked"], ["starter", "completed"],
    ["boss", "revealedLocked"],
  ];
  const badge = glyph("bxf bx-store-alt-2");
  return states.map(([role, state]) => {
    const isStarter = role === "starter";
    const isBoss = role === "boss";
    const isHidden = role === "unrevealed" || role === "forgone";
    const dreamsign = role === "available" ? {
      id: "00000000-0000-4000-8000-000000000088",
      name: "Golden Acorn", art: artRef.dreamsign("acorn_gold.png"),
      rulesText: "Whenever you play a card, gain 1 essence.",
    } : null;
    return {
      role,
      item: {
        node: node(role, state), left: 0, top: 0,
        size: isStarter || isBoss ? sizing.anchorNodeSize : sizing.nodeSize,
        isStarter, isBoss, isReachable: role !== "forgone",
        iconRef: isHidden || isBoss ? null : artRef.dreamscapeIcon(role === "starter" ? "firstlight_meadow" : role === "completed" ? "tumbleleaf_village" : role === "available" ? "frostforge" : "hopes_end"),
        siteBadgeGlyph: isHidden || isStarter || isBoss ? null : badge,
        knownDreamsignRef: dreamsign?.art ?? null, badgeScale: sizing.badgeScale,
        primary: primary(role), dreamsign, site: null, affiliation: null,
      },
    };
  });
}
