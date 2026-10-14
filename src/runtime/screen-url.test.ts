// Journey URL contracts: each screen maps to its path, keyed by layer and
// dreamscape art identity, with site-type and free-text slugs.

import { describe, expect, it } from "vitest";
import {
  testDreamscapeArtKey,
  testDreamscapeId, testDreamsignId,
} from "../types/test-identities";
import type { DreamscapeArtCatalog } from "../data/dreamscapes";
import { testJourneyState } from "../testing/journey-genesis";
import type {
  DreamscapeNode,
  JourneyState,
  SiteState,
  SiteType,
} from "../types/journey";
import { screenToJourneyPath, siteTypeSlug, slugify } from "./screen-url";
import { LayerName, layerAtOrdinal } from "../types/layer-name";
import { parseSiteId, parseAtlasNodeId } from "../types/identifiers";

describe("screen-url", () => {
  const ART_CATALOG: DreamscapeArtCatalog = {
    dreamscapes: [
      {
        id: testDreamscapeId("ember-wood"),
        artKey: testDreamscapeArtKey("ember_wood"),
      },
      {
        id: testDreamscapeId("Ember Wood"),
        artKey: testDreamscapeArtKey("ember_wood"),
      },
    ],
    atlasData: {
      boss: {
        dreamscapeId: testDreamscapeId("fixture-boss"),
        sceneArtKey: testDreamscapeArtKey("fixture_limbo"),
      },
    },
  };

  function makeSite(idSeed: string, type: SiteType): SiteState {
    return {
      id: parseSiteId(idSeed),
      type,
      isEnhanced: false,
      isVisited: false,
    };
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
    const base = testJourneyState();
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
      const base = testJourneyState();
      expect(
        screenToJourneyPath(
          { ...base, screen: { type: "journeyStart" } },
          ART_CATALOG,
        ),
      ).toBe("/");
      expect(
        screenToJourneyPath(
          { ...base, screen: { type: "atlas" } },
          ART_CATALOG,
        ),
      ).toBe("/atlas");
      expect(
        screenToJourneyPath(
          { ...base, screen: { type: "journeyComplete" } },
          ART_CATALOG,
        ),
      ).toBe("/complete");
      expect(
        screenToJourneyPath(
          { ...base, screen: { type: "journeyFailed" } },
          ART_CATALOG,
        ),
      ).toBe("/failed");
    });

    it("maps a suspended choice to its exact continuation path", () => {
      const base = testJourneyState(), source = testDreamsignId("url-source");
      const suspended: JourneyState = { ...base, screen: { type: "journeyDreamsign", choice: { kind: "copy", sources: [{ dreamsignId: source, heldIndex: 1 }], heldIds: [testDreamsignId("url-target"), source], index: 0, permissionSeq: 1, continuation: { type: "journeyFailed" }, suspendedBattle: null } } };
      expect(screenToJourneyPath(suspended, ART_CATALOG)).toBe("/failed");
    });

    it.each(["atlas", "journeyComplete", "journeyFailed"] as const)("reflects an earned Dreamsign choice before returning to %s", (returnTo) => {
      const base = testJourneyState(), source = testDreamsignId("url-earned-source"), siteId = parseSiteId("url-earned-site");
      const earned: JourneyState = { ...base, screen: { type: "journeyDreamsign", choice: { kind: "afterBattle", siteId, sources: [{ kind: "dreamsign", dreamsignId: source, heldIndex: 0, earnedSeq: 1, offerCount: 3, offeredDreamsigns: [], remainingPoolIds: [] }], index: 0, returnTo } } };
      expect(screenToJourneyPath(earned, ART_CATALOG)).toBe(`/dreamsign/${siteId}`);
    });

    it("keys the dreamscape screen by the layer and dreamscape id", () => {
      const state = stateInDreamscape("ember-wood", [], "dreamscape-3", 2);
      expect(
        screenToJourneyPath(
          { ...state, screen: { type: "dreamscape" } },
          ART_CATALOG,
        ),
      ).toBe("/dreamscape/2-ember-wood");
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
        screenToJourneyPath(
          {
            ...state,
            screen: { type: "site", siteId: parseSiteId("site-7") },
          },
          ART_CATALOG,
        ),
      ).toBe("/dreamscape/2-ember-wood/purge");
      expect(
        screenToJourneyPath(
          {
            ...state,
            screen: { type: "site", siteId: parseSiteId("site-8") },
          },
          ART_CATALOG,
        ),
      ).toBe("/dreamscape/2-ember-wood/augury");
    });

    it("keys the boss node by its scene art key", () => {
      const state = stateInDreamscape("fixture-boss", [], "boss", 2);
      expect(
        screenToJourneyPath(
          { ...state, screen: { type: "dreamscape" } },
          ART_CATALOG,
        ),
      ).toBe("/dreamscape/2-fixture-limbo");
    });

    it("falls back to the node id slug while identity is concealed", () => {
      const state = stateInDreamscape(null, [], "dreamscape-4", 3);
      expect(
        screenToJourneyPath(
          { ...state, screen: { type: "dreamscape" } },
          ART_CATALOG,
        ),
      ).toBe("/dreamscape/3-dreamscape-4");
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
  });
});
