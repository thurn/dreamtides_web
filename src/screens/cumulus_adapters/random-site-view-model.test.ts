import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";
import { resolveSource } from "../../runtime/localization/runtime";

expect.addEqualityTesters([localizedStringSourceEquality]);
import { MINIMAL_SITES_DATA } from "../../__test-helpers__/atlas-fixtures";
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
      id: asSiteId("fixture-random-site"),
      type: "RandomSite",
      isEnhanced: true,
      isVisited: false,
    };
    const node: DreamscapeNode = {
      id: asAtlasNodeId("fixture-node"),
      layer: LayerName.Four,
      indexInLayer: 0,
      dreamscapeId: asDreamscapeId("fixture-dreamscape"),
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
        homeDreamscapeId: asDreamscapeId("fixture-dreamscape"),
        siteType: "RandomSite",
        portraitSource: "fixture-guide.png",
        dialogue: { site: [] },
        homeSpecialty: "Fixture specialty",
      },
      sitesData,
      guideLine: assertLocalized("Synthetic TOML guide copy"),
    });

    expect(resolveSource(view.guide.line)).toBe("Synthetic TOML guide copy");
    expect(view.choices[0].icon).toBe(sitesData.siteTypes.Shop.icon);
  });
});
import { assertLocalized } from "@trox/runtime";
import { asSiteId } from "../../types/identifiers";
import { asAtlasNodeId } from "../../types/identifiers";
import { asDreamscapeId } from "../../types/identifiers";
