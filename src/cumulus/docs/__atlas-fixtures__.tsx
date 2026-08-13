import { assertLocalized } from "@trox/runtime";
import { LayerName } from "../../types/layer-name";
import type { DreamscapeNode } from "../../types/journey";
import type {
  AtlasNodeModel,
  AtlasNodePrimary,
} from "../components/atlas/AtlasNode";
import {
  ATLAS_ANCHOR_NODE_SIZE_DESKTOP,
  ATLAS_ANCHOR_NODE_SIZE_MOBILE,
  ATLAS_NODE_SIZE_DESKTOP,
  ATLAS_NODE_SIZE_MOBILE,
} from "../components/atlas/atlas-display";
import { artRef } from "../primitives/art";
import { glyph } from "../primitives/glyph";

export interface NodeSizing {
  nodeSize: number;
  anchorNodeSize: number;
}

export function nodeSizing(mobile: boolean): NodeSizing {
  return mobile
    ? {
        nodeSize: ATLAS_NODE_SIZE_MOBILE,
        anchorNodeSize: ATLAS_ANCHOR_NODE_SIZE_MOBILE,
      }
    : {
        nodeSize: ATLAS_NODE_SIZE_DESKTOP,
        anchorNodeSize: ATLAS_ANCHOR_NODE_SIZE_DESKTOP,
      };
}

export type AtlasFixtureRole =
  | "starter"
  | "completed"
  | "available"
  | "revealedLocked"
  | "unrevealed"
  | "forgone"
  | "boss";
export interface AtlasFixtureNode {
  role: AtlasFixtureRole;
  item: AtlasNodeModel;
  boxSize: number;
}

const UUIDS: Record<AtlasFixtureRole, string> = {
  starter: "00000000-0000-4000-8000-000000000081",
  completed: "00000000-0000-4000-8000-000000000082",
  available: "00000000-0000-4000-8000-000000000083",
  revealedLocked: "00000000-0000-4000-8000-000000000084",
  unrevealed: "00000000-0000-4000-8000-000000000085",
  forgone: "00000000-0000-4000-8000-000000000086",
  boss: "00000000-0000-4000-8000-000000000087",
};

function node(
  role: AtlasFixtureRole,
  state: DreamscapeNode["state"],
): DreamscapeNode {
  return {
    id: UUIDS[role],
    layer: LayerName.One,
    indexInLayer: 0,
    dreamscapeId: role === "unrevealed" ? null : role,
    biomeName:
      role === "unrevealed"
        ? ""
        : role === "boss"
          ? "Limbo"
          : "Demo Dreamscape",
    sites: [],
    position: { x: 0, y: 0 },
    state,
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId:
      role === "available" ? "00000000-0000-4000-8000-000000000088" : null,
  };
}

function primary(role: AtlasFixtureRole): AtlasNodePrimary {
  if (role === "unrevealed" || role === "forgone") {
    return {
      sceneArt: null,
      figureArt: null,
      placeName: null,
      guideName: null,
      title: assertLocalized("Fixture Unseen Dream"),
      body: assertLocalized("Fixture unrevealed-node copy."),
    };
  }
  if (role === "boss") {
    return {
      sceneArt: artRef.dreamscapeScene("limbo"),
      figureArt: artRef.dreamGuide("apollyon"),
      placeName: assertLocalized("Fixture Boss Realm"),
      guideName: assertLocalized("Fixture Boss"),
      title: assertLocalized("Fixture Boss"),
      body: assertLocalized("A fixed boss fixture."),
    };
  }
  const id =
    role === "starter"
      ? "firstlight_meadow"
      : role === "completed"
        ? "tumbleleaf_village"
        : role === "available"
          ? "frostforge"
          : "hopes_end";
  return {
    sceneArt: artRef.dreamscapeScene(id),
    figureArt: null,
    placeName: assertLocalized("A Revealed Dream"),
    guideName: null,
    title: assertLocalized("A Revealed Dream"),
    body: assertLocalized("A place whose shape you have already glimpsed."),
  };
}

export function atlasFixtureNodes(sizing: NodeSizing): AtlasFixtureNode[] {
  const states: Array<[AtlasFixtureRole, DreamscapeNode["state"]]> = [
    ["unrevealed", "unrevealed"],
    ["revealedLocked", "revealedLocked"],
    ["available", "available"],
    ["completed", "completed"],
    ["forgone", "revealedLocked"],
    ["starter", "completed"],
    ["boss", "revealedLocked"],
  ];
  const badge = glyph("bxf bx-store-alt-2");
  return states.map(([role, state]) => {
    const isStarter = role === "starter";
    const isBoss = role === "boss";
    const isHidden = role === "unrevealed" || role === "forgone";
    const dreamsign =
      role === "available"
        ? {
            id: "00000000-0000-4000-8000-000000000088",
            name: assertLocalized("Golden Acorn"),
            art: artRef.dreamsign("acorn_gold.png"),
            rulesText: assertLocalized(
              "Whenever you play a card, gain 1 essence.",
            ),
          }
        : null;
    return {
      role,
      boxSize: isStarter || isBoss ? sizing.anchorNodeSize : sizing.nodeSize,
      item: {
        node: node(role, state),
        role: isStarter ? "starter" : isBoss ? "boss" : "regular",
        isReachable: role !== "forgone",
        iconRef: isHidden
          ? null
          : artRef.dreamscapeIcon(
              isBoss
                ? "limbo"
                : role === "starter"
                  ? "firstlight_meadow"
                  : role === "completed"
                    ? "tumbleleaf_village"
                    : role === "available"
                      ? "frostforge"
                      : "hopes_end",
            ),
        unrevealedFrameRef: artRef.atlasAsset("Round_frame_main.png"),
        siteBadgeGlyph: isHidden || isStarter || isBoss ? null : badge,
        knownDreamsignRef: dreamsign?.art ?? null,
        primary: primary(role),
        dreamsign,
        site: null,
        affiliation: null,
      },
    };
  });
}
