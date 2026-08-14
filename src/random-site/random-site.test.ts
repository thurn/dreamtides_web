import { describe, expect, it } from "vitest";
import type { SiteState } from "../types/journey";
import { isRandomSiteMetadata, materializeRandomSite } from "./random-site";
import { asSiteId } from "../types/identifiers";
import { asGuideId } from "../types/identifiers";

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
    const site: SiteState = {
      id: asSiteId("fixture-random-site"),
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
        asGuideId("fixture-random-guide"),
      ),
    ).toMatchObject({
      type: "Exploration",
      randomSite: { presentingGuideId: "fixture-random-guide" },
    });
  });
});
