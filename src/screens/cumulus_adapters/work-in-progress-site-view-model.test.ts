import { describe, expect, it } from "vitest";
import type { DreamGuideContent } from "../../types/content";
import type { SiteState } from "../../types/journey";
import {
  buildWorkInProgressSiteView,
  isWorkInProgressSiteType,
  resolveWorkInProgressGuide,
} from "./work-in-progress-site-view-model";

const guides: readonly DreamGuideContent[] = [
  {
    id: "fixture-gambler",
    name: "Fixture Gambler",
    homeDreamscapeId: "fixture-dreamscape",
    siteType: "Gamble",
    dialog: ["A fixture greeting."],
    homeSpecialty: "Fixture specialty.",
  },
];

function site(
  type: "TemptingOffer" | "Gamble",
): SiteState & { type: "TemptingOffer" | "Gamble" } {
  return {
    id: `${type}-site`,
    type,
    isEnhanced: false,
    isVisited: false,
  };
}

describe("work-in-progress-site-view-model", () => {
  it("recognizes the two Cumulus work-in-progress site types", () => {
    expect(isWorkInProgressSiteType("TemptingOffer")).toBe(true);
    expect(isWorkInProgressSiteType("Gamble")).toBe(true);
    expect(isWorkInProgressSiteType("TemporalFork")).toBe(false);
  });

  it("builds the Tempting Offer fallback without depending on production TOML", () => {
    const view = buildWorkInProgressSiteView({
      sceneNode: null,
      site: site("TemptingOffer"),
      guide: null,
      guideLine: null,
    });

    expect(view).toMatchObject({
      siteType: "TemptingOffer",
      title: "Tempting Offer",
      isEnhanced: false,
      guide: {
        id: "maddox",
        name: "Maddox",
      },
    });
    expect(view.message).toContain("offer");
  });

  it("resolves the matching guide and uses explicit dialog when provided", () => {
    const guide = resolveWorkInProgressGuide(guides, "Gamble");
    const view = buildWorkInProgressSiteView({
      sceneNode: null,
      site: site("Gamble"),
      guide,
      guideLine: "A chosen greeting.",
    });

    expect(view).toMatchObject({
      siteId: "Gamble-site",
      siteType: "Gamble",
      title: "Gamble",
      isEnhanced: false,
      guide: {
        id: "fixture-gambler",
        name: "Fixture Gambler",
        line: "A chosen greeting.",
      },
    });
    expect(view.message).toContain("wager");
  });
});
