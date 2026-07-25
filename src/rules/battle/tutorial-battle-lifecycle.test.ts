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
