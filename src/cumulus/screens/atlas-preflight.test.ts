import { assertLocalized } from "@trox/runtime";
import { describe, expect, it } from "vitest";
import { LayerName } from "../../types/layer-name";
import type { DreamscapeNode } from "../../types/journey";
import type { AtlasNodeModel } from "../components/atlas/AtlasNode";
import { artRef, resolveArtRef } from "../primitives/art";
import { atlasPreflightImageUrls } from "./atlas-preflight";
import { parseAtlasNodeId } from "../../types/identifiers";
import {
  testDreamscapeId,
  testGuideId,
  testArtAssetKey,
} from "../../types/test-identities";

function node(idSeed: string): DreamscapeNode {
  return {
    id: parseAtlasNodeId(idSeed),
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

function item(
  idSeed: string,
  overrides: Partial<AtlasNodeModel>,
): AtlasNodeModel {
  return {
    id: parseAtlasNodeId(idSeed),
    name: assertLocalized(idSeed),
    state: node(idSeed).state,
    role: "regular",
    isReachable: true,
    iconRef: null,
    unrevealedFrameRef: artRef.atlasAsset(testArtAssetKey("fixture-frame.png")),
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
    const icon = artRef.dreamscapeIcon(testDreamscapeId("wilderveil"));
    const scene = artRef.dreamscapeScene(testDreamscapeId("wilderveil"));
    const guide = artRef.dreamGuide(testGuideId("aldric"));
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
