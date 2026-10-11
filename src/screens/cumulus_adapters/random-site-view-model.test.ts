import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import type { SiteState } from "../../types/journey";
import { parseSiteId } from "../../types/identifiers";
import {
  testDreamscapeId,
  testGuideArtKey,
} from "../../types/test-identities";
import { MINIMAL_SITES_DATA } from "../../testing/atlas-fixtures";
import { buildRandomSiteView } from "./random-site-view-model";

describe("random-site-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

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
      const view = buildRandomSiteView({
        scene: null,
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
          artKey: testGuideArtKey("fixture-guide"),
          headTargetX: 0.6,
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
});
