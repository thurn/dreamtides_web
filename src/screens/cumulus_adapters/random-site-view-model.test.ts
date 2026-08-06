import { describe, expect, it } from "vitest";
import { makeSyntheticAtlasData } from "../../__test-helpers__/atlas-fixtures";
import { LayerName } from "../../types/layer-name";
import type { DreamscapeNode, SiteState } from "../../types/journey";
import { buildRandomSiteView } from "./random-site-view-model";

describe("buildRandomSiteView", () => {
  it("projects Atlas-authored guide copy and site icons into the display model", () => {
    const atlasData = makeSyntheticAtlasData();
    atlasData.randomSite = {
      ...atlasData.randomSite,
      guideLine: "Synthetic TOML guide copy",
    };
    atlasData.siteTypes = {
      ...atlasData.siteTypes,
      Shop: {
        ...atlasData.siteTypes.Shop,
        icon: "synthetic-toml-shop-icon",
      },
    };
    const site: SiteState & { type: "RandomSite" } = {
      id: "fixture-random-site",
      type: "RandomSite",
      isEnhanced: true,
      isVisited: false,
    };
    const node: DreamscapeNode = {
      id: "fixture-node",
      layer: LayerName.Four,
      indexInLayer: 0,
      dreamscapeId: "fixture-dreamscape",
      biomeName: "Fixture Dreamscape",
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
        id: atlasData.randomSite.guideId,
        name: "Fixture Guide",
        homeDreamscapeId: "fixture-dreamscape",
        siteType: "RandomSite",
        dialog: [],
        homeSpecialty: "Fixture specialty",
      },
      atlasData,
    });

    expect(view.guide.line).toBe(atlasData.randomSite.guideLine);
    expect(view.choices[0].icon).toBe(atlasData.siteTypes.Shop.icon);
  });
});
