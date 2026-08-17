import { describe, expect, it } from "vitest";

import {
  drawsAtStartOfTurn,
  drawsDreamwellCardAtStartOfTurn,
  nextStartOfTurnPair,
} from "./turn-utils";

describe("drawsDreamwellCardAtStartOfTurn", () => {
  it("skips round 1 and draws from round 2 onward", () => {
    expect(drawsDreamwellCardAtStartOfTurn(1)).toBe(false);
    expect(drawsDreamwellCardAtStartOfTurn(2)).toBe(true);
    expect(drawsDreamwellCardAtStartOfTurn(50)).toBe(true);
  });
});

describe("drawsAtStartOfTurn", () => {
  it("skips the draw for the first player (player) on the battle's first turn", () => {
    expect(drawsAtStartOfTurn("player", 1)).toBe(false);
  });

  it("draws for the second player (enemy) on their first turn, which shares turnNumber 1", () => {
    // A player→enemy handoff keeps turnNumber at 1 (see nextStartOfTurnPair), so
    // the enemy's first turn also carries turnNumber 1 — but they must still draw.
    expect(drawsAtStartOfTurn("enemy", 1)).toBe(true);
  });

  it("draws for both sides on every later turn", () => {
    expect(drawsAtStartOfTurn("player", 2)).toBe(true);
    expect(drawsAtStartOfTurn("enemy", 2)).toBe(true);
    expect(drawsAtStartOfTurn("player", 50)).toBe(true);
    expect(drawsAtStartOfTurn("enemy", 50)).toBe(true);
  });

  it("agrees with the turn-pair advance: only the opening player→enemy pair carries turnNumber 1", () => {
    // First handoff: player active on turn 1 hands to enemy, turnNumber kept at 1.
    const toEnemy = nextStartOfTurnPair({ activeSide: "player", turnNumber: 1 });
    expect(toEnemy).toEqual({ side: "enemy", turnNumber: 1 });
    expect(drawsAtStartOfTurn(toEnemy.side, toEnemy.turnNumber)).toBe(true);

    // Next handoff: enemy active on turn 1 hands to player, turnNumber increments.
    const toPlayer = nextStartOfTurnPair({ activeSide: "enemy", turnNumber: 1 });
    expect(toPlayer).toEqual({ side: "player", turnNumber: 2 });
    expect(drawsAtStartOfTurn(toPlayer.side, toPlayer.turnNumber)).toBe(true);
  });
});
