import { describe, expect, it } from "vitest";
import {
  testCardName,
} from "../../types/test-identities";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import { createInitialBattleState } from "../../battle/state/create-initial-state";
import { makeBattleTestState } from "../../battle/test-support";
import type {
  BattleDeckCardDefinition,
  BattleAvatarSummary,
  BattleInit,
  BattleMutableState,
} from "../../battle/types";
import {
  buildMobileBattleView,
} from "./mobile-battle-view-model";
import type { PendingPrompt } from "../../rules/battle/fold";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { resolveBattleAiConfiguration } from "../../types/opponents-data";
import { builtInBattlePromptRef } from "../../data/dreamwell-prompts";
import { parseBattleId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { parseBattleEntryKey } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseOpponentId } from "../../types/identifiers";
import { parseBattleEffectScriptId } from "../../types/identifiers";
import { identityKeys } from "../../types/identifiers";
import { testAvatarId, testCardId } from "../../types/test-identities";

expect.addEqualityTesters([annotatedTextEquality]);

const ENEMY_AVATAR: BattleAvatarSummary = {
  id: testAvatarId("enemy-avatar-uuid"),
  name: "Enemy Caller",
  title: "Keeper of Tests",
  renderedText: "A synthetic test ability.",
  imageNumber: "008",
  portraitFocus: { x: 0.58, y: 0.23 },
};

function definition(index: number): BattleDeckCardDefinition {
  return {
    sourceDeckEntryId: null,
    cardId: testCardId(
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ),
    cardNumber: index,
    name: testCardName(`Fixture Card ${String(index)}`),
    battleCardKind: "character",
    subtype: "Warrior",
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
    battleId: parseBattleId("mobile-battle-fixture"),
    battleEntryKey: parseBattleEntryKey("battle-entry-fixture"),
    seed: 42,
    siteId: parseSiteId("battle-site-fixture"),
    dreamscapeId: parseAtlasNodeId("dreamscape-fixture"),
    completionLevelAtStart: 2,
    isFinalBoss: false,
    essenceReward: 30,
    openingHandSize: 3,
    scoreToWin: 10,
    turnLimit: 12,
    maxEnergyCap: 8,
    handLimit: 7,
    opponentsContentHash: opponentsFixture().contentHash,
    opponentAbilityActive: true,
    aiConfiguration: resolveBattleAiConfiguration(
      opponentsFixture(),
      "journey",
    ),
    startingSide: "player",
    playerDrawSkipsTurnOne: true,
    journeyDeckEntries: [],
    playerDeckOrder: Array.from({ length: 8 }, (_unused, index) =>
      definition(index + 1),
    ),
    dreamwellDeck: [],
    enemyDescriptor: {
      id: parseOpponentId(ENEMY_AVATAR.id),
      name: ENEMY_AVATAR.name,
      subtitle: ENEMY_AVATAR.title,
      imageNumber: ENEMY_AVATAR.imageNumber,
      portraitSeed: 7,
      abilityText: ENEMY_AVATAR.renderedText,
      dreamsigns: [],
      signatureCards: [],
    },
    enemyDeckDefinition: Array.from({ length: 8 }, (_unused, index) =>
      definition(index + 9),
    ),
    avatarSummary: {
      id: testAvatarId("player-avatar-uuid"),
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
  const ids = identityKeys(board.cardInstances);

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
    const view = buildMobileBattleView(init, board, ENEMY_AVATAR);

    expect(view.battleId).toBe(board.battleId);
    expect(view.activeSide).toBe(board.activeSide);
    expect(view.isOpeningTurn).toBe(true);
    expect(view.aiApproval).toBeNull();
    expect(view.phase).toBe("dawn");
    expect(view.perspective).toBe("player");
    expect(view.near).toBe(view.player);
    expect(view.far).toBe(view.enemy);
    expect(view.near.owner).toBe("player");
    expect(view.near.position).toBe("near");
    expect(view.far.owner).toBe("enemy");
    expect(view.far.position).toBe("far");
    expect(view.playerHand.map((card) => card.id)).toEqual(
      board.sides.player.hand,
    );
    expect(view.playerHand.map((card) => card.model.cardId)).toEqual(
      board.sides.player.hand.map(
        (id) => board.cardInstances[id].definition.cardId,
      ),
    );
    expect(view.player.frontRank[3].card).toMatchObject({
      id: board.sides.player.frontRank.F3,
      exhausted: true,
      figment: false,
      storedTime: 0,
    });
    expect(view.enemy.backRank[4].card).toMatchObject({
      id: board.sides.enemy.backRank.B4,
      figment: true,
      storedTime: 0,
    });

    board.activeSide = "enemy";
    expect(
      buildMobileBattleView(init, board, ENEMY_AVATAR).isOpeningTurn,
    ).toBe(false);
  });

  it("reverses board position without changing canonical lane order or result semantics", () => {
    const init = makeInit();
    const board = makeBoard(init);
    board.result = "victory";
    const view = buildMobileBattleView(init, board, ENEMY_AVATAR, null, {
      aiMode: false,
      isOpponentHandRevealed: false,
      isPlayerHandHidden: false,
      perspectiveSide: "enemy",
    });

    expect(view.perspective).toBe("enemy");
    expect(view.near.owner).toBe("enemy");
    expect(view.far.owner).toBe("player");
    expect(view.near.backRank.map((slot) => slot.id)).toEqual(
      Array.from({ length: 10 }, (_unused, index) => `B${String(index)}`),
    );
    expect(view.near.frontRank.map((slot) => slot.id)).toEqual(
      Array.from({ length: 9 }, (_unused, index) => `F${String(index)}`),
    );
    expect(view.nearHand.cardIds).toEqual(board.sides.enemy.hand);
    expect(view.nearHand.cards.map((card) => card.id)).toEqual(
      board.sides.enemy.hand,
    );
    expect(view.farHand.cardIds).toEqual(board.sides.player.hand);
    expect(view.farHand.cards).toEqual([]);
    expect(view.result).toMatchObject({
      outcome: "victory",
      essenceReward: 30,
    });
  });

  it("maps a confirmed pick-cards prompt into the inline hand picker", () => {
    const init = makeInit();
    const board = makeBoard(init);
    const prompt = {
      promptId: 42,
      run: {
        scriptRef: {
          table: "dreamwell",
          id: parseBattleEffectScriptId("prompt-fixture"),
        },
        cursor: [0],
        side: "player",
      },
      kind: "pick-cards",
      options: {
        kind: "pick-cards",
        label: builtInBattlePromptRef("generic"),
        subtitle: builtInBattlePromptRef("generic-subtitle"),
        candidateIds: board.sides.player.hand.slice(0, 2),
        count: 2,
        optional: false,
        highlightCardIds: board.sides.player.hand.slice(0, 1),
      },
    } satisfies PendingPrompt;

    const optimistic = buildMobileBattleView(
      init,
      board,
      ENEMY_AVATAR,
      null,
      {
        aiMode: false,
        isOpponentHandRevealed: false,
        isPlayerHandHidden: false,
        pendingPrompt: prompt,
        confirmedPromptId: null,
      },
    );
    expect(optimistic.cardPicker?.label).toEqual(expect.any(String));
    expect(optimistic.cardPicker?.subtitle).toEqual(expect.any(String));
    expect(optimistic.cardPicker).toMatchObject({
      key: prompt.promptId,
      candidateIds: prompt.options.candidateIds,
      count: 2,
      optional: false,
      canResolve: false,
      presentation: "board",
    });
    expect(
      optimistic.cardPicker?.candidates.map((candidate) => ({
        instanceId: candidate.instanceId,
        cardUuid: candidate.cardUuid,
        owner: candidate.owner,
        zone: candidate.zone,
        highlighted: candidate.highlighted,
      })),
    ).toEqual(
      prompt.options.candidateIds.map((instanceId, index) => ({
        instanceId,
        cardUuid: board.cardInstances[instanceId].definition.cardId,
        owner: "player",
        zone: "hand",
        highlighted: index === 0,
      })),
    );

    const confirmed = buildMobileBattleView(
      init,
      board,
      ENEMY_AVATAR,
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

    const mismatched = buildMobileBattleView(
      init,
      board,
      ENEMY_AVATAR,
      null,
      {
        aiMode: false,
        isOpponentHandRevealed: false,
        isPlayerHandHidden: false,
        perspectiveSide: "enemy",
        pendingPrompt: prompt,
        confirmedPromptId: prompt.promptId,
      },
    );
    expect(mismatched.cardPicker).toBeNull();
    expect(mismatched.promptNotice).toEqual({
      promptSide: "player",
    });
  });

  it("maps choice prompts into confirmed inline option controls", () => {
    const init = makeInit();
    const board = makeBoard(init);
    const prompt = {
      promptId: 44,
      run: {
        scriptRef: {
          table: "dreamwell",
          id: parseBattleEffectScriptId("prompt-fixture"),
        },
        cursor: [0],
        side: "player",
      },
      kind: "choice",
      options: {
        kind: "choice",
        label: builtInBattlePromptRef("generic"),
        options: [
          { label: builtInBattlePromptRef("generic-option") },
          { label: builtInBattlePromptRef("generic-option") },
        ],
      },
    } satisfies PendingPrompt;

    const optimistic = buildMobileBattleView(
      init,
      board,
      ENEMY_AVATAR,
      null,
      {
        aiMode: false,
        isOpponentHandRevealed: false,
        isPlayerHandHidden: false,
        pendingPrompt: prompt,
        confirmedPromptId: null,
      },
    );
    expect(optimistic.choicePrompt?.label).toEqual(expect.any(String));
    expect(optimistic.choicePrompt?.options[0]?.label).toEqual(expect.any(String));
    expect(optimistic.choicePrompt?.options[1]?.label).toEqual(expect.any(String));
    expect(optimistic.choicePrompt).toMatchObject({
      key: prompt.promptId,
      canResolve: false,
    });

    const confirmed = buildMobileBattleView(
      init,
      board,
      ENEMY_AVATAR,
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

  it("marks only affordable player hand cards during the player's Day phase", () => {
    const init = makeInit();
    const board = makeBoard(init);
    board.phase = "day";

    expect(
      buildMobileBattleView(init, board, ENEMY_AVATAR).playerHand.map(
        (card) => card.showPlayableOutline,
      ),
    ).toEqual([true, true, false]);

    board.phase = "dusk";

    expect(
      buildMobileBattleView(init, board, ENEMY_AVATAR).playerHand.map(
        (card) => card.showPlayableOutline,
      ),
    ).toEqual([false, false, false]);

    board.phase = "day";
    board.activeSide = "enemy";

    expect(
      buildMobileBattleView(init, board, ENEMY_AVATAR).playerHand.map(
        (card) => card.showPlayableOutline,
      ),
    ).toEqual([false, false, false]);
  });

  it("preserves hand and deck order while exposing hidden zones as ids only", () => {
    const init = makeInit();
    const board = makeBoard(init);
    const view = buildMobileBattleView(init, board, ENEMY_AVATAR);

    expect(view.enemyHandCardIds).toEqual(board.sides.enemy.hand);
    expect(view.enemyHandCardIds).toHaveLength(2);
    expect(view.playerHand.map((card) => card.id)).toEqual(
      board.sides.player.hand,
    );
    expect(view.player.deckCardIds).toEqual(board.sides.player.deck);
    expect(view.enemy.deckCardIds).toEqual(board.sides.enemy.deck);
    expect(view.player.banishedCardCount).toBe(
      board.sides.player.banished.length,
    );
    expect(view.enemy.banishedCardCount).toBe(
      board.sides.enemy.banished.length,
    );
    expect(view.player.deckCardIds[0]).toBe(board.sides.player.deck[0]);
    expect(view.enemy.deckCardIds[0]).toBe(board.sides.enemy.deck[0]);
  });
});

