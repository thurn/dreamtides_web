import { describe, expect, it } from "vitest";
import type { JourneyState, SiteState } from "../types/journey";
import { activeFirstVisitTutorialSite } from "./site-tutorial-guidance";
import { parseSiteId } from "../types/identifiers";
import {
  parseTutorialInstructionMarkup,
  tutorialInstructionPlainText,
} from "./tutorial-instruction-markup";
import { tutorialSpeechBubbleDelaySeconds } from "./tutorial-speech-bubble";

describe("site-tutorial-guidance", () => {
  function site(idSeed: string, type: SiteState["type"]): SiteState {
    return {
      id: parseSiteId(idSeed),
      type,
      isVisited: false,
      isEnhanced: false,
    };
  }

  function state(
    current: SiteState,
    visitedSites: readonly string[] = [],
  ): JourneyState {
    const atlasVisited = new Set(visitedSites);
    const draft = {
      ...site("draft-a", "Draft"),
      isVisited: atlasVisited.has("draft-a"),
    };
    const revelation = {
      ...site("revelation-a", "DreamsignRevelation"),
      isVisited: atlasVisited.has("revelation-a"),
    };
    const purge = {
      ...site("purge-a", "Purge"),
      isVisited: atlasVisited.has("purge-a"),
    };
    return {
      screen: { type: "site", siteId: current.id },
      atlas: {
        nodes: {
          node: {
            id: "node",
            sites: [draft, purge, revelation, current],
          },
        },
      },
    } as unknown as JourneyState;
  }

  describe("activeFirstVisitTutorialSite", () => {
    it.each([
      ["Draft", "draft-a"],
      ["Purge", "purge-a"],
      ["DreamsignRevelation", "revelation-a"],
    ] as const)("keeps the first %s visit eligible", (type, id) => {
      expect(activeFirstVisitTutorialSite(state(site(id, type)))).toEqual({
        siteId: parseSiteId(id),
        siteType: type,
      });
    });

    it("suppresses later sites after a site of the same type was completed", () => {
      const later = site("draft-b", "Draft");
      expect(activeFirstVisitTutorialSite(state(later, ["draft-a"]))).toBeNull();
    });

    it("retires the first Draft tutorial after its first persisted pick", () => {
      const current = site("draft-a", "Draft");
      expect(
        activeFirstVisitTutorialSite({
          ...state(current),
          draftState: {
            activeSiteId: current.id,
            sitePicksCompleted: 1,
          },
        } as unknown as JourneyState),
      ).toBeNull();
    });

    it("does not let a visited site of another type suppress the tutorial", () => {
      const later = site("draft-b", "Draft");
      expect(
        activeFirstVisitTutorialSite(state(later, ["revelation-a"])),
      ).toEqual({ siteId: parseSiteId("draft-b"), siteType: "Draft" });
    });

    it("ignores sites without authored first-visit guidance", () => {
      expect(
        activeFirstVisitTutorialSite(state(site("shop-a", "Shop"))),
      ).toBeNull();
    });
  });
});

describe("tutorial-instruction-markup", () => {
  describe("tutorial instruction markup", () => {
    it("parses multiple exact yellow spans without highlighting matching plain words", () => {
      const source =
        "Position characters to [yellow]challenge[/yellow], or [yellow]block[/yellow] a challenger.";

      expect(parseTutorialInstructionMarkup(source)).toEqual([
        {
          spans: [
            { text: "Position characters to " },
            { text: "challenge", highlight: "yellow" },
            { text: ", or " },
            { text: "block", highlight: "yellow" },
            { text: " a challenger." },
          ],
        },
      ]);
      expect(tutorialInstructionPlainText(source)).toBe(
        "Position characters to challenge, or block a challenger.",
      );
    });

    it("parses event-frame purple spans using paired purple tags", () => {
      const source =
        "An [purple]event[purple] card has a one-time effect, and then is sent to the void.";

      expect(parseTutorialInstructionMarkup(source)).toEqual([
        {
          spans: [
            { text: "An " },
            { text: "event", highlight: "purple" },
            {
              text: " card has a one-time effect, and then is sent to the void.",
            },
          ],
        },
      ]);
      expect(tutorialInstructionPlainText(source)).toBe(
        "An event card has a one-time effect, and then is sent to the void.",
      );
    });

    it("preserves blank-line paragraph boundaries", () => {
      expect(
        parseTutorialInstructionMarkup(
          "First [yellow]instruction[/yellow].\n\nSecond instruction.",
        ),
      ).toEqual([
        {
          spans: [
            { text: "First " },
            { text: "instruction", highlight: "yellow" },
            { text: "." },
          ],
        },
        { spans: [{ text: "Second instruction." }] },
      ]);
    });
  });
});

describe("tutorial-speech-bubble", () => {
  describe("tutorialSpeechBubbleDelaySeconds", () => {
    it("resolves scalar and event-specific delays without leaking between events", () => {
      expect(tutorialSpeechBubbleDelaySeconds({ delay: 1 })).toBe(1);
      const trigger = { delay: { "card-seen": 1 } } as const;
      expect(tutorialSpeechBubbleDelaySeconds(trigger, "card-seen")).toBe(1);
      expect(tutorialSpeechBubbleDelaySeconds(trigger, "card-play")).toBe(0);
      expect(tutorialSpeechBubbleDelaySeconds(trigger, "dreamwell-resolve")).toBe(
        0,
      );
    });
  });
});
