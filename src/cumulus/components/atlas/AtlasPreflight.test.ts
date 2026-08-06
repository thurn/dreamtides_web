import { describe, expect, it } from "vitest";
import { LayerName } from "../../../types/layer-name";
import type { DreamscapeNode } from "../../../types/journey";
import { artRef, resolveArtRef } from "../../primitives/art";
import type { AtlasMapNode } from "./AtlasMap";
import { atlasPreflightImageUrls } from "./atlas-preflight";

function node(id: string): DreamscapeNode {
  return {
    id,
    layer: LayerName.Two,
    indexInLayer: 0,
    dreamscapeId: null,
    biomeName: "",
    sites: [],
    position: { x: 0, y: 0 },
    state: "available",
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
  };
}

function item(id: string, overrides: Partial<AtlasMapNode>): AtlasMapNode {
  return {
      node: node(id),
      left: 0,
      top: 0,
      size: 120,
      isStarter: false,
      isBoss: false,
      iconRef: null,
      unrevealedFrameRef: artRef.atlasAsset("fixture-frame.png"),
      siteBadgeGlyph: null,
      knownDreamsignRef: null,
    primary: {
      sceneArt: null,
      figureArt: null,
      title: "Guide",
      body: "A dreamscape.",
      placeName: "Place",
      guideName: "Guide",
    },
    dreamsign: null,
    site: null,
    affiliation: null,
    ...overrides,
    isReachable: overrides.isReachable ?? true,
  };
}

describe("atlasPreflightImageUrls", () => {
  it("collects map and reveal images once in first-seen order", () => {
    const icon = artRef.dreamscapeIcon("wilderveil");
    const scene = artRef.dreamscapeScene("wilderveil");
    const guide = artRef.dreamGuide("aldric");
    const dreamsign = artRef.dreamsign("magic-ball.png");

    const urls = atlasPreflightImageUrls([
      item("first", {
        iconRef: icon,
        knownDreamsignRef: dreamsign,
        primary: {
          ...item("first", {}).primary,
          sceneArt: scene,
          figureArt: guide,
        },
        dreamsign: {
            id: "00000000-0000-4000-8000-000000000061",
            name: "The Held Star",
            art: dreamsign,
            rulesText: "Gain 1 essence.",
        },
      }),
      item("duplicate", {
        iconRef: icon,
        primary: {
          ...item("duplicate", {}).primary,
          sceneArt: scene,
          figureArt: guide,
        },
      }),
    ]);

    expect(urls).toEqual([
      resolveArtRef(icon),
      resolveArtRef(dreamsign),
      resolveArtRef(scene),
      resolveArtRef(guide),
    ]);
  });
});
