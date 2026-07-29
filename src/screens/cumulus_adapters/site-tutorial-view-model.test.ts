import { describe, expect, it } from "vitest";
import type { JourneyState, SiteState } from "../../types/journey";
import type { TutorialSiteConfiguration } from "../../types/tutorial";
import { buildFirstVisitSiteTutorialView } from "./site-tutorial-view-model";

const CONFIGURATION: TutorialSiteConfiguration = {
  speechBubble: {
    speaker: "mira",
    horizontalOffset: 20,
    verticalOffset: -10,
    bubbleWidth: 600,
    text: "Choose one [purple]Dreamsign[/purple].",
  },
};

function state(
  current: SiteState,
  visitedSites: readonly string[] = [],
): JourneyState {
  return {
    runId: "run-a",
    seed: "seed-a",
    screen: { type: "site", siteId: current.id },
    visitedSites: [...visitedSites],
    atlas: {
      nodes: {
        node: {
          id: "node",
          sites: [
            {
              id: "prior",
              type: current.type,
              data: {},
              isVisited: visitedSites.includes("prior"),
              isEnhanced: false,
            },
            current,
          ],
        },
      },
    },
  } as unknown as JourneyState;
}

const revelation: SiteState = {
  id: "revelation-a",
  type: "DreamsignRevelation",
  data: {},
  isVisited: false,
  isEnhanced: false,
};

describe("buildFirstVisitSiteTutorialView", () => {
  it("maps authored speech-bubble controls to persistent Mira guidance", () => {
    expect(
      buildFirstVisitSiteTutorialView(
        state(revelation),
        "DreamsignRevelation",
        CONFIGURATION,
      ),
    ).toMatchObject({
      id: "run-a:first-visit:revelation-a:DreamsignRevelation",
      model: {
        portraitAlt: "Mira",
        speakerName: "Mira",
        text: "Choose one [purple]Dreamsign[/purple].",
      },
      horizontalOffset: 20,
      verticalOffset: -10,
      bubbleWidth: 600,
    });
  });

  it("suppresses the guidance after a site of the same type was visited", () => {
    expect(
      buildFirstVisitSiteTutorialView(
        state(revelation, ["prior"]),
        "DreamsignRevelation",
        CONFIGURATION,
      ),
    ).toBeUndefined();
  });
});
