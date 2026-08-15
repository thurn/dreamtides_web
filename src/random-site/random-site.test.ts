import { describe, expect, it } from "vitest";
import type { SiteState } from "../types/journey";
import { isRandomSiteMetadata, materializeRandomSite } from "./random-site";
import { parseSiteId } from "../types/identifiers";
import { testGuideId } from "../types/test-identities";

describe("Random Site metadata", () => {
  it("requires at least two distinct routed candidates for a home choice", () => {
    expect(
      isRandomSiteMetadata({
        mode: "homeChoice",
        candidateSiteTypes: ["Shop"],
      }),
    ).toBe(false);
    expect(
      isRandomSiteMetadata({
        mode: "homeChoice",
        candidateSiteTypes: ["Shop", "Purge"],
      }),
    ).toBe(true);
    expect(
      isRandomSiteMetadata({
        mode: "homeChoice",
        candidateSiteTypes: ["Shop", "Essence"],
      }),
    ).toBe(false);
    expect(
      isRandomSiteMetadata({
        mode: "single",
        candidateSiteTypes: ["Reward"],
        destinationSiteType: "Reward",
      }),
    ).toBe(false);
  });

  it("persists the configured presenting guide in Random Site metadata", () => {
    const guideId = testGuideId("fixture-random-guide");
    const site: SiteState = {
      id: parseSiteId("fixture-random-site"),
      type: "RandomSite",
      isEnhanced: true,
      isVisited: false,
      randomSite: {
        mode: "single",
        candidateSiteTypes: ["Exploration"],
        destinationSiteType: "Exploration",
      },
    };
    expect(
      materializeRandomSite(
        site,
        "Exploration",
        guideId,
      ),
    ).toMatchObject({
      type: "Exploration",
      randomSite: { presentingGuideId: guideId },
    });
  });
});
