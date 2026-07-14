import { describe, expect, it } from "vitest";
import type { DreamGuideContent } from "../../types/content";
import type { SiteState } from "../../types/quest";
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
  type: "Gamble" | "TemporalFork",
): SiteState & { type: "Gamble" | "TemporalFork" } {
  return {
    id: `${type}-site`,
    type,
    isEnhanced: type === "TemporalFork",
    isVisited: false,
  };
}

describe("work-in-progress-site-view-model", () => {
  it("recognizes only the two Cumulus work-in-progress site types", () => {
    expect(isWorkInProgressSiteType("Gamble")).toBe(true);
    expect(isWorkInProgressSiteType("TemporalFork")).toBe(true);
    expect(isWorkInProgressSiteType("TemptingOffer")).toBe(false);
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

  it("builds the Temporal Fork fallback without depending on production TOML", () => {
    const view = buildWorkInProgressSiteView({
      sceneNode: null,
      site: site("TemporalFork"),
      guide: null,
      guideLine: null,
    });

    expect(view).toMatchObject({
      siteType: "TemporalFork",
      title: "Temporal Fork",
      isEnhanced: true,
      guide: {
        id: "layaway",
        name: '"Layaway"',
      },
    });
    expect(view.message).toContain("fork in time");
  });
});
