import { describe, expect, it } from "vitest";
import type { JourneyState } from "../types/journey";
import { selectCurrentSite } from "./journey-selectors";
import { parseSiteId } from "../types/identifiers";

function state(currentDreamscape: string | null): JourneyState {
  return {
    currentDreamscape,
    atlas: {
      nodes: {
        current: {
          id: "current",
          sites: [
            {
              id: parseSiteId("exploration"),
              type: "Exploration",
              isEnhanced: false,
              isVisited: false,
            },
            {
              id: parseSiteId("augury"),
              type: "Augury",
              isEnhanced: true,
              isVisited: false,
            },
          ],
        },
      },
    },
  } as unknown as JourneyState;
}

describe("selectCurrentSite", () => {
  it("returns a site with its current node only when id and type match", () => {
    const selected = selectCurrentSite(
      state("current"),
      parseSiteId("exploration"),
      "Exploration",
    );
    expect(selected?.node.id).toBe("current");
    expect(selected?.site.type).toBe("Exploration");
    expect(
      selectCurrentSite(state("current"), parseSiteId("exploration"), "Augury"),
    ).toBeNull();
  });

  it("does not select sites outside an active dreamscape", () => {
    expect(
      selectCurrentSite(state(null), parseSiteId("augury"), "Augury"),
    ).toBeNull();
  });
});
