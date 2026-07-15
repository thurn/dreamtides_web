import { describe, expect, it } from "vitest";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { rankSlotIds, type BattleSide } from "../types";
import { applyDebugEdit } from "../../rules/battle/apply-debug-edit";
import { createFillBattlefieldPreviewCommand } from "./battle-debug-preview";

const EMISSION = {
  sourceSurface: "debug-menu",
  selectedCardId: null,
} as const;

function makeBattle() {
  const init = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });
  return { init, board: createInitialBattleState(init) };
}

function occupiedCount(
  board: ReturnType<typeof createInitialBattleState>,
  side: BattleSide,
  rank: "frontRank" | "backRank",
): number {
  return Object.values(board.sides[side][rank]).filter(
    (battleCardId) => battleCardId !== null,
  ).length;
}

describe("createFillBattlefieldPreviewCommand", () => {
  it("atomically fills four front, five back, and five void cards per side", () => {
    const { init, board } = makeBattle();
    const existingPlayer = board.sides.player.hand.shift();
    const existingEnemy = board.sides.enemy.hand.shift();
    if (existingPlayer === undefined || existingEnemy === undefined) {
      throw new Error("Expected opening hands in battle fixture");
    }
    board.sides.player.frontRank.F0 = existingPlayer;
    board.sides.enemy.backRank.B0 = existingEnemy;
    const existingCardIds = new Set(Object.keys(board.cardInstances));

    const command = createFillBattlefieldPreviewCommand(init, 10_000);
    expect(command).toMatchObject({
      id: "DEBUG_EDIT",
      edit: { kind: "FILL_BATTLEFIELD_PREVIEW", createdAtMs: 10_000 },
      sourceSurface: "debug-menu",
    });
    if (
      command === null ||
      command.id !== "DEBUG_EDIT" ||
      command.edit.kind !== "FILL_BATTLEFIELD_PREVIEW"
    ) {
      throw new Error("Expected battlefield preview command");
    }
    const definitions = [
      ...command.edit.definitions.player,
      ...command.edit.definitions.enemy,
    ];
    expect(command.edit.definitions.player).toHaveLength(14);
    expect(command.edit.definitions.enemy).toHaveLength(14);
    expect(
      definitions.every(
        (definition) => definition.battleCardKind === "character",
      ),
    ).toBe(true);

    const next = applyDebugEdit(board, command.edit, EMISSION).state;

    for (const side of ["player", "enemy"] as const) {
      expect(occupiedCount(next, side, "frontRank")).toBe(4);
      expect(occupiedCount(next, side, "backRank")).toBe(5);
      expect(
        rankSlotIds(next.sides[side].frontRank)
          .slice(0, 4)
          .map((slotId) => next.sides[side].frontRank[slotId] !== null),
      ).toEqual([true, true, true, true]);
      expect(
        rankSlotIds(next.sides[side].backRank)
          .slice(0, 5)
          .map((slotId) => next.sides[side].backRank[slotId] !== null),
      ).toEqual([true, true, true, true, true]);
      expect(
        next.sides[side].void.filter(
          (battleCardId) => !existingCardIds.has(battleCardId),
        ),
      ).toHaveLength(5);
    }
    expect(next.sides.player.void).toContain(existingPlayer);
    expect(next.sides.enemy.void).toContain(existingEnemy);
  });

  it("fills twenty player battlefield slots while keeping nine enemy slots and both void previews", () => {
    const { init, board } = makeBattle();
    const existingCardIds = new Set(Object.keys(board.cardInstances));

    const command = createFillBattlefieldPreviewCommand(init, 10_000, {
      player: 20,
      enemy: 9,
    });
    if (
      command === null ||
      command.id !== "DEBUG_EDIT" ||
      command.edit.kind !== "FILL_BATTLEFIELD_PREVIEW"
    ) {
      throw new Error("Expected battlefield preview command");
    }

    expect(command.edit.definitions.player).toHaveLength(25);
    expect(command.edit.definitions.enemy).toHaveLength(14);

    const next = applyDebugEdit(board, command.edit, EMISSION).state;

    expect(occupiedCount(next, "player", "frontRank")).toBe(10);
    expect(occupiedCount(next, "player", "backRank")).toBe(10);
    expect(occupiedCount(next, "enemy", "frontRank")).toBe(4);
    expect(occupiedCount(next, "enemy", "backRank")).toBe(5);
    for (const side of ["player", "enemy"] as const) {
      expect(
        next.sides[side].void.filter(
          (battleCardId) => !existingCardIds.has(battleCardId),
        ),
      ).toHaveLength(5);
    }
  });

  it("does not construct a partial preview when neither deck has a character definition", () => {
    const { init } = makeBattle();
    const eventDefinition = [
      ...init.playerDeckOrder,
      ...init.enemyDeckDefinition,
    ].find((definition) => definition.battleCardKind === "event");
    if (eventDefinition === undefined) {
      throw new Error("Expected an event definition in battle fixture");
    }

    const command = createFillBattlefieldPreviewCommand(
      {
        ...init,
        playerDeckOrder: [eventDefinition],
        enemyDeckDefinition: [eventDefinition],
      },
      10_000,
    );

    expect(command).toBeNull();
  });

  it("continues to fold saved nine-card preview edits", () => {
    const { init, board } = makeBattle();
    const command = createFillBattlefieldPreviewCommand(init, 10_000);
    if (
      command === null ||
      command.id !== "DEBUG_EDIT" ||
      command.edit.kind !== "FILL_BATTLEFIELD_PREVIEW"
    ) {
      throw new Error("Expected battlefield preview command");
    }

    const next = applyDebugEdit(
      board,
      {
        ...command.edit,
        definitions: {
          player: command.edit.definitions.player.slice(0, 9),
          enemy: command.edit.definitions.enemy.slice(0, 9),
        },
      },
      EMISSION,
    ).state;

    for (const side of ["player", "enemy"] as const) {
      expect(occupiedCount(next, side, "frontRank")).toBe(4);
      expect(occupiedCount(next, side, "backRank")).toBe(5);
      expect(next.sides[side].void).toHaveLength(0);
    }
  });
});
