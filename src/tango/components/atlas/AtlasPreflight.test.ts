import { describe, expect, it } from "vitest";
import { LayerName } from "../../../types/layer-name";
import type { DreamscapeNode } from "../../../types/quest";
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
    biomeColor: "",
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
    view: {
      node: node(id),
      left: 0,
      top: 0,
      size: 120,
      isStarter: false,
      isBoss: false,
      iconRef: null,
      siteBadgeGlyph: null,
      knownDreamsignRef: null,
    },
    card: {
      isUnrevealed: false,
      isBoss: false,
      sceneArt: null,
      figureArt: null,
      eyebrow: null,
      title: "Guide",
      body: "A dreamscape.",
      dreamsign: null,
      placeName: "Place",
      guideName: "Guide",
      siteName: null,
      affiliation: null,
      siteCard: null,
      affiliationCard: null,
    },
    ...overrides,
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
        view: {
          ...item("first", {}).view,
          iconRef: icon,
          knownDreamsignRef: dreamsign,
        },
        card: {
          ...item("first", {}).card,
          sceneArt: scene,
          figureArt: guide,
          dreamsign: {
            name: "The Held Star",
            art: dreamsign,
            rulesText: "Gain 1 essence.",
          },
        },
      }),
      item("duplicate", {
        view: {
          ...item("duplicate", {}).view,
          iconRef: icon,
        },
        card: {
          ...item("duplicate", {}).card,
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
