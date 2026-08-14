import { describe, it, expect } from "vitest";

import { createDefaultState } from "../state/journey-context";
import type {
  DreamscapeNode,
  JourneyState,
  SiteState,
  SiteType,
} from "../types/journey";
import { screenToJourneyPath, siteTypeSlug, slugify } from "./screen-url";
import { LayerName, layerAtOrdinal } from "../types/layer-name";
import { asDreamscapeId } from "../types/identifiers";
import { asSiteId } from "../types/identifiers";
import { asAtlasNodeId } from "../types/identifiers";

function makeSite(id: string, type: SiteType): SiteState {
  return { id: asSiteId(id), type, isEnhanced: false, isVisited: false };
}

function makeNode(
  id: string,
  dreamscapeId: string | null,
  sites: SiteState[],
  layerOrdinal = 2,
): DreamscapeNode {
  return {
    id: asAtlasNodeId(id),
    layer: layerAtOrdinal(layerOrdinal) ?? LayerName.One,
    indexInLayer: 0,
    dreamscapeId:
      dreamscapeId === null ? null : asDreamscapeId(dreamscapeId),
    sites,
    position: { x: 0, y: 0 },
    state: "available",
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
  };
}

/** A default state parked in a single-node dreamscape with the given sites. */
function stateInDreamscape(
  dreamscapeId: string | null,
  sites: SiteState[],
  nodeId = "dreamscape-3",
  layer = 2,
): JourneyState {
  const node = makeNode(nodeId, dreamscapeId, sites, layer);
  const base = createDefaultState();
  return {
    ...base,
    currentDreamscape: asAtlasNodeId(nodeId),
    atlas: {
      ...base.atlas,
      layers: [[asAtlasNodeId(nodeId)]],
      nodes: { [nodeId]: node },
      startingNodeId: asAtlasNodeId(nodeId),
      currentNodeId: asAtlasNodeId(nodeId),
    },
  };
}

describe("screenToJourneyPath", () => {
  it("maps the top-level screens", () => {
    const base = createDefaultState();
    expect(
      screenToJourneyPath({ ...base, screen: { type: "journeyStart" } }),
    ).toBe("/");
    expect(screenToJourneyPath({ ...base, screen: { type: "atlas" } })).toBe(
      "/atlas",
    );
    expect(
      screenToJourneyPath({ ...base, screen: { type: "journeyComplete" } }),
    ).toBe("/complete");
    expect(
      screenToJourneyPath({ ...base, screen: { type: "journeyFailed" } }),
    ).toBe("/failed");
  });

  it("keys the dreamscape screen by the layer and dreamscape id", () => {
    const state = stateInDreamscape("ember-wood", [], "dreamscape-3", 2);
    expect(screenToJourneyPath({ ...state, screen: { type: "dreamscape" } })).toBe(
      "/dreamscape/2-ember-wood",
    );
  });

  it("disambiguates the same dreamscape id by layer", () => {
    const layer1 = stateInDreamscape("ember-wood", [], "dreamscape-3", 1);
    const layer4 = stateInDreamscape("ember-wood", [], "dreamscape-9", 4);
    expect(
      screenToJourneyPath({ ...layer1, screen: { type: "dreamscape" } }),
    ).toBe("/dreamscape/1-ember-wood");
    expect(
      screenToJourneyPath({ ...layer4, screen: { type: "dreamscape" } }),
    ).toBe("/dreamscape/4-ember-wood");
  });

  it("appends the site-type slug for a site screen", () => {
    const purge = makeSite("site-7", "Purge");
    const augury = makeSite("site-8", "Augury");
    const state = stateInDreamscape(
      "Ember Wood",
      [purge, augury],
      "dreamscape-3",
      2,
    );
    expect(
      screenToJourneyPath({
        ...state,
        screen: { type: "site", siteId: asSiteId("site-7") },
      }),
    ).toBe("/dreamscape/2-ember-wood/purge");
    expect(
      screenToJourneyPath({
        ...state,
        screen: { type: "site", siteId: asSiteId("site-8") },
      }),
    ).toBe("/dreamscape/2-ember-wood/augury");
  });

  it("falls back to the node id slug while identity is concealed", () => {
    const state = stateInDreamscape(null, [], "dreamscape-4", 3);
    expect(screenToJourneyPath({ ...state, screen: { type: "dreamscape" } })).toBe(
      "/dreamscape/3-dreamscape-4",
    );
  });

  it("degrades gracefully when the dreamscape or site is missing", () => {
    const base = createDefaultState();
    expect(
      screenToJourneyPath({
        ...base,
        currentDreamscape: null,
        screen: { type: "dreamscape" },
      }),
    ).toBe("/dreamscape");

    const state = stateInDreamscape("Ember Wood", [], "dreamscape-3", 2);
    expect(
      screenToJourneyPath({
        ...state,
        screen: { type: "site", siteId: asSiteId("does-not-exist") },
      }),
    ).toBe("/dreamscape/2-ember-wood");
  });
});

describe("siteTypeSlug", () => {
  it("kebab-cases camel-case site types and lowercases simple ones", () => {
    expect(siteTypeSlug("Purge")).toBe("purge");
    expect(siteTypeSlug("Augury")).toBe("augury");
    expect(siteTypeSlug("DreamsignBazaar")).toBe("dreamsign-bazaar");
    expect(siteTypeSlug("Exploration")).toBe("exploration");
  });
});

describe("slugify", () => {
  it("lowercases, hyphenates, and strips punctuation", () => {
    expect(slugify("Ember Wood")).toBe("ember-wood");
    expect(slugify("  The Sunken City!  ")).toBe("the-sunken-city");
  });

  it("folds accents to ASCII-ish slugs", () => {
    expect(slugify("Café Noir")).toBe("cafe-noir");
  });

  it("returns an empty string when there is nothing to slug", () => {
    expect(slugify("   ")).toBe("");
    expect(slugify("—")).toBe("");
  });
});
