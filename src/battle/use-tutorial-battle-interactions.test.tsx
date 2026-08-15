import { testEventActor } from "../types/test-identities";
// @vitest-environment jsdom

import { act } from "react";
import { testCardName } from "../types/test-identities";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBackRankSlots, emptyFrontRankSlots } from "./test-support";
import type { TutorialBattleControllerPlan } from "./tutorial-battle-controller";
import { useTutorialBattleInteractions } from "./use-tutorial-battle-interactions";
import type {
  BattleCardInstance,
  BattleInit,
  BattleMutableState,
  BackRankSlotId,
  FrontRankSlotId,
} from "./types";
import { getLogEntries, resetLog } from "../logging";
import type { FoldState } from "../rules/fold-state";
import {
  parseEventNonce,
  type EventOutcome,
  type GameEvent,
} from "../eventlog/types";
import type { BattleCardId, IntentKey } from "../types/identifiers";
import { parseBattleId } from "../types/identifiers";
import { parseBattleCardId } from "../types/identifiers";
import { parseBattleSlotViewId } from "../types/identifiers";
import { parseJourneyId } from "../types/identifiers";
import { parseClientId } from "../types/identifiers";
import { parseTutorialRunId } from "../types/identifiers";
import { testCardId } from "../types/test-identities";

const mocks = vi.hoisted(() => ({
  battlePlayCard: vi.fn(() => Promise.resolve(1)),
  battleCommand: vi.fn((_command: unknown, _intentKey?: IntentKey) =>
    Promise.resolve(1),
  ),
  battleRepositionCharacter: vi.fn(
    (
      _battleCardId: BattleCardId,
      _destination: {
        readonly side: "player";
        readonly zone: "backRank" | "frontRank";
        readonly slotId: BackRankSlotId | FrontRankSlotId;
      },
    ) => Promise.resolve(1),
  ),
  resolvePrompt: vi.fn(() => Promise.resolve(1)),
  state: null as FoldState | null,
  confirmedState: null as FoldState | null,
  confirmedHead: null as number | null,
  outcomeListener: null as
    ((event: GameEvent, seq: number, outcome: EventOutcome) => void) | null,
}));

vi.mock("../coop/hooks", () => ({
  useActions: () => ({
    battlePlayCard: mocks.battlePlayCard,
    battleCommand: mocks.battleCommand,
    battleRepositionCharacter: mocks.battleRepositionCharacter,
    resolvePrompt: mocks.resolvePrompt,
  }),
  useClientId: () => "driver-client",
  useConfirmedGameState: () => mocks.confirmedState ?? mocks.state,
  useConfirmedHead: () => mocks.confirmedHead,
  useConfirmedPromptId: () => null,
  useEventOutcomes: (
    listener: (event: GameEvent, seq: number, outcome: EventOutcome) => void,
  ) => {
    mocks.outcomeListener = listener;
  },
  useGameState: () => mocks.state,
}));

const PLAYER_CARD_ID = testCardId(
  "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
);
const REQUIRED_ENEMY_TARGET_EVENT_ID = testCardId(
  "4408b942-09a0-4f4e-a403-10c708c6e3c5",
);
const PLAYER_INSTANCE_ID = parseBattleCardId("player-hand-instance-uuid");
const REVISIT_CHARACTER_ID = testCardId(
  "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
);
const REVISIT_INSTANCE_ID = parseBattleCardId("bc_0018");

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
      createdAtSide: "player",
      createdAtMs: 0,
    },
    definition: {
      sourceDeckEntryId: null,
      cardId: PLAYER_CARD_ID,
      cardNumber: 512,
      name: testCardName("display-only"),
      battleCardKind: "character",
      subtype: "Warrior",
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
    battleId: parseBattleId("tutorial-battle-uuid"),
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
    frontDoor: {
      phase: "tutorial",
      journeyId: parseJourneyId("journey-uuid"),
      tutorial: null,
    },
    playtestControl: {
      mode: "single-controller",
      controllerClientId: parseClientId("driver-client"),
    },
    journey: {} as FoldState["journey"],
    battle: {
      mode: {
        kind: "tutorial",
        tutorialRunId: parseTutorialRunId("tutorial-run-uuid"),
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
              cardId: REQUIRED_ENEMY_TARGET_EVENT_ID,
              battleCardKind: "event",
            },
          },
        },
      },
    },
  };
}

function sameTurnRevisitState(
  slotId: `F${number}`,
  exhausted = false,
): FoldState {
  const next = state();
  if (next.battle === null) throw new Error("fixture requires a battle");
  const fixture = instance();
  const player = next.battle.board.sides.player;
  player.hand = [];
  player.frontRank = {
    ...emptyFrontRankSlots(),
    [slotId]: REVISIT_INSTANCE_ID,
  };
  next.battle.board.activeSide = "enemy";
  next.battle.board.phase = "dusk";
  next.battle.board.turnNumber = 4;
  next.battle.board.cardInstances = {
    [REVISIT_INSTANCE_ID]: {
      ...fixture,
      battleCardId: REVISIT_INSTANCE_ID,
      status: {
        ...fixture.status,
        isExhausted: exhausted,
      },
      definition: {
        ...fixture.definition,
        cardId: REVISIT_CHARACTER_ID,
      },
    },
  };
  return next;
}
const controller: TutorialBattleControllerPlan = {
  status: "driver",
  driverClientId: parseClientId("driver-client"),
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

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  latest = null;
  mocks.state = null;
  mocks.confirmedState = null;
  mocks.confirmedHead = null;
  mocks.outcomeListener = null;
  mocks.battlePlayCard.mockClear();
  mocks.battleCommand.mockClear();
  mocks.battleRepositionCharacter.mockClear();
  mocks.resolvePrompt.mockClear();
  resetLog();
});

describe("useTutorialBattleInteractions", () => {
  it("starts Challenge when the player finishes Night", () => {
    mocks.state = state();
    if (mocks.state.battle === null)
      throw new Error("fixture requires a battle");
    mocks.state.battle.board.phase = "night";
    const root = mount();

    act(() => latest?.interactions.onNextPhase());

    expect(mocks.battleCommand).toHaveBeenCalledWith(
      {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_PHASE", phase: "challenge" },
        sourceSurface: "tutorial-player",
      },
      "tutorial-battle:tutorial-battle-uuid:human-phase:3:player:challenge",
    );

    act(() => root.unmount());
  });

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
        slotId: parseBattleSlotViewId("B2"),
      });
    });

    expect(mocks.battlePlayCard).toHaveBeenCalledWith(
      PLAYER_INSTANCE_ID,
      [],
      `tutorial-battle:tutorial-battle-uuid:human-play:3:${PLAYER_INSTANCE_ID}`,
      undefined,
      undefined,
      { side: "player", zone: "backRank", slotId: "B2" },
    );
    expect(latest?.interactions.pendingCardId).toBeNull();

    act(() => root.unmount());
  });

  it("submits a click attempt for shared guidance when a required-target UUID has no legal target", () => {
    mocks.state = stateWithoutLegalEventTarget();
    const root = mount();

    act(() => {
      latest?.interactions.onHandCardActivate(
        PLAYER_INSTANCE_ID,
      );
    });

    expect(latest?.interactions.targetSelectionCardId).toBeNull();
    expect(latest?.interactions.targetableCardIds).toEqual([]);
    expect(mocks.battlePlayCard).toHaveBeenCalledWith(
      PLAYER_INSTANCE_ID,
      [],
      `tutorial-battle:tutorial-battle-uuid:no-valid-targets:${PLAYER_INSTANCE_ID}`,
    );
    expect(getLogEntries()).toContainEqual(
      expect.objectContaining({
        event: "tutorial_battle_human_intent_requested",
        kind: "target-selection-unavailable",
        battleCardId: PLAYER_INSTANCE_ID,
        definitionId: REQUIRED_ENEMY_TARGET_EVENT_ID,
        input: "click",
        legalTargetCount: 0,
      }),
    );

    act(() => root.unmount());
  });

  it("submits a drag attempt for shared guidance when a required-target UUID has no legal target", () => {
    mocks.state = stateWithoutLegalEventTarget();
    const root = mount();

    act(() => {
      latest?.interactions.onCardDragStart(
        PLAYER_INSTANCE_ID,
        "near-hand",
      );
    });
    expect(latest?.interactions.pendingCardId).toBe(PLAYER_INSTANCE_ID);

    act(() => {
      latest?.interactions.onHandCardDrop?.({
        owner: "player",
        rank: "back",
        slotId: parseBattleSlotViewId("B2"),
      });
    });

    expect(mocks.battlePlayCard).toHaveBeenCalledWith(
      PLAYER_INSTANCE_ID,
      [],
      `tutorial-battle:tutorial-battle-uuid:no-valid-targets:${PLAYER_INSTANCE_ID}`,
    );
    expect(latest?.interactions.pendingCardId).toBeNull();
    expect(getLogEntries()).toContainEqual(
      expect.objectContaining({
        event: "tutorial_battle_human_intent_requested",
        kind: "target-selection-unavailable",
        battleCardId: PLAYER_INSTANCE_ID,
        definitionId: REQUIRED_ENEMY_TARGET_EVENT_ID,
        input: "drag",
        legalTargetCount: 0,
      }),
    );

    act(() => root.unmount());
  });

  it("submits a fresh authoritative event when a character revisits the same cell in one turn", async () => {
    mocks.battleRepositionCharacter
      .mockResolvedValueOnce(58)
      .mockResolvedValueOnce(59);
    mocks.state = sameTurnRevisitState("F3");
    const root = mount();

    act(() => {
      latest?.interactions.onCardDragStart(
        REVISIT_INSTANCE_ID,
        "battlefield",
      );
    });
    expect(
      latest?.interactions.isSlotDropEligible?.({
        owner: "player",
        rank: "back",
        slotId: parseBattleSlotViewId("B1"),
      }),
    ).toBe(true);
    expect(
      latest?.interactions.isSlotDropEligible?.({
        owner: "player",
        rank: "front",
        slotId: parseBattleSlotViewId("F3"),
      }),
    ).toBe(false);
    expect(latest?.interactions.sourceSlotTarget).toEqual({
      owner: "player",
      rank: "front",
      slotId: "F3",
    });
    await act(async () => {
      latest?.interactions.onSlotDrop({
        owner: "player",
        rank: "front",
        slotId: parseBattleSlotViewId("F1"),
      });
      await Promise.resolve();
    });

    mocks.state = sameTurnRevisitState("F1");
    act(() => root.render(<Harness />));
    act(() => {
      latest?.interactions.onCardDragStart(
        REVISIT_INSTANCE_ID,
        "battlefield",
      );
    });
    act(() => {
      latest?.interactions.onBattlefieldDropResolved?.({
        releasePoint: { clientX: 1077.375, clientY: 439.3125 },
        placementPoint: { clientX: 1077.375, clientY: 439.3125 },
        candidates: [
          {
            target: {
              owner: "player",
              rank: "front",
              slotId: parseBattleSlotViewId("F3"),
            },
            eligible: true,
            rect: {
              left: 1026.03125,
              top: 387.96875,
              width: 102.6875,
              height: 102.6875,
              centerX: 1077.375,
              centerY: 439.3125,
            },
            deltaX: 0,
            deltaY: 0,
            distanceSquared: 0,
            containsRelease: true,
            containsPlacement: true,
            edgeDistanceSquared: 0,
          },
        ],
        chosenTarget: {
          owner: "player",
          rank: "front",
          slotId: parseBattleSlotViewId("F3"),
        },
        strategy: "direct-hit",
      });
    });
    await act(async () => {
      latest?.interactions.onSlotDrop({
        owner: "player",
        rank: "front",
        slotId: parseBattleSlotViewId("F3"),
      });
      await Promise.resolve();
    });

    expect(mocks.battleRepositionCharacter).toHaveBeenCalledTimes(2);
    expect(mocks.battleRepositionCharacter.mock.calls[1]).toEqual([
      REVISIT_INSTANCE_ID,
      {
        side: "player",
        zone: "frontRank",
        slotId: "F3",
      },
    ]);
    expect(mocks.battleCommand).not.toHaveBeenCalled();
    expect(getLogEntries()).toContainEqual(
      expect.objectContaining({
        event: "tutorial_battle_human_drop_resolved",
        attemptId: "driver-client:tutorial-battle-uuid:movement:2",
        battleCardId: REVISIT_INSTANCE_ID,
        definitionId: REVISIT_CHARACTER_ID,
        source: {
          owner: "player",
          rank: "front",
          slotId: "F1",
        },
        releasePoint: { clientX: 1077.375, clientY: 439.3125 },
        placementPoint: { clientX: 1077.375, clientY: 439.3125 },
        chosenTarget: {
          owner: "player",
          rank: "front",
          slotId: "F3",
        },
        strategy: "direct-hit",
      }),
    );
    expect(getLogEntries()).toContainEqual(
      expect.objectContaining({
        event: "tutorial_battle_human_move_submitted",
        battleCardId: REVISIT_INSTANCE_ID,
        definitionId: REVISIT_CHARACTER_ID,
        source: {
          side: "player",
          zone: "frontRank",
          slotId: "F1",
        },
        target: {
          owner: "player",
          rank: "front",
          slotId: "F3",
        },
        committedSeq: 59,
      }),
    );
    const secondDestination =
      mocks.battleRepositionCharacter.mock.calls[1]?.[1];
    mocks.confirmedState = sameTurnRevisitState("F3");
    mocks.confirmedHead = 59;
    act(() => {
      mocks.outcomeListener?.(
        {
          type: "BATTLE_REPOSITION_CHARACTER",
          payload: {
            battleCardId: REVISIT_INSTANCE_ID,
            destination: secondDestination,
          },
          actor: testEventActor("driver-client"),
          clientTimestamp: "2026-07-26T03:38:48.126Z",
          basedOnSeq: 58,
          nonce: parseEventNonce("driver-client:movement:2"),
        },
        59,
        "applied",
      );
      root.render(<Harness />);
    });
    expect(getLogEntries()).toContainEqual(
      expect.objectContaining({
        event: "tutorial_battle_human_move_event_outcome",
        attemptId: "driver-client:tutorial-battle-uuid:movement:2",
        battleCardId: REVISIT_INSTANCE_ID,
        definitionId: REVISIT_CHARACTER_ID,
        committedSeq: 59,
        outcome: "applied",
      }),
    );
    expect(getLogEntries()).toContainEqual(
      expect.objectContaining({
        event: "tutorial_battle_human_move_folded",
        attemptId: "driver-client:tutorial-battle-uuid:movement:2",
        battleCardId: REVISIT_INSTANCE_ID,
        definitionId: REVISIT_CHARACTER_ID,
        committedSeq: 59,
        outcome: "applied",
        confirmedHead: 59,
        foldedLocation: {
          side: "player",
          zone: "frontRank",
          slotId: "F3",
        },
        foldedAtTarget: true,
        rejectionReason: null,
      }),
    );

    act(() => root.unmount());
  });

  it("allows an exhausted character to move to the bank but rejects the front at Dusk", () => {
    mocks.state = sameTurnRevisitState("F1", true);
    const root = mount();

    act(() => {
      latest?.interactions.onCardDragStart(
        REVISIT_INSTANCE_ID,
        "battlefield",
      );
    });
    expect(
      latest?.interactions.isSlotDropEligible?.({
        owner: "player",
        rank: "back",
        slotId: parseBattleSlotViewId("B1"),
      }),
    ).toBe(true);
    expect(
      latest?.interactions.isSlotDropEligible?.({
        owner: "player",
        rank: "front",
        slotId: parseBattleSlotViewId("F2"),
      }),
    ).toBe(false);

    act(() => {
      latest?.interactions.onBattlefieldDropRejected?.({
        reason: "ineligible-slot",
        clientX: 720,
        clientY: 410,
      });
    });

    expect(latest?.movementStatusMessage).toBe("exhausted-front-rank");
    expect(mocks.battleCommand).not.toHaveBeenCalled();
    expect(getLogEntries()).toContainEqual(
      expect.objectContaining({
        event: "tutorial_battle_human_move_rejected",
        battleCardId: REVISIT_INSTANCE_ID,
        definitionId: REVISIT_CHARACTER_ID,
        reason: "ineligible-slot",
        releasePoint: { clientX: 720, clientY: 410 },
      }),
    );

    act(() => root.unmount());
  });
});
