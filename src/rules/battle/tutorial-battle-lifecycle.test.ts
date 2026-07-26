import { afterEach, describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { QuestContent } from "../../data/quest-content";
import { genesisFoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import {
  registerTutorialBattleInitProvider,
} from "./battle-events";
import { createTutorialBattleInitProvider } from "../../coop/providers/battle-init-provider";
import { planTutorialBattleController } from "../../battle/tutorial-battle-controller";
import type { EventContext } from "../../eventlog/types";
import type { FoldState } from "../fold-state";
import { MINIMAL_ATLAS_CONFIG } from "../../__test-helpers__/atlas-fixtures";

const GENESIS = {
  seed: "tutorial-room-seed",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null },
};
const RUN_ID = "event:41";
const CTX: EventContext = {
  seq: 42,
  rng: () => 0.25,
  intervening: [],
  timestamp: "1970-01-01T00:00:00.000Z",
};

const STARTERS = [
  [510, "5a980eff-6ec7-44d8-9977-b98e66bbc2c8"],
  [511, "647f5150-b2e0-424b-9480-27557642524e"],
  [512, "e83014d3-9d35-4e80-a1b3-9b25360ad2af"],
  [513, "a28ad36d-fa74-4190-a463-7efd3a6233d0"],
  [514, "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481"],
  [515, "5ab11bef-5dcd-49f5-be49-ae2ccde76e70"],
  [516, "4408b942-09a0-4f4e-a403-10c708c6e3c5"],
  [517, "2162742c-09d0-4e62-ae49-0f8f79b45adc"],
  [518, "910b4cf9-dec7-4e03-af4f-7d5ae342eeba"],
  [519, "944e15d2-d680-4ebe-8d18-36826f4b1535"],
] as const;

function card(cardNumber: number, id: string): CardData {
  return {
    id: asCardId(id),
    name: asCardName(`Synthetic ${String(cardNumber)}`),
    cardNumber,
    cardType: cardNumber === 516 || cardNumber === 517 || cardNumber >= 518 ? "Event" : "Character",
    subtype: "",
    isStarter: true,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function content(): QuestContent {
  const cards = [
    ...STARTERS.map(([number, id]) => card(number, id)),
    card(520, "229ab3a1-3720-41a2-924c-8fe112188f8e"),
  ];
  return {
    cardDatabase: new Map(cards.map((item) => [item.cardNumber, item])),
    dreamcallers: [
      { id: "BFC40414-5264-41BF-86E1-A0F41EE4F5B5", name: "Tensho", title: "Tutor", renderedText: "inactive", imageNumber: "0029", startingEssence: 0, signatureCards: [] },
      { id: "B99936CA-97F9-4930-AF5A-FA9EF92557EF", name: "Threxan", title: "Tutor", renderedText: "inactive", imageNumber: "0025", startingEssence: 0, signatureCards: [] },
    ],
    dreamwellCards: [
      { id: "02e8ea92-1218-413c-9f0b-4c865a3921d3", name: "Autumn", renderedText: "", energyAdded: 1, order: 1, cardNumber: 5, imageNumber: 5 },
      { id: "7171ff89-ebe4-42d0-8863-9b4b0531cad2", name: "Voltsurge", renderedText: "", energyAdded: 1, order: 3, cardNumber: 14, imageNumber: 14 },
      { id: "other", name: "Other", renderedText: "", energyAdded: 1, order: 2, cardNumber: 2, imageNumber: 2 },
    ],
    dreamsignTemplates: [],
    dreamscapes: [],
    affiliations: [],
    guides: [],
    atlasConfig: MINIMAL_ATLAS_CONFIG,
  };
}

function terminalTutorialState(): FoldState {
  const state = genesisFoldState(GENESIS);
  return {
    ...state,
    frontDoor: {
      phase: "tutorial" as const,
      journeyId: RUN_ID,
      tutorial: { runId: RUN_ID, actions: [], currentActionIndex: null, playerCardPlay: null },
    },
  };
}

function begin(state: FoldState = terminalTutorialState()) {
  return reduceGameEvent(state, {
    type: "BEGIN_TUTORIAL_BATTLE",
    payload: { tutorialRunId: RUN_ID, driverClientId: "client-a" },
    actor: "client-a",
    basedOnSeq: 41,
    clientTimestamp: CTX.timestamp,
  }, CTX);
}

function reduceTutorial(
  state: FoldState,
  type: string,
  payload: Record<string, unknown>,
  actor = "client-a",
  context: EventContext = CTX,
) {
  return reduceGameEvent(state, {
    type,
    payload,
    actor,
    basedOnSeq: 41,
    clientTimestamp: CTX.timestamp,
  }, context);
}

function ids(battle: NonNullable<ReturnType<typeof begin>["state"]["battle"]>, side: "player" | "enemy", zone: "deck" | "hand" | "void") {
  return battle.board.sides[side][zone].map((id) => battle.board.cardInstances[id]?.definition.cardId);
}

afterEach(() => registerTutorialBattleInitProvider(null));

describe("tutorial battle lifecycle", () => {
  it("accepts only the terminal tutorial cursor once and builds the canonical handoff", () => {
    registerTutorialBattleInitProvider(createTutorialBattleInitProvider(content()));
    const result = begin();
    expect(result.outcome).toBe("applied");
    const battle = result.state.battle!;
    expect(battle.mode).toEqual({
      kind: "tutorial", tutorialRunId: RUN_ID, driverClientId: "client-a", restartNumber: 0,
      resultConfig: { playerOnlyVictory: true, turnLimitDisabled: true },
    });
    expect(battle.board).toMatchObject({ activeSide: "player", turnNumber: 4, phase: "dawn", dreamwellDeckIndex: 2 });
    expect(battle.init).toMatchObject({ scoreToWin: 10, turnLimit: Number.MAX_SAFE_INTEGER });
    expect(battle.board.sides.player).toMatchObject({ currentEnergy: 5, maxEnergy: 5, score: 0, dreamwellCardIndex: 1 });
    expect(battle.board.sides.enemy).toMatchObject({ currentEnergy: 0, maxEnergy: 5, score: 2, dreamwellCardIndex: 0 });
    expect(battle.init.dreamwellDeck.slice(0, 2).map((card) => card.id)).toEqual([
      "02e8ea92-1218-413c-9f0b-4c865a3921d3", "7171ff89-ebe4-42d0-8863-9b4b0531cad2",
    ]);
    const playerF0 = battle.board.sides.player.frontRank.F0!;
    const enemyB1 = battle.board.sides.enemy.backRank.B1!;
    expect(battle.board.cardInstances[playerF0]?.definition.cardId).toBe("e83014d3-9d35-4e80-a1b3-9b25360ad2af");
    expect(battle.board.cardInstances[enemyB1]?.definition.cardId).toBe("a28ad36d-fa74-4190-a463-7efd3a6233d0");
    expect(battle.board.cardInstances[playerF0]?.status.isExhausted).toBe(false);
    expect(battle.board.cardInstances[enemyB1]?.status.isExhausted).toBe(false);
    expect(ids(battle, "player", "hand")).toEqual([
      "5a980eff-6ec7-44d8-9977-b98e66bbc2c8", "4408b942-09a0-4f4e-a403-10c708c6e3c5", "2162742c-09d0-4e62-ae49-0f8f79b45adc",
    ]);
    expect(ids(battle, "enemy", "hand")).toEqual([
      "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481", "229ab3a1-3720-41a2-924c-8fe112188f8e",
    ]);
    expect(ids(battle, "enemy", "void")).toEqual(["229ab3a1-3720-41a2-924c-8fe112188f8e"]);
    expect(ids(battle, "player", "deck")).toHaveLength(26);
    expect(ids(battle, "enemy", "deck")).toHaveLength(28);
    for (const [, cardId] of STARTERS) {
      for (const side of ["player", "enemy"] as const) {
        expect(Object.values(battle.board.cardInstances).filter((instance) => instance.owner === side && instance.definition.cardId === cardId)).toHaveLength(3);
      }
    }
    expect(begin(result.state).outcome).toBe("bounced");
    const inProgress = terminalTutorialState();
    const tutorial = inProgress.frontDoor.tutorial!;
    expect(begin({ ...inProgress, frontDoor: { ...inProgress.frontDoor, tutorial: { ...tutorial, currentActionIndex: 0 } } }).outcome).toBe("bounced");
  });

  it("allows player battlefield swaps during Day and a back-to-front swap during enemy Dusk", () => {
    registerTutorialBattleInitProvider(createTutorialBattleInitProvider(content()));
    const started = begin().state;
    const battle = started.battle!;
    const frontCardId = battle.board.sides.player.frontRank.F0!;
    const backCardId = Object.values(battle.board.cardInstances).find((instance) =>
      instance.controller === "player" &&
      instance.definition.battleCardKind === "character" &&
      instance.battleCardId !== frontCardId,
    )!.battleCardId;
    const player = battle.board.sides.player;
    const board = {
      ...battle.board,
      activeSide: "enemy" as const,
      phase: "dusk" as const,
      sides: {
        ...battle.board.sides,
        player: {
          ...player,
          deck: player.deck.filter((id) => id !== backCardId),
          hand: player.hand.filter((id) => id !== backCardId),
          void: player.void.filter((id) => id !== backCardId),
          banished: player.banished.filter((id) => id !== backCardId),
          backRank: { ...player.backRank, B0: backCardId },
        },
      },
    };
    const state = { ...started, battle: { ...battle, board } };
    const swap = (source: Record<string, unknown>, target: Record<string, unknown>) => ({
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "SWAP_BATTLEFIELD_SLOTS", source, target },
        sourceSurface: "battlefield",
      },
    });

    const legalDusk = reduceTutorial(
      state,
      "BATTLE_COMMAND",
      swap(
        { side: "player", zone: "backRank", slotId: "B0" },
        { side: "player", zone: "frontRank", slotId: "F0" },
      ),
    );
    expect(legalDusk.outcome).toBe("applied");
    expect(legalDusk.state.battle?.board.sides.player.frontRank.F0).toBe(backCardId);
    expect(legalDusk.state.battle?.board.sides.player.backRank.B0).toBe(frontCardId);

    const playerDay = reduceTutorial(
      { ...state, battle: { ...state.battle, board: { ...board, activeSide: "player", phase: "day" } } },
      "BATTLE_COMMAND",
      swap(
        { side: "player", zone: "backRank", slotId: "B0" },
        { side: "player", zone: "frontRank", slotId: "F0" },
      ),
    );
    expect(playerDay.outcome).toBe("applied");

    expect(reduceTutorial(state, "BATTLE_COMMAND", swap(
      { side: "enemy", zone: "backRank", slotId: "B1" },
      { side: "player", zone: "frontRank", slotId: "F0" },
    )).outcome).toBe("bounced");
    const eventCardId = player.hand.find((id) =>
      battle.board.cardInstances[id]?.definition.battleCardKind === "event",
    )!;
    const nonCharacterState = {
      ...state,
      battle: {
        ...state.battle,
        board: {
          ...board,
          sides: {
            ...board.sides,
            player: {
              ...board.sides.player,
              hand: board.sides.player.hand.filter((id) => id !== eventCardId),
              backRank: { ...board.sides.player.backRank, B2: eventCardId },
            },
          },
        },
      },
    };
    expect(reduceTutorial(nonCharacterState, "BATTLE_COMMAND", swap(
      { side: "player", zone: "backRank", slotId: "B2" },
      { side: "player", zone: "frontRank", slotId: "F0" },
    )).outcome).toBe("bounced");
    expect(reduceTutorial(state, "BATTLE_COMMAND", swap(
      { side: "player", zone: "backRank", slotId: "B0" },
      { side: "enemy", zone: "backRank", slotId: "B1" },
    )).outcome).toBe("bounced");
    expect(reduceTutorial(state, "BATTLE_COMMAND", swap(
      { side: "player", zone: "frontRank", slotId: "F0" },
      { side: "player", zone: "backRank", slotId: "B0" },
    )).outcome).toBe("bounced");
    expect(reduceTutorial(state, "BATTLE_COMMAND", swap(
      { side: "player", zone: "backRank", slotId: "B0" },
      { side: "player", zone: "frontRank", slotId: "F0" },
    ), "client-observer").outcome).toBe("bounced");
  });

  it("restarts with a new driver and deterministic new restart stream, then exits without quest mutation", () => {
    registerTutorialBattleInitProvider(createTutorialBattleInitProvider(content()));
    const first = begin();
    const beforeQuest = first.state.quest;
    const original = first.state.battle!;
    const restart = reduceGameEvent(first.state, {
      type: "RESTART_TUTORIAL_BATTLE",
      payload: { battleId: original.board.battleId, previousDriverClientId: "client-a", driverClientId: "client-b" },
      actor: "client-b", basedOnSeq: 42, clientTimestamp: CTX.timestamp,
    }, { ...CTX, seq: 43 });
    expect(restart.outcome).toBe("applied");
    const rebuilt = restart.state.battle!;
    expect(rebuilt.mode).toMatchObject({ driverClientId: "client-b", restartNumber: 1 });
    expect(rebuilt.board.battleId).not.toBe(original.board.battleId);
    expect(ids(rebuilt, "player", "deck")).not.toEqual(ids(original, "player", "deck"));
    const replay = createTutorialBattleInitProvider(content()).beginTutorialBattle({ quest: beforeQuest, tutorialRunId: RUN_ID, driverClientId: "client-b", restartNumber: 1, seq: 43, rng: () => 0, timestamp: CTX.timestamp });
    expect(rebuilt).toMatchObject({
      ...replay,
      basicAutomationEnabled: true,
      mode: rebuilt.mode,
    });
    const exited = reduceGameEvent(restart.state, {
      type: "EXIT_TUTORIAL_BATTLE", payload: { battleId: rebuilt.board.battleId }, actor: "client-b", basedOnSeq: 43, clientTimestamp: CTX.timestamp,
    }, { ...CTX, seq: 44 });
    expect(exited.state).toMatchObject({ battle: null, frontDoor: { phase: "main", journeyId: null, tutorial: null }, quest: beforeQuest });
  });

  it("binds tutorial begin, restart, and exit claims to their stated driver", () => {
    registerTutorialBattleInitProvider(createTutorialBattleInitProvider(content()));
    expect(reduceTutorial(
      terminalTutorialState(),
      "BEGIN_TUTORIAL_BATTLE",
      { tutorialRunId: RUN_ID, driverClientId: "client-a" },
      "client-observer",
    ).outcome).toBe("bounced");
    expect(reduceTutorial(
      terminalTutorialState(),
      "BEGIN_TUTORIAL_BATTLE",
      { tutorialRunId: RUN_ID, driverClientId: "client-observer" },
      "client-a",
    ).outcome).toBe("bounced");

    const started = begin().state;
    const battleId = started.battle!.board.battleId;
    expect(reduceTutorial(
      started,
      "RESTART_TUTORIAL_BATTLE",
      { battleId, previousDriverClientId: "client-a", driverClientId: "client-b" },
      "client-observer",
    ).outcome).toBe("bounced");
    expect(reduceTutorial(
      started,
      "EXIT_TUTORIAL_BATTLE",
      { battleId },
      "client-observer",
    ).outcome).toBe("bounced");
  });

  it("binds human and automatic tutorial intents to the persisted driver", () => {
    registerTutorialBattleInitProvider(createTutorialBattleInitProvider(content()));
    const started = begin().state;
    const battle = started.battle!;
    const enemyCardId = battle.board.sides.enemy.hand[0];
    const activeBoard = {
      ...battle.board,
      activeSide: "enemy" as const,
      phase: "day" as const,
      sides: {
        ...battle.board.sides,
        enemy: { ...battle.board.sides.enemy, currentEnergy: 5 },
      },
    };
    const active = { ...started, battle: { ...battle, board: activeBoard } };
    const payload = { battleCardId: enemyCardId, targetBattleCardIds: [], aiChoices: [] };
    const spoofed = reduceGameEvent(active, {
      type: "BATTLE_PLAY_CARD", payload, actor: "tutorial-ai:client-observer", basedOnSeq: 42, clientTimestamp: CTX.timestamp,
    }, CTX);
    expect(spoofed.outcome).toBe("bounced");
    const automatic = reduceGameEvent(active, {
      type: "BATTLE_PLAY_CARD", payload, actor: "tutorial-ai:client-a", basedOnSeq: 42, clientTimestamp: CTX.timestamp,
    }, CTX);
    expect(automatic.outcome).toBe("applied");
    const observer = reduceGameEvent(active, {
      type: "BATTLE_PLAY_CARD", payload, actor: "client-observer", basedOnSeq: 42, clientTimestamp: CTX.timestamp,
    }, CTX);
    expect(observer.outcome).toBe("bounced");
  });

  it("rejects observer command, play, gesture, prompt, and exit intents while accepting driver intent", () => {
    registerTutorialBattleInitProvider(createTutorialBattleInitProvider(content()));
    const started = begin().state;
    const humanState = {
      ...started,
      battle: {
        ...started.battle!,
        board: { ...started.battle!.board, phase: "day" as const },
      },
    };
    const phaseCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_PHASE", phase: "dusk" },
      sourceSurface: "phase-control",
    };
    expect(reduceTutorial(humanState, "BATTLE_COMMAND", { command: phaseCommand }, "client-observer").outcome).toBe("bounced");
    expect(reduceTutorial(humanState, "BATTLE_COMMAND", { command: phaseCommand }).outcome).toBe("applied");
    expect(reduceTutorial(humanState, "BATTLE_GESTURE", { commands: [phaseCommand] }, "client-observer").outcome).toBe("bounced");
    expect(reduceTutorial(humanState, "BATTLE_GESTURE", { commands: [phaseCommand] }).outcome).toBe("applied");

    const playerCardId = humanState.battle.board.sides.player.hand[0];
    const play = { battleCardId: playerCardId, targetBattleCardIds: [], aiChoices: [] };
    expect(reduceTutorial(humanState, "BATTLE_PLAY_CARD", play, "client-observer").outcome).toBe("bounced");
    expect(reduceTutorial(humanState, "BATTLE_PLAY_CARD", play).outcome).toBe("applied");
    expect(reduceTutorial(started, "EXIT_TUTORIAL_BATTLE", {
      battleId: started.battle!.board.battleId,
    }, "client-observer").outcome).toBe("bounced");

    const ringwatcherId = Object.values(started.battle!.board.cardInstances).find((instance) =>
      instance.controller === "player" &&
      instance.definition.cardId === "647f5150-b2e0-424b-9480-27557642524e",
    )!.battleCardId;
    const player = started.battle!.board.sides.player;
    const promptState = {
      ...humanState,
      battle: {
        ...humanState.battle,
        board: {
          ...humanState.battle.board,
          sides: {
            ...humanState.battle.board.sides,
            player: {
              ...player,
              currentEnergy: 5,
              hand: [ringwatcherId],
              deck: player.deck.filter((id) => id !== ringwatcherId),
              void: player.void.filter((id) => id !== ringwatcherId),
              banished: player.banished.filter((id) => id !== ringwatcherId),
            },
          },
        },
      },
    };
    const opened = reduceTutorial(promptState, "BATTLE_PLAY_CARD", {
      battleCardId: ringwatcherId, targetBattleCardIds: [], aiChoices: [],
    });
    expect(opened.outcome).toBe("applied");
    const pending = opened.state.battle!.pendingPrompt!;
    const resolution = { promptId: pending.promptId, resolution: { kind: "foresee" } };
    expect(reduceTutorial(opened.state, "RESOLVE_PROMPT", resolution, "client-observer").outcome).toBe("bounced");
    expect(reduceTutorial(opened.state, "RESOLVE_PROMPT", resolution).outcome).toBe("applied");
  });

  it("accepts only the exact tutorial AI actor for automatic command, play, defense, and prompt resolution", () => {
    registerTutorialBattleInitProvider(createTutorialBattleInitProvider(content()));
    const started = begin().state;
    const automaticActor = "tutorial-ai:client-a";
    const spoofedActor = "tutorial-ai:client-observer";
    const automaticCommand = {
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_SCORE", side: "enemy", value: 8 },
        sourceSurface: "auto-system",
      },
    };
    expect(reduceTutorial(started, "BATTLE_COMMAND", automaticCommand, spoofedActor).outcome).toBe("bounced");
    expect(reduceTutorial(started, "BATTLE_COMMAND", automaticCommand, automaticActor).outcome).toBe("applied");

    const enemyCardId = started.battle!.board.sides.enemy.hand[0];
    const enemyPlayState = {
      ...started,
      battle: {
        ...started.battle!,
        board: {
          ...started.battle!.board,
          activeSide: "enemy" as const,
          phase: "day" as const,
          sides: {
            ...started.battle!.board.sides,
            enemy: { ...started.battle!.board.sides.enemy, currentEnergy: 5 },
          },
        },
      },
    };
    const enemyPlay = { battleCardId: enemyCardId, targetBattleCardIds: [], aiChoices: [] };
    expect(reduceTutorial(enemyPlayState, "BATTLE_PLAY_CARD", enemyPlay, spoofedActor).outcome).toBe("bounced");
    expect(reduceTutorial(enemyPlayState, "BATTLE_PLAY_CARD", enemyPlay, automaticActor).outcome).toBe("applied");

    const defenseState = {
      ...started,
      battle: {
        ...started.battle!,
        board: { ...started.battle!.board, phase: "dusk" as const },
      },
    };
    expect(reduceTutorial(defenseState, "BATTLE_AI_DEFEND", { aiSide: "enemy" }, spoofedActor).outcome).toBe("bounced");
    expect(reduceTutorial(defenseState, "BATTLE_AI_DEFEND", { aiSide: "enemy" }, automaticActor).outcome).toBe("applied");

    const ringwatcherId = Object.values(started.battle!.board.cardInstances).find((instance) =>
      instance.controller === "enemy" &&
      instance.definition.cardId === "647f5150-b2e0-424b-9480-27557642524e",
    )!.battleCardId;
    const enemy = started.battle!.board.sides.enemy;
    const promptState = {
      ...started,
      battle: {
        ...started.battle!,
        board: {
          ...started.battle!.board,
          activeSide: "enemy" as const,
          phase: "day" as const,
          sides: {
            ...started.battle!.board.sides,
            enemy: {
              ...enemy,
              currentEnergy: 5,
              hand: [ringwatcherId],
              deck: enemy.deck.filter((id) => id !== ringwatcherId),
              void: enemy.void.filter((id) => id !== ringwatcherId),
              banished: enemy.banished.filter((id) => id !== ringwatcherId),
            },
          },
        },
      },
    };
    const opened = reduceTutorial(promptState, "BATTLE_PLAY_CARD", {
      battleCardId: ringwatcherId, targetBattleCardIds: [], aiChoices: [],
    }, automaticActor);
    expect(opened.outcome).toBe("applied");
    const pending = opened.state.battle!.pendingPrompt!;
    const resolution = { promptId: pending.promptId, resolution: { kind: "foresee" } };
    expect(reduceTutorial(opened.state, "RESOLVE_PROMPT", resolution, spoofedActor).outcome).toBe("bounced");
    expect(reduceTutorial(opened.state, "RESOLVE_PROMPT", resolution, automaticActor).outcome).toBe("applied");
  });

  it("leaves quest-mode command, play, gesture, and defense actor behavior unchanged", () => {
    registerTutorialBattleInitProvider(createTutorialBattleInitProvider(content()));
    const started = begin().state;
    const questState = {
      ...started,
      battle: {
        ...started.battle!,
        mode: { kind: "quest" as const },
        board: { ...started.battle!.board, phase: "day" as const },
      },
    };
    const observer = "client-observer";
    const scoreCommand = {
      id: "DEBUG_EDIT",
      edit: { kind: "SET_SCORE", side: "enemy", value: 8 },
      sourceSurface: "test",
    };
    expect(reduceTutorial(questState, "BATTLE_COMMAND", { command: scoreCommand }, observer).outcome).toBe("applied");
    expect(reduceTutorial(questState, "BATTLE_GESTURE", { commands: [scoreCommand] }, observer).outcome).toBe("applied");
    expect(reduceTutorial(questState, "BATTLE_PLAY_CARD", {
      battleCardId: questState.battle.board.sides.player.hand[0], targetBattleCardIds: [], aiChoices: [],
    }, observer).outcome).toBe("applied");
    const defenseState = {
      ...questState,
      battle: { ...questState.battle, board: { ...questState.battle.board, phase: "dusk" as const } },
    };
    expect(reduceTutorial(defenseState, "BATTLE_AI_DEFEND", { aiSide: "enemy" }, observer).outcome).toBe("applied");
  });

  it("runs initial and post-Dreamwell Dawn triggers exactly once through the tutorial controller", () => {
    registerTutorialBattleInitProvider(createTutorialBattleInitProvider(content()));
    const automaticActor = "tutorial-ai:client-a";
    const commandFrom = (state: FoldState) => {
      const plan = planTutorialBattleController({
        state,
        clientId: "client-a",
        connectedClientIds: ["client-a"],
      });
      expect(plan.intent?.kind).toBe("battle-command");
      if (plan.intent?.kind !== "battle-command") throw new Error("expected automatic battle command");
      return plan.intent.command;
    };
    const started = begin().state;

    const initialDawn = commandFrom(started);
    const initial = reduceTutorial(started, "BATTLE_COMMAND", { command: initialDawn }, automaticActor);
    expect(initial.outcome).toBe("applied");
    expect(initial.state.battle).toMatchObject({
      board: { phase: "day", activeSide: "player", turnNumber: 4 },
      triggerDawnFired: { player: 4, enemy: null },
    });
    const initialReplay = reduceTutorial(initial.state, "BATTLE_COMMAND", { command: initialDawn }, automaticActor);
    expect(initialReplay.state.battle?.triggerDawnFired).toEqual({ player: 4, enemy: null });

    const prior = initial.state.battle!;
    const later = {
      ...initial.state,
      battle: {
        ...prior,
        board: {
          ...prior.board,
          activeSide: "enemy" as const,
          turnNumber: 5,
          phase: "dreamwell" as const,
          sides: {
            ...prior.board.sides,
            enemy: { ...prior.board.sides.enemy, dreamwellDrawnTurn: null, score: 2 },
          },
        },
      },
    };
    const reveal = reduceTutorial(later, "BATTLE_COMMAND", { command: commandFrom(later) }, automaticActor);
    expect(reveal.state.battle?.board).toMatchObject({ activeSide: "enemy", phase: "dreamwell", turnNumber: 5 });
    const dawn = reduceTutorial(reveal.state, "BATTLE_COMMAND", { command: commandFrom(reveal.state) }, automaticActor);
    expect(dawn.outcome).toBe("applied");
    expect(dawn.state.battle).toMatchObject({
      board: { activeSide: "enemy", phase: "day", turnNumber: 5 },
      triggerDawnFired: { player: 4, enemy: 5 },
    });
    expect(dawn.state.battle?.board.sides.enemy.score).toBe(3);
    const duplicateDawn = reduceTutorial(dawn.state, "BATTLE_COMMAND", { command: commandFrom(reveal.state) }, automaticActor);
    expect(duplicateDawn.state.battle?.board.sides.enemy.score).toBe(3);
    expect(duplicateDawn.state.battle?.triggerDawnFired).toEqual({ player: 4, enemy: 5 });
  });

  it("keeps the tutorial handoff playable through draw, Dreamwell, scoring, and player-only victory", () => {
    registerTutorialBattleInitProvider(createTutorialBattleInitProvider(content()));
    const automaticActor = "tutorial-ai:client-a";
    const started = begin().state;
    const initial = started.battle!;
    const handoffState = {
      ...started,
      battle: {
        ...initial,
        board: { ...initial.board, phase: "ending" as const },
      },
    };
    const enemyHandBefore = handoffState.battle.board.sides.enemy.hand.length;
    const handoff = reduceTutorial(handoffState, "BATTLE_COMMAND", {
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_BATTLE_FLOW", activeSide: "enemy", phase: "dreamwell", turnNumber: 5 },
        sourceSurface: "auto-system",
      },
    }, automaticActor);
    expect(handoff.outcome).toBe("applied");
    expect(handoff.state.battle?.board).toMatchObject({ activeSide: "enemy", phase: "dreamwell", turnNumber: 5 });
    expect(handoff.state.battle?.board.sides.enemy.hand).toHaveLength(enemyHandBefore + 1);

    const revealPlan = planTutorialBattleController({
      state: handoff.state,
      clientId: "client-a",
      connectedClientIds: ["client-a"],
    });
    expect(revealPlan.intent).toMatchObject({ kind: "battle-command", command: { edit: { kind: "DRAW_DREAMWELL_CARD", side: "enemy", turnNumber: 5 } } });
    if (revealPlan.intent?.kind !== "battle-command") throw new Error("expected Dreamwell reveal");
    const revealed = reduceTutorial(handoff.state, "BATTLE_COMMAND", { command: revealPlan.intent.command }, automaticActor);
    expect(revealed.outcome).toBe("applied");
    expect(revealed.state.battle?.board.sides.enemy.dreamwellDrawnTurn).toBe(5);

    const enemyTen = reduceTutorial({
      ...revealed.state,
      battle: {
        ...revealed.state.battle!,
        board: { ...revealed.state.battle!.board, turnNumber: Number.MAX_SAFE_INTEGER - 1 },
      },
    }, "BATTLE_COMMAND", {
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_SCORE", side: "enemy", value: 10 },
        sourceSurface: "auto-system",
      },
    }, automaticActor);
    expect(enemyTen.state.battle?.board).toMatchObject({ result: null, forcedResult: null });
    expect(enemyTen.state.battle?.board.sides.enemy.score).toBe(10);

    const playerCardId = initial.board.sides.player.frontRank.F0!;
    const playerVictoryState = {
      ...started,
      battle: {
        ...initial,
        board: {
          ...initial.board,
          activeSide: "player" as const,
          phase: "day" as const,
          sides: {
            ...initial.board.sides,
            player: { ...initial.board.sides.player, score: 9 },
            enemy: { ...initial.board.sides.enemy, frontRank: { ...initial.board.sides.enemy.frontRank, F0: null } },
          },
          cardInstances: {
            ...initial.board.cardInstances,
            [playerCardId]: {
              ...initial.board.cardInstances[playerCardId],
              definition: { ...initial.board.cardInstances[playerCardId].definition, printedSpark: 1 },
            },
          },
        },
      },
    };
    const victory = reduceTutorial(playerVictoryState, "BATTLE_COMMAND", {
      command: { id: "DEBUG_EDIT", edit: { kind: "SET_PHASE", phase: "challenge" }, sourceSurface: "auto-system" },
    }, automaticActor);
    expect(victory.outcome).toBe("applied");
    expect(victory.state.battle?.board).toMatchObject({ result: "victory", forcedResult: "victory" });
  });

  it("normalizes a mode-less persisted battle to quest mode through LOAD_STATE", () => {
    registerTutorialBattleInitProvider(createTutorialBattleInitProvider(content()));
    const battle = begin().state.battle!;
    const legacy = JSON.parse(JSON.stringify(battle)) as Record<string, unknown>;
    delete legacy.mode;
    const state = terminalTutorialState();
    const loaded = reduceGameEvent(state, {
      type: "LOAD_STATE", payload: { snapshot: state.quest, battle: legacy }, actor: "client-a", basedOnSeq: 41, clientTimestamp: CTX.timestamp,
    }, CTX);
    expect(loaded.outcome).toBe("applied");
    expect(loaded.state.battle?.mode).toEqual({ kind: "quest" });
    expect(JSON.parse(JSON.stringify(begin().state.battle))).toMatchObject({ mode: { kind: "tutorial" } });
  });
});
