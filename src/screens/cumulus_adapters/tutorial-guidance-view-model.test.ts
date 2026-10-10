import { describe, expect, it } from "vitest";
import {
  testCardName,
  testDreamwellCardName,
  testTutorialTriggerId,
  testCardId,
} from "../../types/test-identities";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import type {
  TutorialBattleFoldState,
  TutorialGuidanceMessage,
} from "../../rules/battle/fold";
import type { BattleCardInstance } from "../../battle/types";
import { buildBattleTutorialGuidanceView } from "./battle-tutorial-guidance-view-model";
import {
  parseBattleCardId,
  parsePresentationId,
  parseCardTutorialScreenKey,
  parseSiteId,
} from "../../types/identifiers";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { buildCardTutorialGuidanceView } from "./card-tutorial-guidance-view-model";
import type { JourneyState, SiteState } from "../../types/journey";
import type { TutorialSiteConfiguration } from "../../types/tutorial";
import { buildFirstVisitSiteTutorialView } from "./site-tutorial-view-model";

describe("battle-tutorial-guidance-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  function battleWithMessage(
    message: TutorialGuidanceMessage,
  ): TutorialBattleFoldState {
    return {
      tutorialPresentation: {
        id: "tutorial-guidance:support",
        kind: "tutorial-guidance",
        source: {
          kind: "dreamwell",
          cardId: testCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
          side: "player",
        },
        messages: [message],
        messageIndex: 0,
        continuation: { kind: "commands", commands: [] },
      },
      init: {
        dreamwellDeck: [
          {
            id: "03e4e701-4720-4278-8198-9b7e0514d4cf",
            name: testDreamwellCardName("Fixture Dreamwell"),
            renderedText: "Support.",
            energyAdded: 1,
            order: 1,
            cardNumber: 1,
            imageNumber: 1,
          },
        ],
        avatarSummary: {
          id: "bfc40414-5264-41bf-86e1-a0f41ee4f5b5",
          name: "Tensho",
          title: "Daimyo of Lacquered Fury",
          renderedText: "Avatar ability.",
          imageNumber: "0029",
        },
        enemyDescriptor: {
          id: "b99936ca-97f9-4930-af5a-fa9ef92557ef",
          name: "Threxan",
          subtitle: "the Resounding Wrath",
          imageNumber: "0025",
          portraitSeed: 1,
          abilityText: "Avatar ability.",
          dreamsigns: [],
          signatureCards: [],
        },
      },
    } as unknown as TutorialBattleFoldState;
  }

  describe("buildBattleTutorialGuidanceView", () => {
    it.each([
      {
        speaker: "mira" as const,
        speakerName: "Mira",
        portrait: { kind: "character-portrait", characterId: "mira" },
      },
      {
        speaker: "player" as const,
        speakerName: "Tensho",
        portrait: { kind: "avatar", imageNumber: "0029" },
      },
      {
        speaker: "enemy" as const,
        speakerName: "Threxan",
        portrait: { kind: "avatar", imageNumber: "0025" },
      },
    ])(
      "maps $speaker trigger speech to its authored speaker",
      ({ speaker, speakerName, portrait }) => {
        const view = buildBattleTutorialGuidanceView(
          battleWithMessage({
            triggerId: testTutorialTriggerId("support"),
            speaker,
            duration: 5,
            horizontalOffset: 24,
            verticalOffset: -20,
            bubbleWidth: 300,
            text: "Support helps the characters in front of it.",
          }),
        );

        expect(view).toMatchObject({
          dialogue: {
            portrait,
            portraitAlt: speakerName,
            speakerName,
            text: "Support helps the characters in front of it.",
          },
          horizontalOffset: 24,
          verticalOffset: -20,
          bubbleWidth: 300,
        });
      },
    );

    it("uses automatic opponent guidance as the card's reveal window", () => {
      const battleCardId = "enemy-card";
      const cardId = "229ab3a1-3720-41a2-924c-8fe112188f8e";
      const instance = {
        battleCardId: parseBattleCardId(battleCardId),
        owner: "enemy",
        controller: "enemy",
        sparkDelta: 0,
        staticSparkBonus: 0,
        status: {
          isExhausted: false,
          counters: 0,
          reclaimed: false,
          offering: false,
          ephemeral: false,
          veil: false,
          grantedVengeful: false,
          grantedAwakened: false,
        },
        markers: { isPrevented: false, isCopied: false },
        notes: [],
        provenance: {
          kind: "journey-deck",
          sourceBattleCardId: null,
          chosenSpark: null,
          chosenSubtype: null,
          createdAtTurnNumber: 1,
          createdAtSide: "enemy",
          createdAtMs: 0,
        },
        definition: {
          sourceDeckEntryId: null,
          cardId: testCardId(cardId),
          cardNumber: 520,
          name: testCardName("Synthetic opponent card"),
          battleCardKind: "character",
          subtype: "Musician",
          energyCost: 2,
          printedEnergyCost: 2,
          printedSpark: 2,
          isFast: false,
          reclaimCost: null,
          renderedText: "Support.",
          imageNumber: 520,
          transfiguration: null,
          isBane: false,
        },
      } as BattleCardInstance;
      const battle = battleWithMessage({
        triggerId: testTutorialTriggerId("support"),
        speaker: "mira",
        duration: 1,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 500,
        text: "Support helps the characters in front of it.",
      });
      battle.tutorialPresentation = {
        id: parsePresentationId("tutorial-guidance:support"),
        kind: "tutorial-guidance",
        source: {
          kind: "card",
          cardId: testCardId(cardId),
          battleCardId: parseBattleCardId(battleCardId),
          cardKind: "character",
          side: "enemy",
        },
        messages:
          battle.tutorialPresentation?.kind === "tutorial-guidance"
            ? battle.tutorialPresentation.messages
            : [],
        messageIndex: 0,
        continuation: {
          kind: "play-card",
          payload: { battleCardId: parseBattleCardId(battleCardId) },
          automatic: true,
        },
      };
      battle.board = {
        cardInstances: { [battleCardId]: instance },
      } as unknown as TutorialBattleFoldState["board"];

      expect(buildBattleTutorialGuidanceView(battle)).toMatchObject({
        duration: 2,
        source: {
          kind: "card",
          battleCardId: parseBattleCardId(battleCardId),
          model: { cardId: testCardId(cardId) },
        },
      });
    });

    it("maps Challenge guidance to a bubble without a companion card", () => {
      const battle = battleWithMessage({
        triggerId: testTutorialTriggerId("spark-tie"),
        speaker: "mira",
        duration: 5,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 500,
        text: "If spark values tie, both characters are dissolved.",
      });
      battle.tutorialPresentation = {
        id: parsePresentationId(
          "tutorial-guidance:challenge-resolved:player:3:F0:spark-tie",
        ),
        kind: "tutorial-guidance",
        source: {
          kind: "challenge",
          activeSide: "player",
          turnNumber: 3,
          slotId: "F0",
        },
        messages:
          battle.tutorialPresentation?.kind === "tutorial-guidance"
            ? battle.tutorialPresentation.messages
            : [],
        messageIndex: 0,
        continuation: { kind: "commands", commands: [] },
      };

      expect(buildBattleTutorialGuidanceView(battle)).toMatchObject({
        triggerId: testTutorialTriggerId("spark-tie"),
        duration: 5,
        source: { kind: "battle" },
      });
    });

    it("maps a phase-level trigger to a bubble without a companion card", () => {
      const battle = battleWithMessage({
        triggerId: testTutorialTriggerId("opponent-reposition-opportunity"),
        speaker: "mira",
        duration: 5,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 500,
        text: "Repositioning explanation.",
      });
      battle.tutorialPresentation = {
        id: parsePresentationId(
          "tutorial-guidance:opponent-reposition-opportunity:player:3",
        ),
        kind: "tutorial-guidance",
        source: {
          kind: "battle",
          activeSide: "player",
          turnNumber: 3,
        },
        messages:
          battle.tutorialPresentation?.kind === "tutorial-guidance"
            ? battle.tutorialPresentation.messages
            : [],
        messageIndex: 0,
        continuation: { kind: "commands", commands: [] },
      };

      expect(buildBattleTutorialGuidanceView(battle)).toMatchObject({
        triggerId: testTutorialTriggerId("opponent-reposition-opportunity"),
        duration: 5,
        source: { kind: "battle" },
      });
    });
  });
});

describe("card-tutorial-guidance-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  const CARD: CardData = {
    id: testCardId("card-a"),
    name: parseCardName("Fixture Card"),
    cardNumber: 1,
    cardType: "Character",
    subtype: "Warrior",
    isStarter: false,
    energyCost: 1,
    spark: 2,
    isFast: false,
    renderedText: "Support.",
    imageNumber: 1,
    artOwned: true,
  };

  describe("buildCardTutorialGuidanceView", () => {
    it("maps the shared presentation to Mira, the canonical card, and bubble settings", () => {
      const view = buildCardTutorialGuidanceView(
        {
          id: parsePresentationId("card-tutorial:fixture"),
          screenKey: parseCardTutorialScreenKey("journey:1:site:site-a"),
          cardId: CARD.id,
          triggerId: testTutorialTriggerId("support"),
          speaker: "mira",
          text: "Support helps the character in front.",
          duration: 5,
          horizontalOffset: 24,
          verticalOffset: -20,
          bubbleWidth: 420,
        },
        new Map([[CARD.cardNumber, CARD]]),
      );

      expect(view).toMatchObject({
        presentationId: parsePresentationId("card-tutorial:fixture"),
        triggerId: testTutorialTriggerId("support"),
        duration: 5,
        horizontalOffset: 24,
        verticalOffset: -20,
        bubbleWidth: 420,
        dialogue: {
          speakerName: "Mira",
          text: "Support helps the character in front.",
        },
        source: {
          kind: "journey-card",
          cardId: CARD.id,
          model: { cardId: CARD.id, displaySnapshot: CARD },
        },
      });
    });

    it("maps a site concept to viewport dialogue without a card source", () => {
      const view = buildCardTutorialGuidanceView(
        {
          id: parsePresentationId("card-tutorial:transfiguration"),
          screenKey: parseCardTutorialScreenKey(
            "journey:1:site:site-a:concept:transfiguration",
          ),
          cardId: null,
          triggerId: testTutorialTriggerId("transfiguration"),
          speaker: "mira",
          text: "Cards can be [yellow]transfigured[/yellow] to change their cost, spark, or abilities",
          duration: 5,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 500,
        },
        new Map(),
      );

      expect(view).toMatchObject({
        presentationId: parsePresentationId("card-tutorial:transfiguration"),
        triggerId: testTutorialTriggerId("transfiguration"),
        source: { kind: "journey-site" },
      });
    });
  });
});

describe("site-tutorial-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  const CONFIGURATION: TutorialSiteConfiguration = {
    speechBubble: {
      speaker: "mira",
      delay: 1,
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
      atlas: {
        nodes: {
          node: {
            id: "node",
            sites: [
              {
                id: parseSiteId("prior"),
                type: current.type,
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
    id: parseSiteId("revelation-a"),
    type: "DreamsignRevelation",
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
        delaySeconds: 1,
        horizontalOffset: 20,
        verticalOffset: -10,
        bubbleWidth: 600,
      });
    });

    it("maps the first Purge visit to the authored site tutorial", () => {
      const purge: SiteState = {
        id: parseSiteId("purge-a"),
        type: "Purge",
        isVisited: false,
        isEnhanced: false,
      };

      expect(
        buildFirstVisitSiteTutorialView(state(purge), "Purge", CONFIGURATION),
      ).toMatchObject({
        id: "run-a:first-visit:purge-a:Purge",
        model: { text: "Choose one [purple]Dreamsign[/purple]." },
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
});
