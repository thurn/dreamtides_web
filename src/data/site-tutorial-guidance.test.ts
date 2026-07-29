import { describe, expect, it } from "vitest";
import type { JourneyState, SiteState } from "../types/journey";
import { activeFirstVisitTutorialSite } from "./site-tutorial-guidance";

function site(id: string, type: SiteState["type"]): SiteState {
  return {
    id,
    type,
    data: {},
    isVisited: false,
    isEnhanced: false,
  };
}

function state(
  current: SiteState,
  visitedSites: readonly string[] = [],
  atlasVisitedSites: readonly string[] = visitedSites,
): JourneyState {
  const atlasVisited = new Set(atlasVisitedSites);
  const draft = {
    ...site("draft-a", "Draft"),
    isVisited: atlasVisited.has("draft-a"),
  };
  const revelation = {
    ...site("revelation-a", "DreamsignRevelation"),
    isVisited: atlasVisited.has("revelation-a"),
  };
  return {
    screen: { type: "site", siteId: current.id },
    visitedSites: [...visitedSites],
    atlas: {
      nodes: {
        node: {
          id: "node",
          sites: [draft, revelation, current],
        },
      },
    },
  } as unknown as JourneyState;
}

describe("activeFirstVisitTutorialSite", () => {
  it.each([
    ["Draft", "draft-a"],
    ["DreamsignRevelation", "revelation-a"],
  ] as const)("keeps the first %s visit eligible", (type, id) => {
    expect(activeFirstVisitTutorialSite(state(site(id, type)))).toEqual({
      siteId: id,
      siteType: type,
    });
  });

  it("suppresses later sites after a site of the same type was completed", () => {
    const later = site("draft-b", "Draft");
    expect(
      activeFirstVisitTutorialSite(state(later, ["draft-a"])),
    ).toBeNull();
  });

  it("stays suppressed after dreamscape travel resets visitedSites", () => {
    const later = site("draft-b", "Draft");
    expect(
      activeFirstVisitTutorialSite(state(later, [], ["draft-a"])),
    ).toBeNull();
  });

  it("does not let a visited site of another type suppress the tutorial", () => {
    const later = site("draft-b", "Draft");
    expect(
      activeFirstVisitTutorialSite(state(later, ["revelation-a"])),
    ).toEqual({ siteId: "draft-b", siteType: "Draft" });
  });

  it("ignores sites without authored first-visit guidance", () => {
    expect(
      activeFirstVisitTutorialSite(state(site("shop-a", "Shop"))),
    ).toBeNull();
  });
});
