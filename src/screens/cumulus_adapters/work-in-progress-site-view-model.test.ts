import { describe, expect, it } from "vitest";
import type { DreamGuideContent } from "../../types/content";
import type { SiteState } from "../../types/journey";
import {
  buildWorkInProgressSiteView,
  isWorkInProgressSiteType,
  resolveWorkInProgressGuide,
} from "./work-in-progress-site-view-model";

function site(
  type: "TemptingOffer",
): SiteState & { type: "TemptingOffer" } {
  return {
    id: `${type}-site`,
    type,
    isEnhanced: false,
    isVisited: false,
  };
}

describe("work-in-progress-site-view-model", () => {
  it("recognizes the remaining Cumulus work-in-progress site type", () => {
    expect(isWorkInProgressSiteType("TemptingOffer")).toBe(true);
    expect(isWorkInProgressSiteType("Gamble")).toBe(false);
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
    const guides: readonly DreamGuideContent[] = [
      {
        id: "fixture-bargainer",
        name: "Fixture Bargainer",
        homeDreamscapeId: "fixture-dreamscape",
        siteType: "TemptingOffer",
        dialog: ["A fixture greeting."],
        homeSpecialty: "Fixture specialty.",
      },
    ];
    const guide = resolveWorkInProgressGuide(guides, "TemptingOffer");
    const view = buildWorkInProgressSiteView({
      sceneNode: null,
      site: site("TemptingOffer"),
      guide,
      guideLine: "A chosen greeting.",
    });

    expect(view).toMatchObject({
      siteId: "TemptingOffer-site",
      siteType: "TemptingOffer",
      title: "Tempting Offer",
      isEnhanced: false,
      guide: {
        id: "fixture-bargainer",
        name: "Fixture Bargainer",
        line: "A chosen greeting.",
      },
    });
    expect(view.message).toContain("offer");
  });
});
