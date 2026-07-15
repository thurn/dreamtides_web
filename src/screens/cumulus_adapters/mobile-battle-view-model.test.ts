import { describe, expect, it } from "vitest";
import { createInitialBattleState } from "../../battle/state/create-initial-state";
import { makeBattleTestState } from "../../battle/test-support";
import type {
  BattleDeckCardDefinition,
  BattleDreamcallerSummary,
  BattleInit,
  BattleMutableState,
} from "../../battle/types";
import { buildMobileBattleView } from "./mobile-battle-view-model";

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
    });
    expect(view.enemy.backRank[4].card).toMatchObject({
      id: board.sides.enemy.backRank.B4,
      figment: true,
      figmentTitleBar: true,
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

    expect(view.player.frontRank.map((slot) => slot.id)).toEqual(["F0", "F1", "F2", "F3"]);
    expect(view.enemy.frontRank.map((slot) => slot.id)).toEqual(["F0", "F1", "F2", "F3"]);
    expect(view.player.backRank.map((slot) => slot.id)).toEqual(["B0", "B1", "B2", "B3", "B4"]);
    expect(view.enemy.backRank.map((slot) => slot.id)).toEqual(["B0", "B1", "B2", "B3", "B4"]);
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
