// Shared fixtures for the gamble site view model tests: the view builder
// over the gamble and transfiguration fixtures, the guide, and the site.
import { gambleFixture } from "../../testing/gamble-fixture";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import type { DreamGuideContent } from "../../types/content";
import type { SiteState } from "../../types/journey";
import { buildGambleSiteView as buildGambleSiteViewImpl } from "./gamble-site-view-model";
import { parseSiteId } from "../../types/identifiers";
import { testDreamscapeId, testGuideArtKey, testGuideId } from "../../types/test-identities";

export const buildGambleSiteView = (
  params: Omit<
    Parameters<typeof buildGambleSiteViewImpl>[0],
    "gambleData" | "transfigurationData"
  >,
) =>
  buildGambleSiteViewImpl({
    ...params,
    gambleData: gambleFixture(),
    transfigurationData: transfigurationFixture(),
  });

export const GUIDE_LINE_SOURCE = "Fixture game line.";

export const GUIDE = {
  id: testGuideId("fixture-gamble-guide"),
  name: "Fixture Gamble Guide",
  homeDreamscapeId: testDreamscapeId("fixture-home"),
  siteType: "Gamble",
  portraitSource: "fixture-guide.png",
  artKey: testGuideArtKey("fixture-guide"),
  headTargetX: 0.6,
  dialogue: { site: [GUIDE_LINE_SOURCE] },
  homeSpecialty: "Fixture specialty.",
} satisfies DreamGuideContent;

export const GAMBLE_SITE: SiteState & { type: "Gamble" } = {
  id: parseSiteId("fixture-gamble-site"),
  type: "Gamble",
  isEnhanced: false,
  isVisited: false,
};
