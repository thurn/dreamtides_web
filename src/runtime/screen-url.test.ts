import { describe, it, expect } from "vitest";

import { createDefaultState } from "../state/quest-context";
import type {
  DreamscapeNode,
  QuestState,
  SiteState,
  SiteType,
} from "../types/quest";
import { screenToQuestPath, siteTypeSlug, slugify } from "./screen-url";

function makeSite(id: string, type: SiteType): SiteState {
  return { id, type, isEnhanced: false, isVisited: false };
}

function makeNode(
  id: string,
  biomeName: string,
  sites: SiteState[],
  layer = 2,
): DreamscapeNode {
  return {
    id,
    layer,
    indexInLayer: 0,
    dreamscapeId: "biome-1",
    biomeName,
    biomeColor: "#000000",
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
  biomeName: string,
  sites: SiteState[],
  nodeId = "dreamscape-3",
  layer = 2,
): QuestState {
  const node = makeNode(nodeId, biomeName, sites, layer);
  const base = createDefaultState();
  return {
    ...base,
    currentDreamscape: nodeId,
    atlas: {
      ...base.atlas,
      layers: [[nodeId]],
      nodes: { [nodeId]: node },
      startingNodeId: nodeId,
      currentNodeId: nodeId,
    },
  };
}

describe("screenToQuestPath", () => {
  it("maps the top-level screens", () => {
    const base = createDefaultState();
    expect(screenToQuestPath({ ...base, screen: { type: "questStart" } })).toBe(
      "/",
    );
    expect(screenToQuestPath({ ...base, screen: { type: "atlas" } })).toBe(
      "/atlas",
    );
    expect(
      screenToQuestPath({ ...base, screen: { type: "questComplete" } }),
    ).toBe("/complete");
    expect(screenToQuestPath({ ...base, screen: { type: "questFailed" } })).toBe(
      "/failed",
    );
  });

  it("keys the dreamscape screen by the layer + biome slug", () => {
    const state = stateInDreamscape("Ember Wood", [], "dreamscape-3", 2);
    expect(screenToQuestPath({ ...state, screen: { type: "dreamscape" } })).toBe(
      "/dreamscape/2-ember-wood",
    );
  });

  it("disambiguates same-named biomes by layer", () => {
    const layer1 = stateInDreamscape("Ember Wood", [], "dreamscape-3", 1);
    const layer4 = stateInDreamscape("Ember Wood", [], "dreamscape-9", 4);
    expect(
      screenToQuestPath({ ...layer1, screen: { type: "dreamscape" } }),
    ).toBe("/dreamscape/1-ember-wood");
    expect(
      screenToQuestPath({ ...layer4, screen: { type: "dreamscape" } }),
    ).toBe("/dreamscape/4-ember-wood");
  });

  it("appends the site-type slug for a site screen", () => {
    const purge = makeSite("site-7", "Purge");
    const augury = makeSite("site-8", "DreamAugury");
    const state = stateInDreamscape("Ember Wood", [purge, augury], "dreamscape-3", 2);
    expect(
      screenToQuestPath({
        ...state,
        screen: { type: "site", siteId: "site-7" },
      }),
    ).toBe("/dreamscape/2-ember-wood/purge");
    expect(
      screenToQuestPath({
        ...state,
        screen: { type: "site", siteId: "site-8" },
      }),
    ).toBe("/dreamscape/2-ember-wood/dream-augury");
  });

  it("falls back to the node id slug when the biome is unnamed", () => {
    const state = stateInDreamscape("", [], "dreamscape-4", 3);
    expect(screenToQuestPath({ ...state, screen: { type: "dreamscape" } })).toBe(
      "/dreamscape/3-dreamscape-4",
    );
  });

  it("degrades gracefully when the dreamscape or site is missing", () => {
    const base = createDefaultState();
    expect(
      screenToQuestPath({
        ...base,
        currentDreamscape: null,
        screen: { type: "dreamscape" },
      }),
    ).toBe("/dreamscape");

    const state = stateInDreamscape("Ember Wood", [], "dreamscape-3", 2);
    expect(
      screenToQuestPath({
        ...state,
        screen: { type: "site", siteId: "does-not-exist" },
      }),
    ).toBe("/dreamscape/2-ember-wood");
  });
});

describe("siteTypeSlug", () => {
  it("kebab-cases camel-case site types and lowercases simple ones", () => {
    expect(siteTypeSlug("Purge")).toBe("purge");
    expect(siteTypeSlug("DreamAugury")).toBe("dream-augury");
    expect(siteTypeSlug("DreamsignMarket")).toBe("dreamsign-market");
    expect(siteTypeSlug("TemporalFork")).toBe("temporal-fork");
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
