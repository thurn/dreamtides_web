// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyBackRankSlots, emptyFrontRankSlots } from "./test-support";
import type { TutorialBattleControllerPlan } from "./tutorial-battle-controller";
import { useTutorialBattleInteractions } from "./use-tutorial-battle-interactions";
import type { BattleCardInstance, BattleInit, BattleMutableState } from "./types";
import type { FoldState } from "../rules/fold-state";

const mocks = vi.hoisted(() => ({
  battlePlayCard: vi.fn(() => Promise.resolve()),
  battleCommand: vi.fn(() => Promise.resolve()),
  resolvePrompt: vi.fn(() => Promise.resolve()),
  state: null as FoldState | null,
}));

vi.mock("../coop/hooks", () => ({
  useActions: () => ({
    battlePlayCard: mocks.battlePlayCard,
    battleCommand: mocks.battleCommand,
    resolvePrompt: mocks.resolvePrompt,
  }),
  useClientId: () => "driver-client",
  useConfirmedPromptId: () => null,
  useGameState: () => mocks.state,
}));

const PLAYER_CARD_UUID = "e83014d3-9d35-4e80-a1b3-9b25360ad2af";
const REQUIRED_ENEMY_TARGET_EVENT_UUID =
  "4408b942-09a0-4f4e-a403-10c708c6e3c5";
const PLAYER_INSTANCE_ID = "player-hand-instance-uuid";

function side(): BattleMutableState["sides"]["player"] {
  return {
    currentEnergy: 5,
    maxEnergy: 5,
    score: 0,
    visibility: {},
    deck: [],
    hand: [],
    void: [],
    banished: [],
    backRank: emptyBackRankSlots(),
    frontRank: emptyFrontRankSlots(),
    fatigueCount: 0,
    dreamwellCardIndex: null,
    dreamwellDrawnTurn: null,
  };
}

function instance(): BattleCardInstance {
  return {
    battleCardId: PLAYER_INSTANCE_ID,
    owner: "player",
    controller: "player",
    sparkDelta: 0,
    staticSparkBonus: 0,
    isRevealedToPlayer: true,
    status: {
      isExhausted: false,
      counters: 0,
      reclaimed: false,
      offering: false,
      ephemeral: false,
      veil: false,
      grantedUnstoppable: false,
      grantedVengeful: false,
      grantedPreeminence: false,
      grantedAwakened: false,
    },
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: {
      kind: "quest-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: 1,
      createdAtSide: "player",
      createdAtMs: 0,
    },
    definition: {
      sourceDeckEntryId: null,
      cardId: PLAYER_CARD_UUID,
      cardNumber: 512,
      name: "display-only",
      battleCardKind: "character",
      subtype: "fixture",
      energyCost: 2,
      printedEnergyCost: 2,
      printedSpark: 2,
      isFast: false,
      reclaimCost: null,
      renderedText: "",
      imageNumber: 512,
      transfiguration: null,
      isBane: false,
    },
  };
}

function state(): FoldState {
  const player = side();
  player.hand = [PLAYER_INSTANCE_ID];
  const board: BattleMutableState = {
    battleId: "tutorial-battle-uuid",
    activeSide: "player",
    turnNumber: 3,
    phase: "day",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 2,
    sides: { player, enemy: side() },
    cardInstances: { [PLAYER_INSTANCE_ID]: instance() },
  };
  return {
    frontDoor: { phase: "tutorial", journeyId: "journey-uuid", tutorial: null },
    quest: {} as FoldState["quest"],
    battle: {
      mode: {
        kind: "tutorial",
        tutorialRunId: "tutorial-run-uuid",
        driverClientId: "driver-client",
        restartNumber: 0,
        resultConfig: {
          playerOnlyVictory: true,
          turnLimitDisabled: true,
        },
      },
      init: {} as BattleInit,
      board,
      effectQueue: [],
      pendingPrompt: null,
      dawnFired: { player: null, enemy: null },
    },
  };
}

function stateWithoutLegalEventTarget(): FoldState {
  const next = state();
  if (next.battle === null) throw new Error("fixture requires a battle");
  const source = next.battle.board.cardInstances[PLAYER_INSTANCE_ID];
  if (source === undefined) throw new Error("fixture requires a card");
  return {
    ...next,
    battle: {
      ...next.battle,
      board: {
        ...next.battle.board,
        cardInstances: {
          ...next.battle.board.cardInstances,
          [PLAYER_INSTANCE_ID]: {
            ...source,
            definition: {
              ...source.definition,
              cardId: REQUIRED_ENEMY_TARGET_EVENT_UUID,
              battleCardKind: "event",
            },
          },
        },
      },
    },
  };
}
const controller: TutorialBattleControllerPlan = {
  status: "driver",
  driverClientId: "driver-client",
  isCurrentClientDriver: true,
  isDriverPresent: true,
  requiresHumanDecision: true,
  intent: null,
};

let latest: ReturnType<typeof useTutorialBattleInteractions> | null = null;

function Harness() {
  latest = useTutorialBattleInteractions(controller);
  return null;
}

function mount() {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<Harness />));
  return root;
}

afterEach(() => {
  latest = null;
  mocks.state = null;
  mocks.battlePlayCard.mockClear();
  mocks.battleCommand.mockClear();
  mocks.resolvePrompt.mockClear();
});

describe("useTutorialBattleInteractions", () => {
  it("keeps a hand drag above the board and resolves its table drop as a play", () => {
    mocks.state = state();
    const root = mount();

    act(() => {
      latest?.interactions.onCardDragStart(
        PLAYER_INSTANCE_ID,
        "near-hand",
      );
    });
    expect(latest?.interactions.pendingCardId).toBe(PLAYER_INSTANCE_ID);
    expect(latest?.interactions.pendingCardSource).toBe("near-hand");

    act(() => {
      latest?.interactions.onHandCardDrop?.({
        owner: "player",
        rank: "back",
        slotId: "B2",
      });
    });

    expect(mocks.battlePlayCard).toHaveBeenCalledWith(
      PLAYER_INSTANCE_ID,
      [],
      `tutorial-battle:tutorial-battle-uuid:human-play:3:${PLAYER_INSTANCE_ID}`,
    );
    expect(latest?.interactions.pendingCardId).toBeNull();

    act(() => root.unmount());
  });

  it("does not open target selection for a required-target UUID with no legal target", () => {
    mocks.state = stateWithoutLegalEventTarget();
    const root = mount();

    act(() => {
      latest?.interactions.onHandCardActivate(PLAYER_INSTANCE_ID);
    });

    expect(latest?.interactions.targetSelectionCardId).toBeNull();
    expect(latest?.interactions.targetableCardIds).toEqual([]);
    expect(mocks.battlePlayCard).not.toHaveBeenCalled();

    act(() => root.unmount());
  });
});
