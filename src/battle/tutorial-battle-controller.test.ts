import { describe, expect, it } from "vitest";
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
import { asBattleId } from "../types/identifiers";
import { asCardId } from "../types/card-identity";
import { asBattleCardId } from "../types/identifiers";
import { asPresentationId } from "../types/identifiers";
import { asJourneyId } from "../types/identifiers";
import { asClientId } from "../types/identifiers";
import { asTutorialRunId } from "../types/identifiers";

const DRIVER = asClientId("client-driver");
const OBSERVER = asClientId("client-observer");
const TUTORIAL_AI_CONFIGURATION = resolveBattleAiConfiguration(
  opponentsFixture(),
  "tutorial",
);

function stateFor(
  boardOverrides: Partial<BattleMutableState> = {},
  extras: {
    driverClientId?: string;
    pendingPrompt?: unknown;
    aiBlockingTurn?: unknown;
  } = {},
): FoldState {
  const board = boardFor(boardOverrides);
  return {
    frontDoor: {
      phase: "tutorial",
      journeyId: asJourneyId("journey-uuid"),
      tutorial: null,
    },
    playtestControl: {
      mode: "single-controller",
      controllerClientId: asClientId(extras.driverClientId ?? DRIVER),
    },
    journey: {} as FoldState["journey"],
    battle: {
      mode: {
        kind: "tutorial",
        tutorialRunId: asTutorialRunId("tutorial-run-uuid"),
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
  const enemyCardId = "enemy-card-uuid";
  return {
    battleId: asBattleId("tutorial-battle-run-uuid"),
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
      [enemyCardId]: card(asBattleCardId(enemyCardId), "enemy"),
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
      cardId: asCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
      cardNumber: 512,
      name: "display-only",
      battleCardKind: "character" as const,
      subtype: "warrior",
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
    const otherViewer = asClientId("client-z-viewer");
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
    const markedDirewolfBattleCardId = "e83014d3-9d35-4e80-a1b3-9b25360ad2af";
    const runeboundChampionBattleCardId =
      "a28ad36d-fa74-4190-a463-7efd3a6233d0";
    const player = side();
    player.score = 7;
    player.frontRank.F0 = asBattleCardId(markedDirewolfBattleCardId);
    const enemy = side();
    enemy.score = 9;
    enemy.backRank.B0 = asBattleCardId(runeboundChampionBattleCardId);
    const markedDirewolf = card(
      asBattleCardId(markedDirewolfBattleCardId),
      "player",
    );
    markedDirewolf.definition.cardId = asCardId(markedDirewolfBattleCardId);
    markedDirewolf.definition.printedSpark = 4;
    const runeboundChampion = card(
      asBattleCardId(runeboundChampionBattleCardId),
      "enemy",
    );
    runeboundChampion.definition.cardId = asCardId(
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
            challengerBattleCardId: asBattleCardId(markedDirewolfBattleCardId),
            blockerBattleCardId: asBattleCardId(runeboundChampionBattleCardId),
            lane: "F0",
            outcome: "blocked",
            reason: "prevent-lethal",
          },
        ],
      },
    });
  });

  it("takes a favorable block on a later player Dusk despite an earlier blocking marker", () => {
    const challengerBattleCardId = "229ab3a1-3720-41a2-924c-8fe112188f8e";
    const blockerBattleCardId = "a28ad36d-fa74-4190-a463-7efd3a6233d0";
    const player = side();
    player.frontRank.F0 = asBattleCardId(challengerBattleCardId);
    const enemy = side();
    enemy.score = 9;
    enemy.backRank.B0 = asBattleCardId(blockerBattleCardId);
    const challenger = card(asBattleCardId(challengerBattleCardId), "player");
    challenger.definition.cardId = asCardId(challengerBattleCardId);
    challenger.definition.printedSpark = 2;
    const blocker = card(asBattleCardId(blockerBattleCardId), "enemy");
    blocker.definition.cardId = asCardId(blockerBattleCardId);
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
            challengerBattleCardId: asBattleCardId(challengerBattleCardId),
            blockerBattleCardId: asBattleCardId(blockerBattleCardId),
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
    challengingEnemy.frontRank.F0 = asBattleCardId("enemy-card-uuid");
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
    enemy.hand = [asBattleCardId(enemyCardId)];
    const state = stateFor({
      activeSide: "enemy",
      phase: "day",
      sides: { player: side(), enemy },
    });
    const result = plan(state);
    expect(result.intent).toMatchObject({
      kind: "battle-play-card",
      battleCardId: asBattleCardId(enemyCardId),
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
    const enemyCardId = "enemy-card-uuid";
    const centerOccupantId = "center-occupant-uuid";
    const enemy = side();
    enemy.hand = [asBattleCardId(enemyCardId)];
    enemy.backRank.B4 = asBattleCardId(centerOccupantId);
    const result = plan(
      stateFor({
        activeSide: "enemy",
        phase: "day",
        sides: { player: side(), enemy },
        cardInstances: {
          [enemyCardId]: card(asBattleCardId(enemyCardId), "enemy"),
          [centerOccupantId]: card(asBattleCardId(centerOccupantId), "enemy"),
        },
      }),
    );

    expect(result.intent).toMatchObject({
      kind: "battle-play-card",
      battleCardId: asBattleCardId(enemyCardId),
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
          asBattleCardId("deck-b-uuid"),
          asBattleCardId("deck-a-uuid"),
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
      id: asPresentationId("challenge-resolved:player:4:F0"),
      kind: "challenge-resolved",
      activeSide: "player",
      slotId: "F0",
      challengerBattleCardId: asBattleCardId("player-character-uuid"),
      blockerBattleCardId: null,
      scored: {
        battleCardId: asBattleCardId("player-character-uuid"),
        side: "player",
        points: 2,
      },
      dissolved: [],
    };

    expect(plan(terminal, DRIVER, [DRIVER, OBSERVER])).toMatchObject({
      status: "driver",
      intent: {
        kind: "complete-presentation",
        presentationId: asPresentationId("challenge-resolved:player:4:F0"),
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
