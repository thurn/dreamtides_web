import { describe, expect, it } from "vitest";
import { testCardName } from "../types/test-identities";
import { emptyBackRankSlots, emptyFrontRankSlots } from "./test-support";
import { planTutorialBattleController } from "./tutorial-battle-controller";
import type { FoldState } from "../rules/fold-state";
import type {
  BattleCardInstance,
  BattleInit,
  BattleMutableState,
} from "./types";
import { opponentsFixture } from "../testing/opponents-fixture";
import { resolveBattleAiConfiguration } from "../types/opponents-data";
import type { BattleCardId, ClientId } from "../types/identifiers";
import { parseBattleId } from "../types/identifiers";
import { parseBattleCardId } from "../types/identifiers";
import { parsePresentationId } from "../types/identifiers";
import { parseJourneyId } from "../types/identifiers";
import { parseClientId } from "../types/identifiers";
import { parseTutorialRunId } from "../types/identifiers";
import { testCardId } from "../types/test-identities";

const DRIVER = parseClientId("client-driver");
const OBSERVER = parseClientId("client-observer");
const TUTORIAL_AI_CONFIGURATION = resolveBattleAiConfiguration(
  opponentsFixture(),
  "tutorial",
);

function stateFor(
  boardOverrides: Partial<BattleMutableState> = {},
  extras: {
    driverClientId?: ClientId;
    pendingPrompt?: unknown;
    aiBlockingTurn?: unknown;
  } = {},
): FoldState {
  const board = boardFor(boardOverrides);
  return {
    frontDoor: {
      phase: "tutorial",
      journeyId: parseJourneyId("journey-uuid"),
      tutorial: null,
    },
    playtestControl: {
      mode: "single-controller",
      controllerClientId: extras.driverClientId ?? DRIVER,
    },
    journey: {} as FoldState["journey"],
    battle: {
      mode: {
        kind: "tutorial",
        tutorialRunId: parseTutorialRunId("tutorial-run-uuid"),
        restartNumber: 0,
        resultConfig: { playerOnlyVictory: true, turnLimitDisabled: true },
      },
      init: {
        scoreToWin: 10,
        turnLimit: Number.MAX_SAFE_INTEGER,
        maxEnergyCap: 10,
        dreamwellDeck: [],
        aiConfiguration: TUTORIAL_AI_CONFIGURATION,
      } as unknown as BattleInit,
      board,
      effectQueue: [],
      pendingPrompt: (extras.pendingPrompt ?? null) as never,
      dawnFired: { player: null, enemy: null },
      ...(extras.aiBlockingTurn === undefined
        ? {}
        : { aiBlockingTurn: extras.aiBlockingTurn as never }),
    },
  };
}

function boardFor(overrides: Partial<BattleMutableState>): BattleMutableState {
  const enemyCardId = parseBattleCardId("enemy-card-uuid");
  return {
    battleId: parseBattleId("tutorial-battle-run-uuid"),
    activeSide: "player",
    turnNumber: 4,
    phase: "day",
    result: null,
    forcedResult: null,
    dreamwellDeckIndex: 0,
    nextBattleCardOrdinal: 1,
    sides: {
      player: side(),
      enemy: side(),
    },
    cardInstances: {
      [enemyCardId]: card(enemyCardId, "enemy"),
    },
    ...overrides,
  };
}

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

function card(
  battleCardId: BattleCardId,
  controller: "player" | "enemy",
): BattleCardInstance {
  return {
    battleCardId,
    owner: controller,
    controller,
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
      createdAtSide: controller,
      createdAtMs: 0,
    },
    definition: {
      sourceDeckEntryId: null,
      cardId: testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
      cardNumber: 512,
      name: testCardName("display-only"),
      battleCardKind: "character" as const,
      subtype: "Warrior",
      energyCost: 4,
      printedEnergyCost: 4,
      printedSpark: 4,
      isFast: false,
      reclaimCost: null,
      renderedText: "",
      imageNumber: 512,
      transfiguration: null,
      isBane: false,
    },
  };
}

function plan(
  state: FoldState,
  clientId = DRIVER,
  connectedClientIds: readonly ClientId[] | null = [DRIVER, OBSERVER],
) {
  return planTutorialBattleController({ state, clientId, connectedClientIds });
}

describe("tutorial battle controller", () => {
  it("advances round 1 without drawing a Dreamwell card", () => {
    expect(
      plan(stateFor({ phase: "dreamwell", turnNumber: 1 })).intent,
    ).toMatchObject({
      kind: "battle-command",
      command: {
        edit: { kind: "SET_PHASE", phase: "dawn" },
      },
    });
  });

  it("draws a Dreamwell card from round 2 onward", () => {
    expect(
      plan(stateFor({ phase: "dreamwell", turnNumber: 2 })).intent,
    ).toMatchObject({
      kind: "battle-command",
      command: {
        edit: {
          kind: "DRAW_DREAMWELL_CARD",
          side: "player",
          turnNumber: 2,
        },
      },
    });
  });

  it("assigns automatic work exclusively to the persisted, present driver", () => {
    const state = stateFor({ phase: "dawn" });
    expect(plan(state).intent?.kind).toBe("battle-command");
    expect(plan(state, OBSERVER)).toMatchObject({
      status: "observer",
      intent: null,
    });
  });

  it("pauses when the controller disconnects without promoting a viewer", () => {
    const state = stateFor({ phase: "dawn" });
    expect(plan(state, OBSERVER, [OBSERVER])).toMatchObject({
      status: "paused-driver-absent",
      intent: null,
    });
    expect(plan(state, DRIVER, [DRIVER, OBSERVER]).intent?.kind).toBe(
      "battle-command",
    );
  });

  it("leaves takeover explicit when several viewers remain", () => {
    const state = stateFor({ phase: "dawn" });
    const otherViewer = parseClientId("client-z-viewer");
    expect(plan(state, OBSERVER, [otherViewer, OBSERVER]).intent).toBeNull();
    expect(plan(state, otherViewer, [otherViewer, OBSERVER]).intent).toBeNull();
    expect(plan(state, OBSERVER, null).intent).toBeNull();
  });

  it("makes reload and StrictMode re-evaluation idempotent through the same key", () => {
    const state = stateFor({ phase: "dawn" });
    const first = plan(state).intent;
    const second = plan(JSON.parse(JSON.stringify(state)) as FoldState).intent;
    expect(first).toEqual(second);
    expect(first?.intentKey).toBe(
      "tutorial-battle:tutorial-battle-run-uuid:player:4:dawn:dawn:triggers",
    );
  });

  it("treats the claimant of a rebuilt tutorial snapshot as the new driver", () => {
    const state = stateFor({ phase: "dawn" }, { driverClientId: OBSERVER });
    expect(plan(state, DRIVER)).toMatchObject({
      status: "observer",
      intent: null,
    });
    expect(plan(state, OBSERVER).status).toBe("driver");
  });

  it("stops at player Day and Night while advancing player Dusk through enemy blocking", () => {
    expect(plan(stateFor()).requiresHumanDecision).toBe(true);
    expect(plan(stateFor({ phase: "dusk" })).intent).toMatchObject({
      kind: "battle-ai-block",
    });
    expect(
      plan(
        stateFor(
          { phase: "dusk" },
          {
            aiBlockingTurn: { activeSide: "player", turnNumber: 4 },
          },
        ),
      ).intent,
    ).toMatchObject({
      kind: "battle-command",
      command: { edit: { kind: "SET_PHASE", phase: "night" } },
    });
    expect(plan(stateFor({ phase: "night" }))).toMatchObject({
      requiresHumanDecision: true,
      intent: null,
    });
  });

  it("chump-blocks lethal on a later player Dusk despite an earlier blocking marker", () => {
    const markedDirewolfBattleCardId = parseBattleCardId(
      "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
    );
    const runeboundChampionBattleCardId =
      parseBattleCardId("a28ad36d-fa74-4190-a463-7efd3a6233d0");
    const player = side();
    player.score = 7;
    player.frontRank.F0 = markedDirewolfBattleCardId;
    const enemy = side();
    enemy.score = 9;
    enemy.backRank.B0 = runeboundChampionBattleCardId;
    const markedDirewolf = card(
      markedDirewolfBattleCardId,
      "player",
    );
    markedDirewolf.definition.cardId = testCardId(markedDirewolfBattleCardId);
    markedDirewolf.definition.printedSpark = 4;
    const runeboundChampion = card(
      runeboundChampionBattleCardId,
      "enemy",
    );
    runeboundChampion.definition.cardId = testCardId(
      runeboundChampionBattleCardId,
    );
    runeboundChampion.definition.printedSpark = 3;

    const result = plan(
      stateFor(
        {
          phase: "dusk",
          turnNumber: 5,
          sides: { player, enemy },
          cardInstances: {
            [markedDirewolfBattleCardId]: markedDirewolf,
            [runeboundChampionBattleCardId]: runeboundChampion,
          },
        },
        { aiBlockingTurn: { activeSide: "player", turnNumber: 4 } },
      ),
    );

    expect(result.intent).toMatchObject({
      kind: "battle-ai-block",
      decision: {
        opponentScore: 7,
        scoreToWin: 10,
        incomingScoreBeforeBlocks: 4,
        incomingScoreAfterBlocks: 1,
        lethalBeforeBlocks: true,
        lethalPreventable: true,
        lanes: [
          {
            challengerBattleCardId: markedDirewolfBattleCardId,
            blockerBattleCardId: runeboundChampionBattleCardId,
            lane: "F0",
            outcome: "blocked",
            reason: "prevent-lethal",
          },
        ],
      },
    });
  });

  it("takes a favorable block on a later player Dusk despite an earlier blocking marker", () => {
    const challengerBattleCardId = parseBattleCardId(
      "229ab3a1-3720-41a2-924c-8fe112188f8e",
    );
    const blockerBattleCardId = parseBattleCardId(
      "a28ad36d-fa74-4190-a463-7efd3a6233d0",
    );
    const player = side();
    player.frontRank.F0 = challengerBattleCardId;
    const enemy = side();
    enemy.score = 9;
    enemy.backRank.B0 = blockerBattleCardId;
    const challenger = card(challengerBattleCardId, "player");
    challenger.definition.cardId = testCardId(challengerBattleCardId);
    challenger.definition.printedSpark = 2;
    const blocker = card(blockerBattleCardId, "enemy");
    blocker.definition.cardId = testCardId(blockerBattleCardId);
    blocker.definition.printedSpark = 3;

    const result = plan(
      stateFor(
        {
          phase: "dusk",
          turnNumber: 5,
          sides: { player, enemy },
          cardInstances: {
            [challengerBattleCardId]: challenger,
            [blockerBattleCardId]: blocker,
          },
        },
        { aiBlockingTurn: { activeSide: "player", turnNumber: 4 } },
      ),
    );

    expect(result.intent).toMatchObject({
      kind: "battle-ai-block",
      decision: {
        lethalBeforeBlocks: false,
        lanes: [
          {
            challengerBattleCardId: parseBattleCardId(challengerBattleCardId),
            blockerBattleCardId: parseBattleCardId(blockerBattleCardId),
            lane: "F0",
            outcome: "blocked",
            reason: "favorable",
          },
        ],
      },
    });
  });

  it("pauses for player blocking on an enemy challenge and advances empty enemy Dusk", () => {
    const challengingEnemy = side();
    challengingEnemy.frontRank.F0 = parseBattleCardId("enemy-card-uuid");
    expect(
      plan(
        stateFor({
          activeSide: "enemy",
          phase: "dusk",
          sides: { player: side(), enemy: challengingEnemy },
        }),
      ),
    ).toMatchObject({
      requiresHumanDecision: true,
      intent: null,
    });
    expect(
      plan(stateFor({ activeSide: "enemy", phase: "dusk" })).intent,
    ).toMatchObject({
      kind: "battle-command",
      command: {
        edit: {
          kind: "SET_BATTLE_FLOW",
          activeSide: "player",
          phase: "dreamwell",
          turnNumber: 5,
        },
      },
    });
  });

  it("uses semantic BATTLE_PLAY_CARD planning for an enemy Day", () => {
    const enemyCardId = "enemy-card-uuid";
    const enemy = side();
    enemy.hand = [parseBattleCardId(enemyCardId)];
    const state = stateFor({
      activeSide: "enemy",
      phase: "day",
      sides: { player: side(), enemy },
    });
    const result = plan(state);
    expect(result.intent).toMatchObject({
      kind: "battle-play-card",
      battleCardId: parseBattleCardId(enemyCardId),
      aiChoices: [{ aiPresetId: "standard" }],
      characterDestination: {
        side: "enemy",
        zone: "backRank",
        slotId: "B4",
      },
    });
    expect(result.intent?.intentKey).toContain("enemy-play");
  });

  it("places heuristic tutorial AI characters in the nearest open center slot", () => {
    const enemyCardId = parseBattleCardId("enemy-card-uuid");
    const centerOccupantId = parseBattleCardId("center-occupant-uuid");
    const enemy = side();
    enemy.hand = [enemyCardId];
    enemy.backRank.B4 = centerOccupantId;
    const result = plan(
      stateFor({
        activeSide: "enemy",
        phase: "day",
        sides: { player: side(), enemy },
        cardInstances: {
          [enemyCardId]: card(enemyCardId, "enemy"),
          [centerOccupantId]: card(centerOccupantId, "enemy"),
        },
      }),
    );

    expect(result.intent).toMatchObject({
      kind: "battle-play-card",
      battleCardId: enemyCardId,
      characterDestination: {
        side: "enemy",
        zone: "backRank",
        slotId: "B5",
      },
    });
  });

  it("resolves enemy prompts deterministically but leaves player prompts interactive", () => {
    const enemyPrompt = {
      promptId: 41,
      run: {
        scriptRef: { table: "battle", id: "card-uuid" },
        cursor: [0],
        side: "enemy",
      },
      kind: "pick-cards",
      options: {
        kind: "pick-cards",
        label: "Discover",
        candidateIds: ["b-uuid", "a-uuid"],
        count: 1,
        optional: false,
        highlightCardIds: [],
      },
    };
    expect(
      plan(stateFor({}, { pendingPrompt: enemyPrompt })).intent,
    ).toMatchObject({
      kind: "resolve-prompt",
      promptId: 41,
      resolution: { kind: "pick-cards", chosenIds: ["a-uuid"] },
    });
    expect(
      plan(
        stateFor(
          {},
          {
            pendingPrompt: {
              ...enemyPrompt,
              run: { ...enemyPrompt.run, side: "player" },
            },
          },
        ),
      ),
    ).toMatchObject({
      requiresHumanDecision: true,
      intent: null,
    });
  });

  it("keeps deterministic choice and Foresee resolutions legal", () => {
    const base = {
      promptId: 44,
      run: {
        scriptRef: { table: "battle", id: "card-uuid" },
        cursor: [0],
        side: "enemy",
      },
    };
    const choicePlan = plan(
      stateFor(
        {},
        {
          pendingPrompt: {
            ...base,
            kind: "choice",
            options: {
              kind: "choice",
              label: "Choose",
              options: [{ label: "first" }, { label: "second" }],
            },
          },
        },
      ),
    );
    expect(choicePlan.intent).toMatchObject({
      resolution: { kind: "choice", optionIndex: 0 },
    });
    const foreseePlan = plan(
      stateFor(
        {},
        {
          pendingPrompt: {
            ...base,
            kind: "foresee",
            options: {
              kind: "foresee",
              count: 2,
              cardIds: ["deck-b-uuid", "deck-a-uuid"],
            },
          },
        },
      ),
    );
    expect(foreseePlan.intent).toMatchObject({
      resolution: {
        kind: "foresee",
        orderedCardIds: [
          parseBattleCardId("deck-b-uuid"),
          parseBattleCardId("deck-a-uuid"),
        ],
        voidCardIds: [],
      },
    });
  });

  it("never emits a post-terminal intent", () => {
    expect(plan(stateFor({ result: "victory" }))).toMatchObject({
      status: "terminal",
      intent: null,
    });
  });

  it("finishes a winning Challenge presentation before exposing terminal state", () => {
    const terminal = stateFor({ result: "victory" });
    terminal.battle!.tutorialPresentation = {
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
    };

    expect(plan(terminal, DRIVER, [DRIVER, OBSERVER])).toMatchObject({
      status: "driver",
      intent: {
        kind: "complete-presentation",
        presentationId: parsePresentationId("challenge-resolved:player:4:F0"),
      },
    });
    expect(plan(terminal, OBSERVER, [DRIVER, OBSERVER])).toMatchObject({
      status: "terminal",
      intent: null,
    });
  });

  it("keeps terminal authority with the present controller and pauses after departure", () => {
    const terminal = stateFor({ result: "victory" });
    expect(plan(terminal, DRIVER, [DRIVER, OBSERVER])).toMatchObject({
      status: "terminal",
      isCurrentClientDriver: true,
      isDriverPresent: true,
    });
    expect(plan(terminal, OBSERVER, [DRIVER, OBSERVER])).toMatchObject({
      status: "terminal",
      isCurrentClientDriver: false,
      isDriverPresent: true,
    });
    expect(plan(terminal, OBSERVER, [OBSERVER])).toMatchObject({
      status: "terminal",
      isCurrentClientDriver: false,
      isDriverPresent: false,
      intent: null,
    });
  });
});
