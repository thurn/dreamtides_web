import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";

expect.addEqualityTesters([annotatedTextEquality]);
import { MINIMAL_SITES_DATA } from "../../testing/atlas-fixtures";
import { LayerName } from "../../types/layer-name";
import type { DreamscapeNode, SiteState } from "../../types/journey";
import { buildRandomSiteView } from "./random-site-view-model";

describe("buildRandomSiteView", () => {
  it("projects guide dialogue and site-registry icons into the display model", () => {
    const sitesData = {
      ...MINIMAL_SITES_DATA,
      siteTypes: {
        ...MINIMAL_SITES_DATA.siteTypes,
        Shop: {
          ...MINIMAL_SITES_DATA.siteTypes.Shop,
          icon: "synthetic-toml-shop-icon",
        },
      },
    };
    const site: SiteState & { type: "RandomSite" } = {
      id: parseSiteId("fixture-random-site"),
      type: "RandomSite",
      isEnhanced: true,
      isVisited: false,
    };
    const node: DreamscapeNode = {
      id: parseAtlasNodeId("fixture-node"),
      layer: LayerName.Four,
      indexInLayer: 0,
      dreamscapeId: testDreamscapeId("fixture-dreamscape"),
      sites: [site],
      position: { x: 0, y: 0 },
      state: "available",
      enhancedSiteType: "RandomSite",
      forwardIds: [],
      backwardIds: [],
      knownDreamsignId: null,
    };

    const view = buildRandomSiteView({
      sceneNode: node,
      site,
      runtime: {
        kind: "randomSite",
        offeredSiteTypes: ["Shop"],
        selectedSiteType: null,
      },
      guide: {
        id: sitesData.randomSite.guideId,
        name: "Fixture Guide",
        homeDreamscapeId: testDreamscapeId("fixture-dreamscape"),
        siteType: "RandomSite",
        portraitSource: "fixture-guide.png",
        dialogue: { site: [] },
        homeSpecialty: "Fixture specialty",
      },
      sitesData,
      guideLine: "Synthetic guide copy",
    });

    expect(view.guide.line).toBe("Synthetic guide copy");
    expect(view.choices[0].icon).toBe(sitesData.siteTypes.Shop.icon);
  });
});
import { parseSiteId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { testDreamscapeId } from "../../types/test-identities";
