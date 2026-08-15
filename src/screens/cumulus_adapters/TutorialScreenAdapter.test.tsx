// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";
import { LocalizedString } from "@trox/runtime";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import { getLogEntries, resetLog } from "../../logging";
import { TutorialScreenAdapter } from "./TutorialScreenAdapter";
import type { TutorialScreenProps } from "../../cumulus/screens/TutorialScreen";
import type { AvatarContent } from "../../types/content";
import { makeTutorialConfiguration } from "../../test/tutorial-configuration-fixture";
import type { CardId } from "../../types/card-identity";
import { parseBattleId } from "../../types/identifiers";
import { parseTutorialRunId } from "../../types/identifiers";
import { parseBattleCardId } from "../../types/identifiers";
import { parseBattleSlotViewId } from "../../types/identifiers";
import {
  testCardId,
  testDreamwellCardId,
  testAvatarId,
  testJourneyId,
  testTutorialActionId,
  testTutorialRunId,
} from "../../types/test-identities";
import type { FrontDoorState } from "../../rules/fold-state";
import type {
  BattleCardId,
  BattleSlotViewId,
} from "../../types/identifiers";

const TUTORIAL_CONFIGURATION = makeTutorialConfiguration();

expect.addEqualityTesters([localizedStringSourceEquality]);

const AVATARS: readonly AvatarContent[] = [
  {
    id: testAvatarId("bfc40414-5264-41bf-86e1-a0f41ee4f5b5"),
    name: "Gunnar Deepforge",
    title: "The Hammer's Echo",
    renderedText: "Player ability.",
    imageNumber: "0108",
    portraitFocus: { x: 0.58, y: 0.233 },
    startingEssence: 0,
  },
  {
    id: testAvatarId("b99936ca-97f9-4930-af5a-fa9ef92557ef"),
    name: "Threxan",
    title: "the Resounding Wrath",
    renderedText: "Opponent ability.",
    imageNumber: "0025",
    portraitFocus: { x: 0.5, y: 0.2 },
    startingEssence: 0,
  },
];

const adapterMocks = vi.hoisted(() => ({
  props: null as TutorialScreenProps | null,
}));

const mocks = vi.hoisted(() => ({
  action: vi.fn(() => Promise.resolve(3)),
  beginTutorial: vi.fn(() => Promise.resolve(1)),
  beginTutorialBattle: vi.fn(() => Promise.resolve(4)),
  completeTutorialAction: vi.fn(() => Promise.resolve(2)),
}));

const tutorialState: NonNullable<FrontDoorState["tutorial"]> = {
    runId: testTutorialRunId("event:1"),
    currentActionIndex: 1,
    playerCardPlay: null,
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
          text: "Adapter fixture.",
        },
        wait: 3,
      },
      {
        id: testTutorialActionId("avatar-arrival"),
        action: "animate-avatar-portrait",
        owner: "player",
        pause: 1,
        duration: 0.6,
        wait: 0,
      },
      {
        id: testTutorialActionId("nightmare-call"),
        action: "display-speech-bubble",
        speechBubble: {
          speaker: "mira",
          duration: 3,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "A follow-up.",
        },
        wait: 3,
      },
      {
        id: testTutorialActionId("how-to-play"),
        action: "display-how-to-play",
        text: "Configured adapter instructions.\n\nScore 10⍟ to win.",
        wait: 0,
      },
      {
        id: testTutorialActionId("end-turn"),
        action: "end-turn",
        wait: 0,
      },
      {
        id: testTutorialActionId("autumn-glade"),
        action: "draw-dreamwell-card",
        owner: "enemy",
        cardId: testDreamwellCardId(
          "02e8ea92-1218-413c-9f0b-4c865a3921d3",
        ),
        wait: 0,
      },
      {
        id: testTutorialActionId("dreamwell-how-to-play"),
        action: "display-how-to-play",
        trigger: "immediate",
        companion: "dreamwell-card",
        text: "From turn 2, players draw dreamwell cards that increase their energy (●) production and have other effects.",
        wait: 0,
      },
    ],
};

const mockState: FrontDoorState = {
  phase: "tutorial",
  journeyId: testJourneyId("genesis:test"),
  tutorial: tutorialState,
};

vi.mock("../../state/front-door-context", () => ({
  useFrontDoor: () => ({
    state: mockState,
    isCurrentPlaytestController: false,
    mutations: {
      action: mocks.action,
      beginTutorial: mocks.beginTutorial,
      beginTutorialBattle: mocks.beginTutorialBattle,
      completeTutorialAction: mocks.completeTutorialAction,
    },
  }),
}));

vi.mock("../../state/journey-context", () => ({
  useJourney: () => ({
    journeyContent: { tutorial: TUTORIAL_CONFIGURATION },
  }),
}));

vi.mock("../../data/tutorial-actions", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../data/tutorial-actions")>();
  return {
    ...original,
    loadTutorialActions: vi.fn(() =>
      Promise.resolve(tutorialState.actions),
    ),
  };
});

vi.mock("../../state/use-tutorial-cards", () => ({
  useTutorialCards: () => {
    const opponent = {
      id: "229ab3a1-3720-41a2-924c-8fe112188f8e",
      name: "Tutorial Opponent Card",
      cardNumber: 519,
      cardType: "Character",
      subtype: "Musician",
      isStarter: false,
      energyCost: 2,
      spark: 2,
      isFast: false,
      renderedText: "",
      imageNumber: 1792373848,
      artOwned: false,
    };
    const player = {
      id: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
      name: "Tutorial Player Card",
      cardNumber: 512,
      cardType: "Character",
      subtype: "Spirit Animal",
      isStarter: false,
      energyCost: 4,
      spark: 4,
      isFast: false,
      renderedText: "",
      imageNumber: 1011175312,
      artOwned: false,
    };
    return {
      cards: [opponent, player],
      dreamwell: [
        {
          id: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
          name: "Autumn Glade",
          renderedText: "Gain 2⍟.",
          order: 1,
          energyAdded: 1,
          cardNumber: 5,
          imageNumber: 1789989917,
        },
      ],
    };
  },
}));

vi.mock("../../cumulus/screens/TutorialScreen", () => ({
  TutorialScreen: (props: TutorialScreenProps) => {
    adapterMocks.props = props;
    return <main data-tutorial-screen />;
  },
}));

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.beginTutorial.mockClear();
  mocks.beginTutorialBattle.mockClear();
  mocks.completeTutorialAction.mockClear();
  mocks.action.mockClear();
  (
    tutorialState as unknown as {
      currentActionIndex: number | null;
      playerCardPlay: {
        cardInstanceId: BattleCardId;
        cardId: CardId;
        targetSlotId: BattleSlotViewId | null;
      } | null;
    }
  ).currentActionIndex = 1;
  (
    tutorialState as unknown as { playerCardPlay: null }
  ).playerCardPlay = null;
  resetLog();
  adapterMocks.props = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("TutorialScreenAdapter", () => {
  it("hands the terminal scripted cursor to the durable tutorial battle lifecycle", async () => {
    (
      tutorialState as unknown as { currentActionIndex: number | null }
    ).currentActionIndex = null;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CumulusRoot>
          <TutorialScreenAdapter avatars={AVATARS} />
        </CumulusRoot>,
      );
      await Promise.resolve();
    });

    expect(mocks.beginTutorialBattle).toHaveBeenCalledWith("event:1");
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_battle_handoff_requested",
          tutorialRunId: "event:1",
          source: "tutorial-terminal-cursor",
        }),
      ]),
    );
    act(() => root.unmount());
    container.remove();
  });

  it("loads authored actions and logs the shared action presentation", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CumulusRoot>
          <TutorialScreenAdapter
            avatars={AVATARS}
            playbackSpeed={4}
          />
        </CumulusRoot>,
      );
      await Promise.resolve();
    });

    expect(container.querySelector("[data-tutorial-screen]")).not.toBeNull();
    expect(adapterMocks.props?.playbackSpeed).toBe(4);
    expect(adapterMocks.props?.view.avatars.player.visual).toMatchObject({
      imageNumber: "0108",
      name: "Gunnar Deepforge",
      title: "The Hammer's Echo",
    });
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_actions_loaded",
          actionCount: 7,
          actionIds: [
            testTutorialActionId("welcome"),
            testTutorialActionId("avatar-arrival"),
            testTutorialActionId("nightmare-call"),
            testTutorialActionId("how-to-play"),
            testTutorialActionId("end-turn"),
            testTutorialActionId("autumn-glade"),
            testTutorialActionId("dreamwell-how-to-play"),
          ],
        }),
        expect.objectContaining({
          event: "tutorial_action_presented",
          runId: "event:1",
          actionId: testTutorialActionId("avatar-arrival"),
          action: "animate-avatar-portrait",
          dialogueVisible: false,
          dialogueText: null,
          owner: "player",
          portraitPauseSeconds: 1,
          portraitTravelSeconds: 0.6,
          waitSeconds: 0,
          tutorialPlaybackSpeed: 4,
        }),
      ]),
    );

    act(() => {
      adapterMocks.props?.onAvatarArrivalComplete?.(
        testAvatarId("bfc40414-5264-41bf-86e1-a0f41ee4f5b5"),
        "player",
      );
    });
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_avatar_arrived",
          battleId: parseBattleId("tutorial-battle"),
          avatarId: testAvatarId(
            "bfc40414-5264-41bf-86e1-a0f41ee4f5b5",
          ),
          owner: "player",
          actionId: testTutorialActionId("avatar-arrival"),
          abilityActive: false,
        }),
      ]),
    );

    act(() => root.unmount());
    container.remove();
  });

  it("maps the authored How to Play action into the player turn and shared completion flow", async () => {
    (
      tutorialState as unknown as {
        currentActionIndex: number | null;
      }
    ).currentActionIndex = 3;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CumulusRoot>
          <TutorialScreenAdapter avatars={AVATARS} />
        </CumulusRoot>,
      );
      await Promise.resolve();
    });

    expect(adapterMocks.props?.view.battle).toMatchObject({
      activeSide: "player",
      isOpeningTurn: false,
      player: { status: { currentEnergy: 4, maxEnergy: 4 } },
      playerHand: [
        {
          id: "tutorial-player-deck-1",
          layoutMotion: "travel",
          showPlayableOutline: true,
          model: {
            cardId: testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
          },
        },
      ],
    });
    expect(adapterMocks.props?.view.howToPlay).toMatchObject({
      actionId: testTutorialActionId("how-to-play"),
      wait: 0,
      trigger: "player-turn-announcement-complete",
    });
    expect(adapterMocks.props?.view.howToPlay?.text).toBeInstanceOf(
      LocalizedString,
    );
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_player_turn_presented",
          runId: "event:1",
          battleId: parseBattleId("tutorial-battle"),
          activeSide: "player",
          currentEnergy: 4,
          maxEnergy: 4,
          cardId: testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
          cardInstanceId: "tutorial-player-deck-1",
          sourceZone: "player-deck",
          destinationZone: "player-hand",
          playerDeckCount: 29,
          playerHandCount: 1,
        }),
      ]),
    );

    act(() => {
      adapterMocks.props?.onHowToPlayPresented?.(
        parseTutorialRunId("event:1"),
        testTutorialActionId("how-to-play"),
        "player-turn-announcement-complete",
      );
      adapterMocks.props?.onHowToPlayDismissed?.(
        parseTutorialRunId("event:1"),
        testTutorialActionId("how-to-play"),
        "player-turn-announcement-complete",
      );
      adapterMocks.props?.onPlayerCardPlay?.(
        parseTutorialRunId("event:1"),
        parseBattleCardId("tutorial-player-deck-1"),
        testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
        parseBattleSlotViewId("player-back-4"),
      );
      adapterMocks.props?.onActionComplete?.(
        parseTutorialRunId("event:1"),
        testTutorialActionId("how-to-play"),
      );
      adapterMocks.props?.onPlayerCharacterReposition?.(
        parseTutorialRunId("event:1"),
        testTutorialActionId("block-opponent"),
        testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
        testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
        parseBattleSlotViewId("player-front-0"),
      );
    });
    expect(mocks.action).toHaveBeenCalledWith("tutorial", "play-card", {
      runId: "event:1",
      cardInstanceId: "tutorial-player-deck-1",
      cardId: testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
      targetSlotId: "player-back-4",
    });
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_how_to_play_presented",
          runId: "event:1",
          actionId: testTutorialActionId("how-to-play"),
          battleId: parseBattleId("tutorial-battle"),
          trigger: "player-turn-announcement-complete",
          title: "How to Play",
        }),
        expect.objectContaining({
          event: "tutorial_how_to_play_dismissed",
          runId: "event:1",
          actionId: testTutorialActionId("how-to-play"),
          battleId: parseBattleId("tutorial-battle"),
          trigger: "player-turn-announcement-complete",
        }),
        expect.objectContaining({
          event: "tutorial_player_card_play_requested",
          runId: "event:1",
          battleId: parseBattleId("tutorial-battle"),
          cardInstanceId: "tutorial-player-deck-1",
          cardId: testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
          sourceZone: "player-hand",
          destinationZone: "player-back-rank",
          targetSlotId: "player-back-4",
        }),
        expect.objectContaining({
          event: "tutorial_player_character_reposition_requested",
          battleId: parseBattleId("tutorial-battle"),
          runId: "event:1",
          actionId: testTutorialActionId("block-opponent"),
          cardId: testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
          opposingCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
          targetSlotId: "player-front-0",
        }),
      ]),
    );
    expect(mocks.completeTutorialAction).toHaveBeenCalledWith(
      "event:1",
      testTutorialActionId("how-to-play"),
    );
    expect(mocks.completeTutorialAction).toHaveBeenCalledWith(
      "event:1",
      testTutorialActionId("block-opponent"),
    );

    act(() => root.unmount());
    container.remove();
  });

  it("logs and completes the authored end-turn handoff", async () => {
    (
      tutorialState as unknown as {
        currentActionIndex: number | null;
        playerCardPlay: {
          cardInstanceId: BattleCardId;
          cardId: CardId;
          targetSlotId: BattleSlotViewId | null;
        } | null;
      }
    ).currentActionIndex = 4;
    (
      tutorialState as unknown as {
        playerCardPlay: {
          cardInstanceId: BattleCardId;
          cardId: CardId;
          targetSlotId: BattleSlotViewId | null;
        } | null;
      }
    ).playerCardPlay = {
      cardInstanceId: parseBattleCardId("tutorial-player-deck-1"),
      cardId: testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
      targetSlotId: parseBattleSlotViewId("player-back-4"),
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CumulusRoot>
          <TutorialScreenAdapter avatars={AVATARS} />
        </CumulusRoot>,
      );
      await Promise.resolve();
    });

    expect(adapterMocks.props?.view.endTurn).toEqual({
      actionId: testTutorialActionId("end-turn"),
      triggerCardId: testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
      ready: true,
    });
    act(() =>
      adapterMocks.props?.onEndTurn?.(
        parseTutorialRunId("event:1"),
        testTutorialActionId("end-turn"),
      ),
    );

    expect(mocks.completeTutorialAction).toHaveBeenCalledWith(
      "event:1",
      testTutorialActionId("end-turn"),
    );
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_end_turn_requested",
          runId: "event:1",
          actionId: testTutorialActionId("end-turn"),
          battleId: parseBattleId("tutorial-battle"),
          sourceSide: "player",
          destinationSide: "enemy",
          destinationPhase: "dawn",
        }),
      ]),
    );

    act(() => root.unmount());
    container.remove();
  });

  it("maps the opponent Dreamwell reveal and follow-up instructions", async () => {
    (
      tutorialState as unknown as {
        currentActionIndex: number | null;
      }
    ).currentActionIndex = 6;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CumulusRoot>
          <TutorialScreenAdapter avatars={AVATARS} />
        </CumulusRoot>,
      );
      await Promise.resolve();
    });

    expect(adapterMocks.props?.view.battle).toMatchObject({
      activeSide: "enemy",
      phase: "dawn",
      dreamwell: {
        side: "enemy",
        model: {
          cardId: testCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
          displaySnapshot: {
            name: "Autumn Glade",
            renderedText: "Gain 2⍟.",
          },
        },
      },
      enemy: {
        status: {
          currentEnergy: 4,
          maxEnergy: 4,
        },
      },
    });
    expect(adapterMocks.props?.view.howToPlay).toMatchObject({
      actionId: testTutorialActionId("dreamwell-how-to-play"),
      wait: 0,
      trigger: "immediate",
      companion: {
        cardId: testCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
        displaySnapshot: {
          id: testCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
          energyAdded: 1,
          imageNumber: 1789989917,
        },
      },
    });
    expect(adapterMocks.props?.view.howToPlay?.text).toBeInstanceOf(
      LocalizedString,
    );
    expect(
      adapterMocks.props?.view.howToPlay?.companion?.displaySnapshot.name,
    ).toBeInstanceOf(LocalizedString);
    expect(
      adapterMocks.props?.view.howToPlay?.companion?.displaySnapshot
        .renderedText,
    ).toBeInstanceOf(LocalizedString);
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_action_presented",
          actionId: testTutorialActionId("dreamwell-how-to-play"),
          trigger: "immediate",
          messageText:
            "From turn 2, players draw dreamwell cards that increase their energy (●) production and have other effects.",
        }),
      ]),
    );

    act(() => root.unmount());
    container.remove();
  });
});
