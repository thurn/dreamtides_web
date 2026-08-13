import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";

expect.addEqualityTesters([localizedStringSourceEquality]);
import type {
  BattleFoldState,
  TutorialGuidanceMessage,
} from "../../rules/battle/fold";
import type { BattleCardInstance } from "../../battle/types";
import { buildBattleTutorialGuidanceView } from "./battle-tutorial-guidance-view-model";

function battleWithMessage(message: TutorialGuidanceMessage): BattleFoldState {
  return {
    tutorialPresentation: {
      id: "tutorial-guidance:support",
      kind: "tutorial-guidance",
      source: {
        kind: "dreamwell",
        cardId: "03e4e701-4720-4278-8198-9b7e0514d4cf",
        side: "player",
      },
      messages: [message],
      messageIndex: 0,
      continuation: { kind: "commands", commands: [] },
    },
    init: {
      dreamwellDeck: [{
        id: "03e4e701-4720-4278-8198-9b7e0514d4cf",
        name: "Fixture Dreamwell",
        renderedText: "Support.",
        energyAdded: 1,
        order: 1,
        cardNumber: 1,
        imageNumber: 1,
      }],
      dreamAvatarSummary: {
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
  } as unknown as BattleFoldState;
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
      portrait: { kind: "dreamAvatar", imageNumber: "0029" },
    },
    {
      speaker: "enemy" as const,
      speakerName: "Threxan",
      portrait: { kind: "dreamAvatar", imageNumber: "0025" },
    },
  ])("maps $speaker trigger speech to its authored speaker", ({
    speaker,
    speakerName,
    portrait,
  }) => {
    const view = buildBattleTutorialGuidanceView(
      battleWithMessage({
        triggerId: "support",
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
  });

  it("uses automatic opponent guidance as the card's reveal window", () => {
    const battleCardId = "enemy-card";
    const cardId = "229ab3a1-3720-41a2-924c-8fe112188f8e";
    const instance = {
      battleCardId,
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
        cardId,
        cardNumber: 520,
        name: "Synthetic opponent card",
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
      triggerId: "support",
      speaker: "mira",
      duration: 1,
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 500,
      text: "Support helps the characters in front of it.",
    });
    battle.tutorialPresentation = {
      id: "tutorial-guidance:support",
      kind: "tutorial-guidance",
      source: {
        kind: "card",
        cardId,
        battleCardId,
        cardKind: "character",
        side: "enemy",
      },
      messages: battle.tutorialPresentation?.kind === "tutorial-guidance"
        ? battle.tutorialPresentation.messages
        : [],
      messageIndex: 0,
      continuation: {
        kind: "play-card",
        payload: { battleCardId },
        automatic: true,
      },
    };
    battle.board = {
      cardInstances: { [battleCardId]: instance },
    } as unknown as BattleFoldState["board"];

    expect(buildBattleTutorialGuidanceView(battle)).toMatchObject({
      duration: 2,
      source: {
        kind: "card",
        battleCardId,
        model: { cardId },
      },
    });
  });

  it("maps Challenge guidance to a bubble without a companion card", () => {
    const battle = battleWithMessage({
      triggerId: "spark-tie",
      speaker: "mira",
      duration: 5,
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 500,
      text: "If spark values tie, both characters are dissolved.",
    });
    battle.tutorialPresentation = {
      id: "tutorial-guidance:challenge-resolved:player:3:F0:spark-tie",
      kind: "tutorial-guidance",
      source: {
        kind: "challenge",
        activeSide: "player",
        turnNumber: 3,
        slotId: "F0",
      },
      messages: battle.tutorialPresentation?.kind === "tutorial-guidance"
        ? battle.tutorialPresentation.messages
        : [],
      messageIndex: 0,
      continuation: { kind: "commands", commands: [] },
    };

    expect(buildBattleTutorialGuidanceView(battle)).toMatchObject({
      triggerId: "spark-tie",
      duration: 5,
      source: { kind: "battle" },
    });
  });

  it("maps a phase-level trigger to a bubble without a companion card", () => {
    const battle = battleWithMessage({
      triggerId: "opponent-reposition-opportunity",
      speaker: "mira",
      duration: 5,
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 500,
      text: "Repositioning explanation.",
    });
    battle.tutorialPresentation = {
      id: "tutorial-guidance:opponent-reposition-opportunity:player:3",
      kind: "tutorial-guidance",
      source: {
        kind: "battle",
        activeSide: "player",
        turnNumber: 3,
      },
      messages: battle.tutorialPresentation?.kind === "tutorial-guidance"
        ? battle.tutorialPresentation.messages
        : [],
      messageIndex: 0,
      continuation: { kind: "commands", commands: [] },
    };

    expect(buildBattleTutorialGuidanceView(battle)).toMatchObject({
      triggerId: "opponent-reposition-opportunity",
      duration: 5,
      source: { kind: "battle" },
    });
  });
});
