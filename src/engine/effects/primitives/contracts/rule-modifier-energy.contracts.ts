/** Carry preserves one refresh and the ordinary Dreamwell refill at first/later turn boundaries. */
import { describe, expect, it } from "vitest";
import { energy, staticAbility, all, characterYouControl } from "../../../dsl/builders";
import { atStartOfTurn, triggered } from "../../../dsl/triggers";
import { SIDES, opponent } from "../../../state/ids";
import { SYNTHETIC as v, SYNTHETIC_DREAMWELL, syntheticId } from "../../../testing/synthetic-cards";
import { drawDreamwell } from "../draw-dreamwell";
import { gainEnergy } from "../gain-energy";
import { gainMaxEnergy } from "../gain-max-energy";
import { loseAllAbilities } from "../lose-all-abilities";
import { ruleModifier } from "../rule-modifier";
import { sequence } from "../sequence";
import { SIGN, card, deck, drain, signs, step, world } from "./rule-modifier-support";

const well = SYNTHETIC_DREAMWELL[0];

describe("ruleModifier energy carry", () => {
  it.each(SIDES.flatMap(side => [false, true].flatMap(first => [false, true].map(extra => ({ side, first, extra })))))("refreshes $side first=$first extra=$extra exactly once", ({ side, first, extra }) => {
    const w = world(side, [], { active: opponent(side), phase: "ending", round: 1,
      [side]: { dreamsigns: [SIGN.stone], energy: 5, deck }, [opponent(side)]: { deck } });
    w.state.sides[side].currentEnergy = 3;
    w.state.turn.sideTurns[side] = first ? 0 : 2;
    if (extra) w.state.turn.extraTurns.push(side);
    // An extra turn draws even in round one; ordinary round-one turns do not.
    if (extra) w.state.dreamwell = { catalog: [well.id], deck: [well.id], next: 0 };
    const result = step(w.engine, w.state, { kind: "advancePhase" });
    const added = extra ? well.energyAdded : 0;
    expect(result.state.sides[side]).toMatchObject({ currentEnergy: (first ? 5 : 8) + added, maxEnergy: 5 + added });
    expect(result.state.sides[opponent(side)].currentEnergy).toBe(w.state.sides[opponent(side)].currentEnergy);
  });
  it.each(SIDES.flatMap(side => [0, 5, 12].flatMap(current => [0, 1, 2].map(copies => ({ side, current, copies })))))("keeps the standalone refill for $side current=$current copies=$copies", ({ side, current, copies }) => {
    const spell = card(10, drawDreamwell(), { costs: [energy(0)] });
    const w = world(side, [spell], { [side]: { dreamsigns: Array.from({ length: copies }, () => SIGN.stone), hand: [spell.id], energy: 5, deck } });
    w.state.sides[side].currentEnergy = current;
    w.state.dreamwell = { catalog: [well.id], deck: [well.id], next: 0 };
    const cast = step(w.engine, w.state, { kind: "play", card: w.ids[side].hand[0], from: "hand" });
    const result = step(w.engine, cast.state, { kind: "resolveTop" });
    expect(result.state.sides[side]).toMatchObject({ maxEnergy: 6, currentEnergy: copies > 0 ? Math.max(current + 1, 6) : 6 });
    expect(result.events.filter(e => e.kind === "dreamwellDrawn")).toHaveLength(1);
  });
  it.each(SIDES)("reads start-of-turn changes before the refresh for %s", side => {
    const start = { id: SIGN.apple, status: "authored" as const, abilities: () => [triggered(atStartOfTurn(), sequence(gainEnergy(4), gainMaxEnergy(2)))] };
    const w = world(side, [], { active: opponent(side), phase: "ending", round: 1,
      [side]: { dreamsigns: [SIGN.stone, SIGN.apple], energy: 5, deck }, [opponent(side)]: { deck } }, [signs[1], start]);
    w.state.sides[side].currentEnergy = 3;
    w.state.turn.sideTurns[side] = 2;
    const beginning = step(w.engine, w.state, { kind: "advancePhase" });
    expect(beginning.state.turn.beginning).toBe(true);
    expect(beginning.state.sides[side].currentEnergy).toBe(3);
    const resolved = drain(w.engine, beginning.state);
    expect(resolved.sides[side]).toMatchObject({ currentEnergy: 7, maxEnergy: 7 });
    const refreshed = step(w.engine, resolved, { kind: "advancePhase" });
    expect(refreshed.state.sides[side]).toMatchObject({ currentEnergy: 14, maxEnergy: 7 });
  });
  it("removes carry when its physical source loses its static ability", () => {
    const carrier = { ...v.vanilla1, id: syntheticId(0x236112), subtype: "Mage" as const,
      abilities: () => [staticAbility(ruleModifier({ rule: "carryEnergy" }))] };
    const removal = card(11, loseAllAbilities(all(characterYouControl({ subtype: "Mage" }))), { costs: [energy(0)] });
    const w = world("player", [carrier, removal], { player: { back: [carrier.id], hand: [removal.id], energy: 5, deck } });
    const cast = step(w.engine, w.state, { kind: "play", card: w.ids.player.hand[0], from: "hand" });
    const removed = step(w.engine, cast.state, { kind: "resolveTop" });
    const before = { ...removed.state, turn: { ...removed.state.turn, active: "enemy" as const, lastNormal: "enemy" as const, phase: "ending" as const, round: 1 } };
    before.sides.player.currentEnergy = 3;
    const next = step(w.engine, before, { kind: "advancePhase" });
    expect(next.state.sides.player.currentEnergy).toBe(5);
  });
});
