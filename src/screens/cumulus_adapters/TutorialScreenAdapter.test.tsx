// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import { getLogEntries, resetLog } from "../../logging";
import { TutorialScreenAdapter } from "./TutorialScreenAdapter";
import type { TutorialScreenProps } from "../../cumulus/screens/TutorialScreen";

const adapterMocks = vi.hoisted(() => ({
  props: null as TutorialScreenProps | null,
}));

const mocks = vi.hoisted(() => ({
  beginTutorial: vi.fn(() => Promise.resolve(1)),
  completeTutorialAction: vi.fn(() => Promise.resolve(2)),
  state: {
    phase: "tutorial" as const,
    journeyId: "genesis:test",
    tutorial: {
      runId: "event:1",
      currentActionIndex: 1,
      actions: [
        {
          id: "welcome",
          action: "display-speech-bubble" as const,
          text: "Adapter fixture.",
          wait: 3,
        },
        {
          id: "dreamcaller-arrival",
          action: "animate-dreamcaller-portrait" as const,
          owner: "player" as const,
          pause: 1,
          duration: 0.6,
          wait: 0,
        },
        {
          id: "nightmare-call",
          action: "display-speech-bubble" as const,
          text: "A follow-up.",
          wait: 3,
        },
      ],
    },
  },
}));

vi.mock("../../state/front-door-context", () => ({
  useFrontDoor: () => ({
    state: mocks.state,
    mutations: {
      beginTutorial: mocks.beginTutorial,
      completeTutorialAction: mocks.completeTutorialAction,
    },
  }),
}));

vi.mock("../../data/tutorial-actions", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../data/tutorial-actions")>();
  return {
    ...original,
    loadTutorialActions: vi.fn(() => Promise.resolve(mocks.state.tutorial.actions)),
  };
});

vi.mock("../../state/use-tutorial-opponent-card", () => ({
  useTutorialCards: () => ({
    opponent: {
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
    },
    player: {
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
    },
  }),
}));

vi.mock("../../cumulus/screens/TutorialScreen", () => ({
  TutorialScreen: (props: TutorialScreenProps) => {
    adapterMocks.props = props;
    return <main data-tutorial-screen />;
  },
}));

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.beginTutorial.mockClear();
  mocks.completeTutorialAction.mockClear();
  (
    mocks.state.tutorial as unknown as {
      currentActionIndex: number | null;
    }
  ).currentActionIndex = 1;
  resetLog();
  adapterMocks.props = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("TutorialScreenAdapter", () => {
  it("loads authored actions and logs the shared action presentation", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CumulusRoot>
          <TutorialScreenAdapter />
        </CumulusRoot>,
      );
      await Promise.resolve();
    });

    expect(container.querySelector("[data-tutorial-screen]")).not.toBeNull();
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_actions_loaded",
          actionCount: 3,
          actionIds: ["welcome", "dreamcaller-arrival", "nightmare-call"],
        }),
        expect.objectContaining({
          event: "tutorial_action_presented",
          runId: "event:1",
          actionId: "dreamcaller-arrival",
          action: "animate-dreamcaller-portrait",
          dialogueVisible: true,
          dialogueText: "Adapter fixture.",
          owner: "player",
          portraitPauseSeconds: 1,
          portraitTravelSeconds: 0.6,
          waitSeconds: 0,
        }),
      ]),
    );

    act(() => {
      adapterMocks.props?.onDreamcallerArrivalComplete?.(
        "BFC40414-5264-41BF-86E1-A0F41EE4F5B5",
        "player",
      );
    });
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_dreamcaller_arrived",
          battleId: "tutorial-battle",
          dreamcallerId: "BFC40414-5264-41BF-86E1-A0F41EE4F5B5",
          owner: "player",
          actionId: "dreamcaller-arrival",
          abilityActive: false,
        }),
      ]),
    );

    act(() => root.unmount());
    container.remove();
  });

  it("logs the completed tutorial transition and UUID-backed player draw", async () => {
    (
      mocks.state.tutorial as unknown as {
        currentActionIndex: number | null;
      }
    ).currentActionIndex = null;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CumulusRoot>
          <TutorialScreenAdapter />
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
            cardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
          },
        },
      ],
    });
    expect(adapterMocks.props?.view.howToPlay).toEqual({
      triggerCardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
    });
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_player_turn_presented",
          runId: "event:1",
          battleId: "tutorial-battle",
          activeSide: "player",
          currentEnergy: 4,
          maxEnergy: 4,
          cardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
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
        "event:1",
        "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
      );
      adapterMocks.props?.onHowToPlayDismissed?.(
        "event:1",
        "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
      );
    });
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_how_to_play_presented",
          runId: "event:1",
          battleId: "tutorial-battle",
          triggerCardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
          trigger: "player-card-draw-complete",
          title: "How to Play",
        }),
        expect.objectContaining({
          event: "tutorial_how_to_play_dismissed",
          runId: "event:1",
          battleId: "tutorial-battle",
          triggerCardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
        }),
      ]),
    );

    act(() => root.unmount());
    container.remove();
  });
});
