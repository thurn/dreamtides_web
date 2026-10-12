import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, anyCharacter, enemyCharacter, characterYouControl, count, energy, event, fromVoid, keyword, staticAbility, target, times } from "../../../dsl/builders";
import { NO_DECK_MODS, type Ability, type ValueExpr } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import type { Answer } from "../../../prompts/types";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { boardState, placeFigment } from "../../../testing/board";
import { CONTINUOUS, CONTINUOUS_CARDS } from "../../../testing/continuous-cards";
import { DSL } from "../../../testing/dsl-cards";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId, SYNTHETIC as v, testCatalog } from "../../../testing/synthetic-cards";
import { parseAvatarId, parseDreamsignId } from "../../../../types/identifiers";
import { abandon } from "../abandon";
import { banishCards } from "../banish-cards";
import { CHOSEN_SUBTYPE, chooseSubtype } from "../choose-subtype";
import { createCopyInHand } from "../create-copy-in-hand";
import { gainAbilities } from "../gain-abilities";
import { gainControl } from "../gain-control";
import { dissolve } from "../dissolve";
import { passUntil } from "../../../testing/trigger-harness";
import { gainEnergy } from "../gain-energy";
import { selfCostReduction } from "../self-cost-reduction";
import { sequence } from "../sequence";

const live = count(characterYouControl({ subtype: "Warrior" }));
const card = (index: number, abilities: readonly Ability[], cost = 5): EngineCardDefinition => ({
  ...DSL.selfCostWarrior, id: syntheticId(0x55510 + index), costs: [energy(cost)], abilities: () => abilities,
});
const F = {
  hand: card(0, [staticAbility(selfCostReduction(live), { zone: "hand" }), keyword("reclaim")]),
  void: card(1, [staticAbility(selfCostReduction(live), { zone: "void" }), keyword("reclaim")]),
  any: card(2, [staticAbility(selfCostReduction(live), { zone: "any" }), keyword("reclaim")]),
  play: card(3, [staticAbility(selfCostReduction(live))]),
  remove: { ...v.event0, id: syntheticId(0x55514), status: "authored", abilities: () => [event(abandon())] } satisfies EngineCardDefinition,
  control: { ...v.event0, id: syntheticId(0x55515), status: "authored", abilities: () => [event(gainControl(target(anyCharacter())))] } satisfies EngineCardDefinition,
  collector: card(6, [activated([], gainAbilities(banishCards([fromVoid({ cardType: "character" }, { player: "opponent" })])))], 4),
  copy: { ...v.event0, id: syntheticId(0x55517), status: "authored", abilities: () => [event(createCopyInHand(target(characterYouControl())))] } satisfies EngineCardDefinition,
  chosen: card(8, [activated([], chooseSubtype({ self: true })), staticAbility(selfCostReduction(count(characterYouControl({ subtype: CHOSEN_SUBTYPE }))))]),
  responseSource: { ...v.event0, id: syntheticId(0x5551c), costs: [energy(5)], status: "authored", abilities: () => [staticAbility(selfCostReduction(live), { zone: "any" }), event(gainEnergy(0))] } satisfies EngineCardDefinition,
  interrupt: { ...v.interruptEvent, id: syntheticId(0x5551a), status: "authored", abilities: () => [event(dissolve(target(enemyCharacter())))] } satisfies EngineCardDefinition,
  floor: card(11, [staticAbility(selfCostReduction(9), { zone: "any" })]),
  offering: card(9, [staticAbility(selfCostReduction(live), { zone: "any" }), keyword("offering")]),
};
const engine = createEngine(testCatalog([DSL.selfCostWarrior, DSL.takeFromOpponentHand, ...Object.values(F), ...CONTINUOUS_CARDS]));
const filler = Array.from({ length: 6 }, () => v.vanilla1.id);
const cost = (state: BattleState, id: InstanceId, side: Side = "player") => engine.view(state, side).instances[id]?.characteristics.cost;
const play = (state: BattleState, id: InstanceId, side: Side = "player", answers: readonly Answer[] = []) => engine.apply(state, side, { kind: "play", card: id, from: "hand" }, new ScriptedSource(answers));
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });

describe("selfCostReduction public contracts", () => {
  it.each(["player", "enemy"] as const)("binds each physical source once, reads %s's controlled Warriors, and leaves another matching card unaffordable", (side) => {
    const other: Side = side === "player" ? "enemy" : "player";
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [DSL.selfCostWarrior.id, DSL.selfCostWarrior.id, v.vanilla3.id], back: [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id], energy: 2 }, [other]: { back: [v.vanilla1.id] } });
    const [first, second, unrelated] = ids[side].hand;
    expect([cost(state, first, side), cost(state, second, side), cost(state, unrelated, side)]).toEqual([2, 2, 3]);
    const legal = engine.legalActions(state, side);
    for (const id of [first, second]) expect(legal).toContainEqual({ kind: "play", card: id, from: "hand" });
    expect(legal).not.toContainEqual({ kind: "play", card: unrelated, from: "hand" });
    const paid = play(state, first, side);
    expect(paid.state.sides[side].currentEnergy).toBe(0);
    expect(cost(paid.state, second, side)).toBe(1);
    expect(cost(paid.state, unrelated, side)).toBe(3);
    expect(paid.events.filter((e) => e.kind === "energyChanged" && e.cause === "payment")).toMatchObject([{ change: -2 }]);
    expect(invariantViolations(paid.state, engine.catalog)).toEqual([]);
    expect(state.floating).toEqual([]);
  });

  it.each([
    { fixture: F.hand, zone: "hand" as const, expected: 3 }, { fixture: F.hand, zone: "void" as const, expected: 5 },
    { fixture: F.void, zone: "hand" as const, expected: 5 }, { fixture: F.void, zone: "void" as const, expected: 3 },
    { fixture: F.any, zone: "hand" as const, expected: 3 }, { fixture: F.any, zone: "void" as const, expected: 3 },
    { fixture: F.play, zone: "hand" as const, expected: 5 },
  ])("observes functional $zone for $fixture.id", ({ fixture, zone, expected }) => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { [zone]: [fixture.id], back: [v.vanilla1.id, v.vanilla1.id], energy: 5 } });
    const source = ids.player[zone][0];
    expect(cost(state, source)).toBe(expected);
    if (fixture !== F.play) {
      const result = engine.apply(state, "player", { kind: "play", card: source, from: zone }, new ScriptedSource([]));
      expect(result.state.sides.player.currentEnergy).toBe(5 - expected);
    }
  });

  it("reads live control and removals, including figments, earlier type layers and deck type changes", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [DSL.selfCostWarrior.id, F.remove.id, F.control.id, CONTINUOUS.shapeshift.id], back: [v.vanilla1.id], energy: 8 }, enemy: { back: [v.vanilla1.id] } });
    const source = ids.player.hand[0];
    expect(cost(state, source)).toBe(4);
    const controlled = play(state, ids.player.hand[2], "player", [[ids.enemy.back[0]!]]);
    expect(cost(controlled.state, source)).toBe(3);
    const removed = play(controlled.state, ids.player.hand[1], "player", [[ids.player.back[0]!]]);
    expect(cost(removed.state, source)).toBe(4);
    const layered = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [DSL.selfCostWarrior.id], back: [CONTINUOUS.everyType.id], energy: 8 } });
    expect(cost(layered.state, layered.ids.player.hand[0])).toBe(4);
    placeFigment(layered.state, "player", { rank: "front", index: 0 }, { kind: "figmentCopy", cardId: v.vanilla1.id, spark: null });
    // New committed state/version makes the public memo observe the added synthetic fixture.
    expect(cost({ ...layered.state, version: layered.state.version + 1 }, layered.ids.player.hand[0])).toBe(3);
    const changed = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [DSL.selfCostWarrior.id], back: [v.vanilla1.id] } });
    const warrior = changed.ids.player.back[0]!;
    changed.state.instances[warrior] = { ...changed.state.instances[warrior], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: CONTINUOUS.everyType.subtype } } } };
    expect(cost(changed.state, changed.ids.player.hand[0])).toBe(5);
  });

  it("rewrites the chosen subtype inside a live value before counting", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [F.chosen.id, CONTINUOUS.everyType.id] } });
    const source = ids.player.back[0]!;
    expect(cost(state, source)).toBe(5);
    const mage = engine.catalog.characterTypes.indexOf(CONTINUOUS.everyType.subtype);
    const result = engine.apply(state, "player", { kind: "activate", source, ability: 0 }, new ScriptedSource([mage]));
    expect(cost(result.state, source)).toBe(3);
  });

  it("binds acquired and copied abilities to their host, preserving the donor's physical source", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [F.collector.id, v.vanilla1.id], hand: [F.copy.id], energy: 4 }, enemy: { void: [DSL.selfCostWarrior.id] } });
    const host = ids.player.back[0]!;
    const acquired = engine.apply(state, "player", { kind: "activate", source: host, ability: 0 }, new ScriptedSource([[ids.enemy.void[0]]]));
    expect(cost(acquired.state, host)).toBe(2);
    const copied = play(acquired.state, ids.player.hand[0], "player", [[host]]);
    const copy = copied.state.sides.player.hand.find((id) => id !== ids.player.hand[0])!;
    expect(copy).not.toBe(host);
    expect(cost(copied.state, copy)).toBe(4);
    expect(cost(copied.state, host)).toBe(2);
    expect(cost(copied.state, ids.enemy.void[0])).toBe(5);
    expect(invariantViolations(copied.state, engine.catalog)).toEqual([]);
    const printed = boardState(engine.catalog, { active: "player", phase: "day", player: { front: [DSL.selfCostWarrior.id], back: [v.vanilla1.id], hand: [F.copy.id], energy: 5 } });
    const copiedPrinted = play(printed.state, printed.ids.player.hand[0], "player", [[printed.ids.player.front[0]!]]);
    const printedCopy = copiedPrinted.state.sides.player.hand[0];
    expect(printedCopy).not.toBe(printed.ids.player.front[0]);
    expect(cost(copiedPrinted.state, printedCopy)).toBe(3);
    expect(cost(copiedPrinted.state, printed.ids.player.front[0]!)).toBe(3);
  });

  it("uses the current holder as controller while ownership stays with the opponent", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [DSL.takeFromOpponentHand.id], back: [v.vanilla1.id], energy: 5 }, enemy: { hand: [DSL.selfCostWarrior.id], back: [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id] } });
    const source = ids.enemy.hand[0];
    expect(cost(state, source, "enemy")).toBe(2);
    const held = play(state, ids.player.hand[0], "player", [[source]]);
    expect(held.state.instances[source]).toMatchObject({ owner: "enemy", controller: "player", zone: "hand" });
    expect(cost(held.state, source)).toBe(4);
    expect(play(held.state, source).state.sides.player.currentEnergy).toBe(1);
  });

  it("floors only the source at zero and does not create a saved reduction", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [F.floor.id, v.vanilla3.id], energy: 0 } });
    expect(cost(state, ids.player.hand[0])).toBe(0);
    expect(cost(state, ids.player.hand[1])).toBe(3);
    expect(play(state, ids.player.hand[0]).state.sides.player.currentEnergy).toBe(0);
    expect(state.floating).toEqual([]);
  });

  it("keeps paid energy through an actual Interrupt that changes the live Warrior count", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [F.responseSource.id], back: [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id], energy: 2 }, enemy: { hand: [F.interrupt.id], energy: 1 } });
    const source = ids.player.hand[0];
    const played = play(state, source);
    expect(played.state.instances[source].zone).toBe("stack");
    expect(played.state.sides.player.currentEnergy).toBe(0);
    const interrupted = play(played.state, ids.enemy.hand[0], "enemy", [[ids.player.back[0]!]]);
    const settled = passUntil(engine, interrupted.state, (current) => current.stack.length === 0);
    expect(settled.state.instances[ids.player.back[0]!].zone).toBe("void");
    expect(settled.state.instances[source].zone).toBe("void");
    expect(settled.state.sides.player.currentEnergy).toBe(0);
    expect(cost(settled.state, source)).toBe(3);
  });

  it("stores no live reduction and reconstructs it after a saved-state round trip", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [DSL.selfCostWarrior.id], back: [v.vanilla1.id], energy: 4 } });
    const loaded = deserializeState(serializeState(state));
    expect(stateHash(loaded)).toBe(stateHash(state));
    expect(loaded.floating).toEqual([]);
    expect(engine.view(loaded, "player")).toEqual(engine.view(state, "player"));
    expect(engine.legalActions(loaded, "player")).toEqual(engine.legalActions(state, "player"));
    expect(play(loaded, ids.player.hand[0]).state.sides.player.currentEnergy).toBe(0);
  });

  it("replays a suspended play route after reload, rejects foreign/stale/concurrent answers and charges once", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [F.offering.id, v.vanilla1.id], back: [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id], energy: 5, deck: filler }, enemy: { deck: filler } });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const choosing = fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (choosing.kind !== "applied" || choosing.error !== null) throw new Error("expected route choice");
    const saved = JSON.parse(JSON.stringify(choosing.slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const pending = fresh.pending(saved)!;
    expect(pending.prompt.purpose.role).toBe("playRoute");
    const answer = (from: BattleSlice, side: Side = "player", value = 0) => fresh.reduce(from, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(answer(saved, "enemy")).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer({ ...saved, attempt: saved.attempt + 1 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(answer(saved, "player", 9)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(saved.committed.sides.player.currentEnergy).toBe(5);
    const done = answer(saved);
    if (done.kind !== "applied" || done.error !== null) throw new Error("expected normal play");
    expect(done.slice.committed.sides.player.currentEnergy).toBe(3);
    expect(answer(done.slice)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it.each([false, true])("rejects resolving misuse (nested=$nested) and recovers without static records", (nested) => {
    const effect = selfCostReduction(1);
    const invalid = { ...v.event0, id: syntheticId(0x55530 + Number(nested)), status: "authored", abilities: () => [event(nested ? sequence(gainEnergy(1), effect) : effect)] } satisfies EngineCardDefinition;
    const bad = createEngine(testCatalog([invalid]));
    const { state, ids } = boardState(bad.catalog, { active: "player", phase: "day", player: { hand: [invalid.id], energy: 2 } });
    const result = createFoldAdapter(bad).reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (result.kind !== "applied") throw new Error("expected recovered engine error");
    expect(result.error).not.toBeNull();
    expect(result.slice.inFlight).toBeNull();
    expect(result.slice.committed.floating).toEqual([]);
    expect(result.slice.committed.sides.player.currentEnergy).toBe(2);
  });

  it.each([-1, 0.5, NaN, Infinity])("rejects malformed literal and live reduction %s", (amount) => {
    expect(() => selfCostReduction(amount)).toThrow();
    const expression: ValueExpr = times(count(characterYouControl()), amount);
    const invalid = card(0x30, [staticAbility(selfCostReduction(expression), { zone: "any" })]);
    const bad = createEngine(testCatalog([invalid]));
    const { state } = boardState(bad.catalog, { active: "player", phase: "day", player: { hand: [invalid.id], back: [v.vanilla1.id] } });
    expect(() => bad.view(state, "player")).toThrow();
  });

  it("does not assign a card reduction to avatar or dreamsign sources", () => {
    const avatar = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000055540"), status: "authored" as const, abilities: () => [staticAbility(selfCostReduction(3))] };
    const dreamsign = { id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000055541"), status: "authored" as const, abilities: () => [staticAbility(selfCostReduction(3))] };
    const emblems = createEngine(testCatalog([], { avatars: [avatar], dreamsigns: [dreamsign] }));
    const { state, ids } = boardState(emblems.catalog, { active: "player", phase: "day", player: { hand: [v.vanilla3.id], avatar: avatar.id, dreamsigns: [dreamsign.id], energy: 2 } });
    expect(emblems.view(state, "player").instances[ids.player.hand[0]].characteristics.cost).toBe(3);
    expect(emblems.legalActions(state, "player")).not.toContainEqual({ kind: "play", card: ids.player.hand[0], from: "hand" });
  });
});
