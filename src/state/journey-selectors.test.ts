import { describe, expect, it } from "vitest";
import type { JourneyState } from "../types/journey";
import { selectCurrentSite } from "./journey-selectors";

function state(currentDreamscape: string | null): JourneyState {
  return {
    currentDreamscape,
    atlas: {
      nodes: {
        current: {
          id: "current",
          sites: [
            {
              id: "exploration",
              type: "Exploration",
              isEnhanced: false,
              isVisited: false,
            },
            {
              id: "augury",
              type: "DreamAugury",
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
      "exploration",
      "Exploration",
    );
    expect(selected?.node.id).toBe("current");
    expect(selected?.site.type).toBe("Exploration");
    expect(
      selectCurrentSite(state("current"), "exploration", "DreamAugury"),
    ).toBeNull();
  });

  it("does not select sites outside an active dreamscape", () => {
    expect(selectCurrentSite(state(null), "augury", "DreamAugury")).toBeNull();
  });
});
