import { describe, expect, it } from "vitest";
import { createInitialBattleState } from "../../battle/state/create-initial-state";
import { makeBattleTestState } from "../../battle/test-support";
import type {
  BattleDeckCardDefinition,
  BattleDreamcallerSummary,
  BattleInit,
  BattleMutableState,
} from "../../battle/types";
import {
  buildMobileBattleResultView,
  buildMobileBattleView,
} from "./mobile-battle-view-model";
import type { PendingPrompt } from "../../rules/battle/fold";

const ENEMY_DREAMCALLER: BattleDreamcallerSummary = {
  id: "enemy-dreamcaller-uuid",
  name: "Enemy Caller",
  title: "Keeper of Tests",
  renderedText: "A synthetic test ability.",
  imageNumber: "008",
  portraitFocus: { x: 0.58, y: 0.23 },
};

function definition(index: number): BattleDeckCardDefinition {
  return {
    sourceDeckEntryId: null,
    cardId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    cardNumber: index,
    name: `Fixture Card ${String(index)}`,
    battleCardKind: "character",
    subtype: "Fixture",
    energyCost: index % 5,
    printedEnergyCost: index % 5,
    printedSpark: (index % 4) + 1,
    isFast: false,
    reclaimCost: null,
    renderedText: `Fixture rules ${String(index)}.`,
    imageNumber: index,
    transfiguration: null,
    isBane: false,
  };
}

function makeInit(): BattleInit {
  return {
    battleId: "mobile-battle-fixture",
    battleEntryKey: "battle-entry-fixture",
    seed: 42,
    siteId: "battle-site-fixture",
    dreamscapeId: "dreamscape-fixture",
    completionLevelAtStart: 2,
    isFinalBoss: false,
    essenceReward: 30,
    openingHandSize: 3,
    scoreToWin: 10,
    turnLimit: 12,
    maxEnergyCap: 8,
    startingSide: "player",
    playerDrawSkipsTurnOne: true,
    questDeckEntries: [],
    playerDeckOrder: Array.from({ length: 8 }, (_unused, index) => definition(index + 1)),
    dreamwellDeck: [],
    enemyDescriptor: {
      id: ENEMY_DREAMCALLER.id,
      name: ENEMY_DREAMCALLER.name,
      subtitle: ENEMY_DREAMCALLER.title,
      imageNumber: ENEMY_DREAMCALLER.imageNumber,
      portraitSeed: 7,
      abilityText: ENEMY_DREAMCALLER.renderedText,
      dreamsigns: [],
      signatureCards: [],
    },
    enemyDeckDefinition: Array.from(
      { length: 8 },
      (_unused, index) => definition(index + 9),
    ),
    dreamcallerSummary: {
      id: "player-dreamcaller-uuid",
      name: "Player Caller",
      title: "Builder of Fixtures",
      renderedText: "Another synthetic test ability.",
      imageNumber: "007",
      portraitFocus: { x: 0.48, y: 0.19 },
    },
    dreamsignSummaries: [],
    atlasSnapshot: makeBattleTestState().atlas,
  };
}

function makeBoard(init: BattleInit): BattleMutableState {
  const board = createInitialBattleState(init);
  const ids = Object.keys(board.cardInstances);

  board.sides.player.hand = ids.slice(0, 3);
  board.sides.player.deck = ids.slice(3, 5);
  board.sides.player.void = ids.slice(5, 7);
  board.sides.player.frontRank.F3 = ids[7];

  board.sides.enemy.hand = ids.slice(8, 10);
  board.sides.enemy.deck = ids.slice(10, 12);
  board.sides.enemy.void = ids.slice(12, 14);
  board.sides.enemy.frontRank.F0 = ids[14];
  board.sides.enemy.backRank.B4 = ids[15];

  board.sides.player.currentEnergy = 2;
  board.sides.player.maxEnergy = 4;
  board.sides.player.score = 5;
  board.sides.enemy.currentEnergy = 1;
  board.sides.enemy.maxEnergy = 3;
  board.sides.enemy.score = 8;

  board.cardInstances[ids[7]].status.isExhausted = true;
  board.cardInstances[ids[15]].provenance.kind = "generated-figment";
  board.cardInstances[ids[15]].figments = [2];

  return board;
}

describe("buildMobileBattleView", () => {
  it("maps victory reward copy and defeat/draw presentation state", () => {
    const init = makeInit();
    const board = makeBoard(init);

    expect(buildMobileBattleResultView(init, board, false)).toBeNull();

    board.result = "victory";
    board.turnNumber = 6;
    board.sides.player.score = 10;
    board.sides.enemy.score = 5;
    expect(buildMobileBattleResultView(init, board, false)).toEqual({
      outcome: "victory",
      essenceReward: 30,
      summary: "Defeated Enemy Caller · 10–5 · 6 turns",
    });

    board.result = "defeat";
    expect(buildMobileBattleResultView(init, board, true)).toEqual({
      outcome: "defeat",
      dismissed: true,
    });

    board.result = "draw";
    expect(buildMobileBattleResultView(init, board, false)).toEqual({
      outcome: "draw",
      dismissed: false,
    });
  });

  it("surfaces the active turn's UUID-backed Dreamwell card after its reveal commits", () => {
    const init: BattleInit = {
      ...makeInit(),
      dreamwellDeck: [
        {
          id: "3a4293da-55a1-4094-898a-df402ffa1c92",
          name: "Fixture Beacon",
          renderedText: "Draw a card.",
          energyAdded: 2,
          order: 2,
          cardNumber: 1,
          imageNumber: 42,
          art: { x: 0.2, y: -0.1, scale: 1.3 },
        },
      ],
    };
    const board = makeBoard(init);
    board.phase = "dreamwell";
    board.turnNumber = 2;
    board.activeSide = "enemy";
    board.sides.enemy.dreamwellCardIndex = 0;
    board.sides.enemy.dreamwellDrawnTurn = 2;

    expect(buildMobileBattleView(init, board, ENEMY_DREAMCALLER).dreamwell).toEqual({
      side: "enemy",
      model: {
        cardId: "3a4293da-55a1-4094-898a-df402ffa1c92",
        displaySnapshot: {
          id: "3a4293da-55a1-4094-898a-df402ffa1c92",
          name: "Fixture Beacon",
          renderedText: "Draw a card.",
          energyAdded: 2,
          imageNumber: 42,
          art: { x: 0.2, y: -0.1, scale: 1.3 },
        },
      },
    });

    board.sides.enemy.dreamwellDrawnTurn = 1;
    expect(
      buildMobileBattleView(init, board, ENEMY_DREAMCALLER).dreamwell,
    ).toBeNull();

    board.sides.enemy.dreamwellDrawnTurn = 2;
    board.result = "victory";
    expect(
      buildMobileBattleView(init, board, ENEMY_DREAMCALLER).dreamwell,
    ).toBeNull();
  });

  it("maps stable battle ids to canonical UUID card models", () => {
    const init = makeInit();
    const board = makeBoard(init);
    const view = buildMobileBattleView(init, board, ENEMY_DREAMCALLER);

    expect(view.battleId).toBe(board.battleId);
    expect(view.activeSide).toBe(board.activeSide);
    expect(view.aiApproval).toBeNull();
    expect(view.phase).toBe("dawn");
    expect(view.playerHand.map((card) => card.id)).toEqual(board.sides.player.hand);
    expect(view.playerHand.map((card) => card.model.cardId)).toEqual(
      board.sides.player.hand.map((id) => board.cardInstances[id].definition.cardId),
    );
    expect(view.player.frontRank[3].card).toMatchObject({
      id: board.sides.player.frontRank.F3,
      exhausted: true,
      figment: false,
      figmentTitleBar: false,
      figmentCount: 1,
      storedTime: 0,
      automated: false,
    });
    expect(view.enemy.backRank[4].card).toMatchObject({
      id: board.sides.enemy.backRank.B4,
      figment: true,
      figmentTitleBar: true,
      figmentCount: 1,
      storedTime: 0,
      automated: false,
    });
  });

  it("rebuilds complete card status from the committed battle instance", () => {
    const init = makeInit();
    const board = makeBoard(init);
    const playerCardId = board.sides.player.frontRank.F3;
    const figmentCardId = board.sides.enemy.backRank.B4;
    if (playerCardId === null || figmentCardId === null) {
      throw new Error("fixture battlefield cards missing");
    }

    const before = buildMobileBattleView(init, board, ENEMY_DREAMCALLER);
    expect(before.player.frontRank[3].card).toMatchObject({
      exhausted: true,
      storedTime: 0,
      automated: false,
    });
    expect(before.enemy.backRank[4].card).toMatchObject({ figmentCount: 1 });

    board.cardInstances[playerCardId].status.isExhausted = false;
    board.cardInstances[playerCardId].status.counters = 4;
    board.cardInstances[playerCardId].definition.cardId =
      "4e3c04a9-1cdd-468a-b42a-40157ed9c9d6";
    board.cardInstances[figmentCardId].figments = [2, 3, 4];

    const after = buildMobileBattleView(
      init,
      board,
      ENEMY_DREAMCALLER,
      null,
      {
        aiMode: false,
        basicAutomationEnabled: true,
        isOpponentHandRevealed: false,
        isPlayerHandHidden: false,
      },
    );
    expect(after.player.frontRank[3].card).toMatchObject({
      exhausted: false,
      storedTime: 4,
      automated: true,
    });
    expect(after.enemy.backRank[4].card).toMatchObject({
      figmentCount: 3,
      model: { displaySnapshot: { spark: 9 } },
    });
  });

  it("maps a held AI proposal into presentation-only approval state", () => {
    const init = makeInit();
    const board = makeBoard(init);

    expect(
      buildMobileBattleView(init, board, ENEMY_DREAMCALLER, {
        kind: "action",
        description: "Play a fixture card to B2.",
      }).aiApproval,
    ).toEqual({
      description: "Play a fixture card to B2.",
      canReject: true,
    });
    expect(
      buildMobileBattleView(init, board, ENEMY_DREAMCALLER, {
        kind: "endPhase",
        description: "Pass from Day to Dusk.",
      }).aiApproval,
    ).toEqual({
      description: "Pass from Day to Dusk.",
      canReject: false,
    });
  });

  it("maps a confirmed pick-cards prompt into the inline hand picker", () => {
    const init = makeInit();
    const board = makeBoard(init);
    const prompt = {
      promptId: 42,
      run: {
        scriptRef: { table: "dreamwell", id: "prompt-fixture" },
        cursor: [0],
        side: "player",
      },
      kind: "pick-cards",
      options: {
        kind: "pick-cards",
        label: "Discard 2 cards",
        candidateIds: board.sides.player.hand.slice(0, 2),
        count: 2,
        optional: false,
        highlightCardIds: [],
      },
    } satisfies PendingPrompt;

    const optimistic = buildMobileBattleView(
      init,
      board,
      ENEMY_DREAMCALLER,
      null,
      {
        aiMode: false,
        isOpponentHandRevealed: false,
        isPlayerHandHidden: false,
        pendingPrompt: prompt,
        confirmedPromptId: null,
      },
    );
    expect(optimistic.cardPicker).toEqual({
      key: "42",
      side: "player",
      label: "Discard 2 cards",
      candidateIds: prompt.options.candidateIds,
      count: 2,
      optional: false,
      canResolve: false,
    });

    const confirmed = buildMobileBattleView(
      init,
      board,
      ENEMY_DREAMCALLER,
      null,
      {
        aiMode: false,
        isOpponentHandRevealed: false,
        isPlayerHandHidden: false,
        pendingPrompt: prompt,
        confirmedPromptId: prompt.promptId,
      },
    );
    expect(confirmed.cardPicker?.canResolve).toBe(true);
  });

  it("maps choice prompts into confirmed inline option controls", () => {
    const init = makeInit();
    const board = makeBoard(init);
    const prompt = {
      promptId: 44,
      run: {
        scriptRef: { table: "dreamwell", id: "prompt-fixture" },
        cursor: [0],
        side: "player",
      },
      kind: "choice",
      options: {
        kind: "choice",
        label: "Choose one",
        options: [{ label: "Draw a card" }, { label: "Gain 2●" }],
      },
    } satisfies PendingPrompt;

    const optimistic = buildMobileBattleView(
      init,
      board,
      ENEMY_DREAMCALLER,
      null,
      {
        aiMode: false,
        isOpponentHandRevealed: false,
        isPlayerHandHidden: false,
        pendingPrompt: prompt,
        confirmedPromptId: null,
      },
    );
    expect(optimistic.choicePrompt).toEqual({
      key: "44",
      label: "Choose one",
      options: [{ label: "Draw a card" }, { label: "Gain 2●" }],
      canResolve: false,
    });

    const confirmed = buildMobileBattleView(
      init,
      board,
      ENEMY_DREAMCALLER,
      null,
      {
        aiMode: false,
        isOpponentHandRevealed: false,
        isPlayerHandHidden: false,
        pendingPrompt: prompt,
        confirmedPromptId: prompt.promptId,
      },
    );
    expect(confirmed.choicePrompt?.canResolve).toBe(true);
    expect(confirmed.cardPicker).toBeNull();
  });

  it("does not map a pick-cards prompt whose candidates are outside the hand", () => {
    const init = makeInit();
    const board = makeBoard(init);
    const prompt = {
      promptId: 43,
      run: {
        scriptRef: { table: "dreamwell", id: "prompt-fixture" },
        cursor: [0],
        side: "player",
      },
      kind: "pick-cards",
      options: {
        kind: "pick-cards",
        label: "Choose a void card",
        candidateIds: [board.sides.player.void[0] ?? "void-card"],
        count: 1,
        optional: false,
        highlightCardIds: [],
      },
    } satisfies PendingPrompt;

    const view = buildMobileBattleView(
      init,
      board,
      ENEMY_DREAMCALLER,
      null,
      {
        aiMode: false,
        isOpponentHandRevealed: false,
        isPlayerHandHidden: false,
        pendingPrompt: prompt,
        confirmedPromptId: prompt.promptId,
      },
    );

    expect(view.cardPicker).toBeNull();
  });

  it("builds readable inspector snapshot, side zones, availability, visibility, and AI states", () => {
    const init = makeInit();
    const board = makeBoard(init);
    board.phase = "night";
    board.turnNumber = 4;
    board.sides.player.banished = [board.sides.player.hand[0]];
    const view = buildMobileBattleView(init, board, ENEMY_DREAMCALLER, {
      kind: "action",
      description: "Play the selected instance.",
      trace: {
        stage: "character",
        choice: "PLAY_CARD",
        battleCardId: board.sides.enemy.hand[0],
        cardName: "Display-only fixture",
        sourceHandIndex: 0,
        sourceSlotId: null,
        targetSlotId: "B2",
        heuristicScoreBefore: 2,
        heuristicScoreAfter: 4.5,
      },
    }, {
      aiMode: true,
      isOpponentHandRevealed: true,
      isPlayerHandHidden: true,
    });

    expect(view.inspector).toMatchObject({
      opponentName: "Enemy Caller",
      turn: "4",
      phase: "Night",
      result: "In progress",
      nextDreamwellOrder: "Complete",
      isOpponentHandRevealed: true,
      isPlayerHandHidden: true,
    });
    expect(view.inspector.sides.player).toMatchObject({
      heading: "Your",
      points: 5,
      canDiscard: true,
      canShuffle: true,
      zones: { hand: 3, deck: 2, void: 2, banished: 1, backRank: 0, frontRank: 1 },
    });
    expect(view.inspector.sides.enemy.zones).toMatchObject({ hand: 2, deck: 2, void: 2, backRank: 1, frontRank: 1 });
    expect(view.inspector.ai).toMatchObject({ kind: "Action", card: "Display-only fixture", target: "B2", heuristicChange: "2.00 → 4.50" });

    const noAi = buildMobileBattleView(init, board, ENEMY_DREAMCALLER);
    expect(noAi.inspector.ai).toBeNull();
  });

  it("marks only affordable player hand cards during the player's Day phase", () => {
    const init = makeInit();
    const board = makeBoard(init);
    board.phase = "day";

    expect(
      buildMobileBattleView(init, board, ENEMY_DREAMCALLER).playerHand.map(
        (card) => card.showPlayableOutline,
      ),
    ).toEqual([true, true, false]);

    board.phase = "dusk";

    expect(
      buildMobileBattleView(init, board, ENEMY_DREAMCALLER).playerHand.map(
        (card) => card.showPlayableOutline,
      ),
    ).toEqual([false, false, false]);

    board.phase = "day";
    board.activeSide = "enemy";

    expect(
      buildMobileBattleView(init, board, ENEMY_DREAMCALLER).playerHand.map(
        (card) => card.showPlayableOutline,
      ),
    ).toEqual([false, false, false]);
  });

  it.each([
    ["dreamwell", "dawn"],
    ["draw", "dawn"],
    ["dawn", "dawn"],
    ["day", "day"],
    ["dusk", "dusk"],
    ["night", "night"],
    ["challenge", "challenge"],
    ["ending", "challenge"],
  ] as const)("surfaces bookkeeping phase %s at %s", (phase, visiblePhase) => {
    const init = makeInit();
    const board = makeBoard(init);
    board.phase = phase;

    expect(buildMobileBattleView(init, board, ENEMY_DREAMCALLER).phase).toBe(
      visiblePhase,
    );
  });

  it("preserves hand and deck order while exposing hidden zones as ids only", () => {
    const init = makeInit();
    const board = makeBoard(init);
    const view = buildMobileBattleView(init, board, ENEMY_DREAMCALLER);

    expect(view.enemyHandCardIds).toEqual(board.sides.enemy.hand);
    expect(view.enemyHandCardIds).toHaveLength(2);
    expect(view.playerHand.map((card) => card.id)).toEqual(board.sides.player.hand);
    expect(view.player.deckCardIds).toEqual(board.sides.player.deck);
    expect(view.enemy.deckCardIds).toEqual(board.sides.enemy.deck);
    expect(view.player.deckCardIds[0]).toBe(board.sides.player.deck[0]);
    expect(view.enemy.deckCardIds[0]).toBe(board.sides.enemy.deck[0]);
  });

  it("puts the last void entry first so the visible card is the top of the pile", () => {
    const init = makeInit();
    const board = makeBoard(init);
    const view = buildMobileBattleView(init, board, ENEMY_DREAMCALLER);

    expect(view.player.voidCards.map((card) => card.id)).toEqual(
      [...board.sides.player.void].reverse(),
    );
    expect(view.enemy.voidCards.map((card) => card.id)).toEqual(
      [...board.sides.enemy.void].reverse(),
    );
    expect(view.player.voidCards[0].id).toBe(
      board.sides.player.void[board.sides.player.void.length - 1],
    );
  });

  it("materializes the dynamic staggered slots in left-to-right identity order", () => {
    const init = makeInit();
    const board = makeBoard(init);
    const view = buildMobileBattleView(init, board, ENEMY_DREAMCALLER);

    const expectedFrontRank = ["F0", "F1", "F2", "F3"];
    const expectedBackRank = ["B0", "B1", "B2", "B3", "B4"];
    expect(view.player.frontRank.map((slot) => slot.id)).toEqual(expectedFrontRank);
    expect(view.enemy.frontRank.map((slot) => slot.id)).toEqual(expectedFrontRank);
    expect(view.player.backRank.map((slot) => slot.id)).toEqual(expectedBackRank);
    expect(view.enemy.backRank.map((slot) => slot.id)).toEqual(expectedBackRank);
    expect(view.player.frontRank[3].card?.id).toBe(board.sides.player.frontRank.F3);
    expect(view.enemy.backRank[4].card?.id).toBe(board.sides.enemy.backRank.B4);
  });

  it("maps both status displays and supplies a safe player visual fallback", () => {
    const init = makeInit();
    const board = makeBoard(init);
    const view = buildMobileBattleView(init, board, ENEMY_DREAMCALLER);

    expect(view.player.status).toEqual({
      dreamcaller: {
        imageNumber: "007",
        name: "Player Caller",
        title: "Builder of Fixtures",
        portraitFocus: { x: 0.48, y: 0.19 },
      },
      currentEnergy: 2,
      maxEnergy: 4,
      points: 5,
    });
    expect(view.enemy.status).toEqual({
      dreamcaller: {
        imageNumber: "008",
        name: "Enemy Caller",
        title: "Keeper of Tests",
        portraitFocus: { x: 0.58, y: 0.23 },
      },
      currentEnergy: 1,
      maxEnergy: 3,
      points: 8,
    });

    const fallback = buildMobileBattleView(
      { ...init, dreamcallerSummary: null },
      board,
      ENEMY_DREAMCALLER,
    );
    expect(fallback.player.status.dreamcaller).toEqual({
      imageNumber: "001",
      name: "Dreamcaller",
      title: "",
    });
  });
});
