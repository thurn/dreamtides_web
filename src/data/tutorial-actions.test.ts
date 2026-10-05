import { describe, expect, it } from "vitest";
import { parseTutorialConfiguration, parseTutorialActions, parseTutorialBattleConfiguration } from "./tutorial-actions";
import { makeTutorialBattleConfiguration, TEST_TUTORIAL_CARD_CONSTANTS } from "../testing/tutorial-configuration-fixture";
import { testCardId, testDreamwellCardId, testTutorialActionId, testTutorialAiActionOverrideId } from "../types/test-identities";
import type { JourneyState, SiteState } from "../types/journey";
import { activeFirstVisitTutorialSite } from "./site-tutorial-guidance";
import { parseSiteId } from "../types/identifiers";
import { parseTutorialInstructionMarkup, tutorialInstructionPlainText } from "./tutorial-instruction-markup";
import { tutorialSpeechBubbleDelaySeconds } from "./tutorial-speech-bubble";

describe("tutorial-actions", () => {
  const ACTIONS_RESPONSE = {
    contentHash: "0".repeat(64),
    foldHash: "1".repeat(64),
    journeyStart: {
      speechBubble: {
        speaker: "mira",
        horizontalOffset: 40,
        verticalOffset: 0,
        bubbleWidth: 550,
        text: "Choose a [purple]Avatar[/purple].",
      },
    },
    dreamscape: {
      speechBubble: {
        speaker: "mira",
        delay: 2,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
        text: "Visit [purple]Dream Sites[/purple].",
      },
    },
    atlas: {
      speechBubble: {
        speaker: "mira",
        delay: 1,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
        text: "Choose the next [purple]dream[/purple].",
      },
    },
    draft: {
      speechBubble: {
        speaker: "mira",
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 600,
        text: "Draft a card.",
      },
    },
    purge: {
      speechBubble: {
        speaker: "mira",
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 600,
        text: "Purge a card.",
      },
    },
    dreamsignRevelation: {
      speechBubble: {
        speaker: "mira",
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 600,
        text: "Choose a Dreamsign.",
      },
    },
    battleStart: {
      firstBattle: {
        speechBubble: {
          speaker: "mira",
          delay: 1,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "Review the first opponent.",
        },
      },
      secondBattle: {
        speechBubble: {
          speaker: "mira",
          delay: 1,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "Prepare for the second battle.",
        },
      },
    },
    actions: [
      {
        id: testTutorialActionId("welcome"),
        action: "display-speech-bubble",
        speechBubble: {
          speaker: "mira",
          duration: 3,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "Welcome, Dreamer.",
        },
        wait: 3,
      },
    ],
    triggers: [],
    battle: makeTutorialBattleConfiguration(),
  };

  describe("parseTutorialConfiguration", () => {
    it("accepts a well-formed tutorial document", () => {
      expect(parseTutorialConfiguration(ACTIONS_RESPONSE).actions).toEqual(
        ACTIONS_RESPONSE.actions,
      );
    });
  });

  describe("parseTutorialActions", () => {
    it("preserves an Avatar speech target and rejects unknown speakers", () => {
      expect(
        parseTutorialActions([
          {
            id: testTutorialActionId("enemy-taunt"),
            action: "display-speech-bubble",
            speechBubble: {
              speaker: "enemy",
              delay: 1,
              duration: 3,
              horizontalOffset: 20,
              verticalOffset: 0,
              bubbleWidth: 450,
              text: "For the [yellow]Abyss[/yellow] and its [purple]events[purple]!",
            },
            wait: 3,
          },
        ]),
      ).toEqual([
        {
          id: testTutorialActionId("enemy-taunt"),
          action: "display-speech-bubble",
          speechBubble: {
            speaker: "enemy",
            delay: 1,
            duration: 3,
            horizontalOffset: 20,
            verticalOffset: 0,
            bubbleWidth: 450,
            text: "For the [yellow]Abyss[/yellow] and its [purple]events[purple]!",
          },
          wait: 3,
        },
      ]);
      expect(() =>
        parseTutorialActions([
          {
            id: testTutorialActionId("bad-speaker"),
            action: "display-speech-bubble",
            speechBubble: { speaker: "spectator", text: "No." },
            wait: 1,
          },
        ]),
      ).toThrow(/Mira, the player, or the enemy/u);
      expect(() =>
        parseTutorialActions([
          {
            id: testTutorialActionId("bad-bubble-width"),
            action: "display-speech-bubble",
            speechBubble: { bubbleWidth: 750, text: "Too wide." },
            wait: 1,
          },
        ]),
      ).toThrow(/speech bubble width from 300 to 700 pixels/u);
      expect(() =>
        parseTutorialActions([
          {
            id: testTutorialActionId("bad-duration"),
            action: "display-speech-bubble",
            speechBubble: { duration: -1, text: "Too brief." },
            wait: 1,
          },
        ]),
      ).toThrow(/non-negative speech bubble duration/u);
      expect(() =>
        parseTutorialActions([
          {
            id: testTutorialActionId("bad-speech-markup"),
            action: "display-speech-bubble",
            speechBubble: { text: "A [yellow]blocked character." },
            wait: 1,
          },
        ]),
      ).toThrow(/unclosed yellow highlight/u);
    });

    it("preserves a UUID-backed opponent reposition and rejects display names", () => {
      expect(
        parseTutorialActions([
          {
            id: testTutorialActionId("opponent-character-advance"),
            action: "reposition-opponent-character",
            cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
            wait: 0,
          },
        ]),
      ).toEqual([
        {
          id: testTutorialActionId("opponent-character-advance"),
          action: "reposition-opponent-character",
          cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
          wait: 0,
        },
      ]);
      expect(() =>
        parseTutorialActions([
          {
            id: testTutorialActionId("named-opponent"),
            action: "reposition-opponent-character",
            cardId: "Twilight Troubadour",
            wait: 0,
          },
        ]),
      ).toThrow(/by UUID/u);
    });
  });

  describe("parseTutorialBattleConfiguration", () => {
    it("preserves UUID-authored draw order and rejects invalid entries", () => {
      const battle = makeTutorialBattleConfiguration({
        tutorialCardConstants: {
          ...TEST_TUTORIAL_CARD_CONSTANTS,
          tutorialDreamwellCardId: testDreamwellCardId(
            "7171ff89-ebe4-42d0-8863-9b4b0531cad2",
          ),
        },
        starterDeck: [
          {
            cardId: TEST_TUTORIAL_CARD_CONSTANTS.tutorialPlayerCharacterCardId,
            copies: 3,
          },
          {
            cardId: TEST_TUTORIAL_CARD_CONSTANTS.handoffEnemyCharacterCardId,
            copies: 3,
          },
          {
            cardId: testCardId("5a980eff-6ec7-44d8-9977-b98e66bbc2c8"),
            copies: 3,
          },
          {
            cardId: testCardId("a526fa7b-5cef-4da9-a3f2-27ee0bd9b481"),
            copies: 3,
          },
        ],
        forcedPlayerDraws: [testCardId("5a980eff-6ec7-44d8-9977-b98e66bbc2c8")],
        forcedEnemyDraws: [testCardId("a526fa7b-5cef-4da9-a3f2-27ee0bd9b481")],
        dreamwellDraws: [
          testDreamwellCardId("7171ff89-ebe4-42d0-8863-9b4b0531cad2"),
          TEST_TUTORIAL_CARD_CONSTANTS.tutorialDreamwellCardId,
        ],
        aiActionOverrides: [
          {
            id: testTutorialAiActionOverrideId("play-card-after-dreamwell"),
            trigger: {
              kind: "after-dreamwell",
              side: "enemy",
              cardId: testDreamwellCardId("7171ff89-ebe4-42d0-8863-9b4b0531cad2"),
            },
            action: {
              kind: "play-card",
              cardId: testCardId("a526fa7b-5cef-4da9-a3f2-27ee0bd9b481"),
            },
          },
        ],
      });
      expect(parseTutorialBattleConfiguration(battle)).toEqual(battle);
      expect(() =>
        parseTutorialBattleConfiguration({
          ...battle,
          forcedEnemyDraws: ["not-a-uuid"],
        }),
      ).toThrow(/array of card UUIDs/u);
      expect(() =>
        parseTutorialBattleConfiguration({
          ...battle,
          dreamwellDraws: [battle.dreamwellDraws[0], battle.dreamwellDraws[0]],
        }),
      ).toThrow(/must not repeat/u);
      expect(() =>
        parseTutorialBattleConfiguration({
          ...battle,
          aiActionOverrides: [
            battle.aiActionOverrides[0],
            battle.aiActionOverrides[0],
          ],
        }),
      ).toThrow(/duplicated/u);
      expect(() =>
        parseTutorialBattleConfiguration({
          ...battle,
          aiActionOverrides: [
            {
              ...battle.aiActionOverrides[0],
              trigger: {
                kind: "after-dreamwell",
                side: "player",
                cardId: battle.dreamwellDraws[0],
              },
            },
          ],
        }),
      ).toThrow(/enemy after-dreamwell/u);
      expect(() =>
        parseTutorialBattleConfiguration({
          ...battle,
          aiActionOverrides: [
            {
              ...battle.aiActionOverrides[0],
              trigger: {
                ...battle.aiActionOverrides[0].trigger,
                cardId: testCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
              },
            },
          ],
        }),
      ).toThrow(/must appear in dreamwellDraws/u);
      expect(() =>
        parseTutorialBattleConfiguration({
          ...battle,
          aiActionOverrides: [
            {
              ...battle.aiActionOverrides[0],
              action: {
                kind: "play-card",
                cardId: testCardId("00000000-0000-4000-8000-000000000101"),
              },
            },
          ],
        }),
      ).toThrow(/registered semantic play automation/u);
    });

    it("requires distinct loading-screen and handoff enemy characters", () => {
      const battle = makeTutorialBattleConfiguration({
        tutorialCardConstants: {
          ...TEST_TUTORIAL_CARD_CONSTANTS,
          loadingScreenCharacterCardId:
            TEST_TUTORIAL_CARD_CONSTANTS.handoffEnemyCharacterCardId,
        },
      });

      expect(() => parseTutorialBattleConfiguration(battle)).toThrow(
        /loading-screen and handoff enemy characters/u,
      );
    });
  });
});

describe("site-tutorial-guidance", () => {
  function site(idSeed: string, type: SiteState["type"]): SiteState {
    return {
      id: parseSiteId(idSeed),
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
    const purge = {
      ...site("purge-a", "Purge"),
      isVisited: atlasVisited.has("purge-a"),
    };
    return {
      screen: { type: "site", siteId: current.id },
      visitedSites: [...visitedSites],
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

    it("stays suppressed after dreamscape travel resets visitedSites", () => {
      const later = site("draft-b", "Draft");
      expect(
        activeFirstVisitTutorialSite(state(later, [], ["draft-a"])),
      ).toBeNull();
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
