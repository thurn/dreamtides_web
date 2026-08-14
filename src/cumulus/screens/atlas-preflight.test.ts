import { assertLocalized } from "@trox/runtime";
import { describe, expect, it } from "vitest";
import { LayerName } from "../../types/layer-name";
import type { DreamscapeNode } from "../../types/journey";
import type { AtlasNodeModel } from "../components/atlas/AtlasNode";
import { artRef, resolveArtRef } from "../primitives/art";
import { atlasPreflightImageUrls } from "./atlas-preflight";

function node(id: string): DreamscapeNode {
  return {
    id,
    layer: LayerName.Two,
    indexInLayer: 0,
    dreamscapeId: null,
    sites: [],
    position: { x: 0, y: 0 },
    state: "available",
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
  };
}

function item(id: string, overrides: Partial<AtlasNodeModel>): AtlasNodeModel {
  return {
    id,
    name: assertLocalized(id),
    state: node(id).state,
    role: "regular",
    isReachable: true,
    iconRef: null,
    unrevealedFrameRef: artRef.atlasAsset("fixture-frame.png"),
    siteBadgeGlyph: null,
    knownDreamsignRef: null,
    primary: {
      sceneArt: null,
      figureArt: null,
      title: assertLocalized("Guide"),
      body: assertLocalized("A dreamscape."),
      placeName: assertLocalized("Place"),
      guideName: assertLocalized("Guide"),
    },
    dreamsign: null,
    site: null,
    affiliation: null,
    ...overrides,
  };
}

describe("atlasPreflightImageUrls", () => {
  it("collects screen and reveal images once in first-seen order", () => {
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
          name: assertLocalized("The Held Star"),
          art: dreamsign,
          rulesText: assertLocalized("Gain 1 essence."),
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
