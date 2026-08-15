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
import { parseSiteId } from "../types/identifiers";
import { parseAtlasNodeId } from "../types/identifiers";
import { testDreamscapeId } from "../types/test-identities";

function makeSite(idSeed: string, type: SiteType): SiteState {
  return { id: parseSiteId(idSeed), type, isEnhanced: false, isVisited: false };
}

function makeNode(
  idSeed: string,
  dreamscapeIdSeed: string | null,
  sites: SiteState[],
  layerOrdinal = 2,
): DreamscapeNode {
  return {
    id: parseAtlasNodeId(idSeed),
    layer: layerAtOrdinal(layerOrdinal) ?? LayerName.One,
    indexInLayer: 0,
    dreamscapeId:
      dreamscapeIdSeed === null ? null : testDreamscapeId(dreamscapeIdSeed),
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
  dreamscapeIdSeed: string | null,
  sites: SiteState[],
  nodeId = "dreamscape-3",
  layer = 2,
): JourneyState {
  const node = makeNode(nodeId, dreamscapeIdSeed, sites, layer);
  const base = createDefaultState();
  return {
    ...base,
    currentDreamscape: parseAtlasNodeId(nodeId),
    atlas: {
      ...base.atlas,
      layers: [[parseAtlasNodeId(nodeId)]],
      nodes: { [nodeId]: node },
      startingNodeId: parseAtlasNodeId(nodeId),
      currentNodeId: parseAtlasNodeId(nodeId),
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
        screen: { type: "site", siteId: parseSiteId("site-7") },
      }),
    ).toBe("/dreamscape/2-ember-wood/purge");
    expect(
      screenToJourneyPath({
        ...state,
        screen: { type: "site", siteId: parseSiteId("site-8") },
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
        screen: { type: "site", siteId: parseSiteId("does-not-exist") },
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
