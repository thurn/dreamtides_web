// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTutorialBattleController } from "./use-tutorial-battle-controller";
import type { FoldState } from "../rules/fold-state";
import { TUTORIAL_CHALLENGE_PRESENTATION_DWELL_MS } from "./tutorial-presentation-timing";
import { parseBattleCardId } from "../types/identifiers";
import { parseBattleId } from "../types/identifiers";
import { parsePresentationId } from "../types/identifiers";
import type { PresentationId } from "../types/identifiers";
import { parseJourneyId } from "../types/identifiers";
import { parseClientId } from "../types/identifiers";
import { parseTutorialRunId } from "../types/identifiers";
import { testCardId } from "../types/test-identities";

const mocks = vi.hoisted(() => ({
  completePresentation: vi.fn(() => Promise.resolve(1)),
  state: null as FoldState | null,
  clientId: "tutorial-driver",
  connectedClientIds: ["tutorial-driver"] as readonly string[] | null,
}));

vi.mock("../coop/hooks", () => ({
  useActions: () => ({
    completeTutorialBattlePresentation: mocks.completePresentation,
  }),
  useClientId: () => mocks.clientId,
  useConfirmedGameState: () => mocks.state,
  useConnectedClientIds: () => mocks.connectedClientIds,
}));

function presentationState(): FoldState {
  return {
    frontDoor: {
      phase: "tutorial",
      journeyId: parseJourneyId("journey"),
      tutorial: null,
    },
    playtestControl: {
      mode: "single-controller",
      controllerClientId: parseClientId("tutorial-driver"),
    },
    journey: {} as FoldState["journey"],
    battle: {
      mode: {
        kind: "tutorial",
        tutorialRunId: parseTutorialRunId("tutorial-run"),
        restartNumber: 0,
        resultConfig: { playerOnlyVictory: true, turnLimitDisabled: true },
      },
      init: {} as never,
      board: { battleId: parseBattleId("tutorial-battle"), result: null } as never,
      effectQueue: [],
      pendingPrompt: null,
      tutorialPresentation: {
        id: parsePresentationId("opponent-play:bc_0042"),
        kind: "opponent-play",
        cardId: testCardId("5a980eff-6ec7-44d8-9977-b98e66bbc2c8"),
        battleCardId: parseBattleCardId("bc_0042"),
        cardKind: "character",
      },
      dawnFired: { player: null, enemy: null },
    },
  };
}

function Harness({
  visiblePresentationId,
  paused = false,
}: {
  readonly visiblePresentationId: PresentationId | null;
  readonly paused?: boolean;
}) {
  const controller = useTutorialBattleController({ paused });
  useEffect(() => {
    if (visiblePresentationId !== null) {
      controller.onPresentationVisible(visiblePresentationId);
    }
  }, [controller.onPresentationVisible, visiblePresentationId]);
  return null;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  mocks.completePresentation.mockClear();
  mocks.clientId = "tutorial-driver";
  mocks.connectedClientIds = ["tutorial-driver"];
  mocks.state = presentationState();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("useTutorialBattleController", () => {
  it("starts the two-second opponent-play dwell only after the reveal is visible", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Harness visiblePresentationId={null} />);
    });
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(mocks.completePresentation).not.toHaveBeenCalled();

    act(() => {
      root.render(
        <Harness
          visiblePresentationId={parsePresentationId("opponent-play:bc_0042")}
        />,
      );
    });
    act(() => {
      vi.advanceTimersByTime(1_999);
    });
    expect(mocks.completePresentation).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mocks.completePresentation).toHaveBeenCalledOnce();
    expect(mocks.completePresentation).toHaveBeenCalledWith(
      "opponent-play:bc_0042",
      "tutorial-battle:tutorial-battle:presentation:opponent-play:bc_0042",
      "tutorial-ai:tutorial-driver",
    );

    act(() => root.unmount());
  });
  it("does not resume Challenge resolution until the result animation completes", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mocks.state = {
      ...presentationState(),
      battle: {
        ...presentationState().battle!,
        tutorialPresentation: {
          id: parsePresentationId("challenge-resolved:player:4:F0"),
          kind: "challenge-resolved",
          activeSide: "player",
          slotId: "F0",
          challengerBattleCardId: parseBattleCardId("player-character-uuid"),
          blockerBattleCardId: null,
          scored: {
            battleCardId: parseBattleCardId("player-character-uuid"),
            side: "player",
            points: 2,
          },
          dissolved: [],
        },
      },
    };

    act(() => {
      root.render(
        <Harness
          visiblePresentationId={parsePresentationId(
            "challenge-resolved:player:4:F0",
          )}
        />,
      );
    });
    act(() => {
      vi.advanceTimersByTime(TUTORIAL_CHALLENGE_PRESENTATION_DWELL_MS - 1);
    });
    expect(mocks.completePresentation).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mocks.completePresentation).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("keeps the direct victory preview from advancing battle automation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <Harness
          visiblePresentationId={parsePresentationId("opponent-play:bc_0042")}
          paused
        />,
      );
    });
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(mocks.completePresentation).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("does not automatically promote a connected viewer", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mocks.clientId = "tutorial-viewer";
    mocks.connectedClientIds = ["tutorial-viewer"];

    act(() => {
      root.render(<Harness visiblePresentationId={null} />);
    });

    expect(mocks.completePresentation).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
