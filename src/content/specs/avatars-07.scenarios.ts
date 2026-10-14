/** D20: production Avatar wiring for filtered ordinals and a targeted void grant. */
import { expect } from "vitest";
import { createEngine } from "../../engine/engine";
import { hasKeyword } from "../../engine/rules/keywords";
import { opponent, type Side } from "../../engine/state/ids";
import { ScriptedSource } from "../../engine/steps/sources";
import { playFromHand, runScenario, type NamedScenario, type ScenarioModule, type ScenarioResult, type ScenarioSpec, type ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { parseAvatarId } from "../../types/identifiers";
import eldrik from "../avatars/eldrik-bfc40414";
import rael from "../avatars/rael-84e7020c";
import valdren from "../avatars/valdren-91d4c3b5";

const engine = createEngine(testCatalog([], { avatars: [rael, valdren, eldrik].map(avatar => ({
  id: parseAvatarId(avatar.id), status: "authored", abilities: avatar.abilities!,
})) }));
const deck = Array.from({ length: 16 }, () => v.vanilla0.id);
const scenarios: NamedScenario[] = [];
const activate = (side: Side): ScenarioStep => ({ side, action: { kind: "activate", source: { kind: "avatar", side }, ability: 0 } });
function add(name: string, spec: ScenarioSpec, check: (result: ScenarioResult) => void): void {
  scenarios.push({ name, spec: { board: { active: "player", phase: "day" }, steps: () => [] },
    check: () => check(runScenario(engine, spec)) });
}
function nextOwnDay(state: ScenarioResult["state"], side: Side) {
  const away = passUntil(engine, state, at(engine, opponent(side), "day"));
  return passUntil(engine, away.state, at(engine, side, "day")).state;
}

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  add(`${rael.id} ${side} foresees exactly once on the second Event among mixed plays`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(rael.id), deck,
      hand: [v.event0.id, v.vanilla0.id, v.event0.id, v.event0.id] }, [other]: { deck } },
    steps: ids => [0, 1, 2, 3].map(index => playFromHand(ids, side, index)),
    answers: ids => [[{ card: ids[side].deck[1], to: "top" }, { card: ids[side].deck[0], to: "void" }]],
  }, ({ state, ids, events }) => {
    expect(events.filter(event => event.kind === "foresaw")).toEqual([
      { kind: "foresaw", side, kept: [ids[side].deck[1]], voided: [ids[side].deck[0]] },
    ]);
    expect(state.sides[side].deck).toEqual(ids[side].deck.slice(1));
    expect(state.instances[ids[side].deck[0]].zone).toBe("void");
    expect(events.filter(event => event.kind === "cardDrawn")).toEqual([]);
    expect(state.turnLog.played[side].map(card => card.instance)).toEqual(ids[side].hand);
  });
  add(`${rael.id} ${side} needs two new Events after ordinary turn transitions`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(rael.id), deck,
      hand: [v.event0.id, v.event0.id, v.event0.id] }, [other]: { deck } },
    steps: ids => [playFromHand(ids, side)],
  }, ({ state, ids, events }) => {
    expect(events.filter(event => event.kind === "foresaw")).toEqual([]);
    let current = nextOwnDay(state, side);
    const first = engine.apply(current, side, { kind: "play", card: ids[side].hand[1], from: "hand" }, new ScriptedSource([]));
    expect(first.events.filter(event => event.kind === "foresaw")).toEqual([]);
    current = first.state;
    const top = current.sides[side].deck.slice(0, 2);
    const source = new ScriptedSource([top.map(card => ({ card, to: "top" as const }))]);
    const second = engine.apply(current, side, { kind: "play", card: ids[side].hand[2], from: "hand" }, source);
    source.assertExhausted();
    expect(second.events.filter(event => event.kind === "foresaw")).toEqual([{ kind: "foresaw", side, kept: top, voided: [] }]);
    expect(second.state.turnLog.played[side].map(card => card.instance)).toEqual(ids[side].hand.slice(1));
  });
  add(`${eldrik.id} ${side} discounts only the first physical Warrior after nonmatching plays`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(eldrik.id), deck, energy: 6,
      hand: [v.survivorVictim.id, v.event0.id, v.vanilla3.id, v.vanilla3.id] }, [other]: { deck } },
    steps: ids => [0, 1, 2, 3].map(index => playFromHand(ids, side, index)),
  }, ({ state, ids }) => {
    expect(state.sides[side].currentEnergy).toBe(0);
    expect(state.turnLog.played[side].map(card => card.instance)).toEqual(ids[side].hand);
    expect(state.turnLog.played[side].map(card => card.subtype)).toEqual(["Survivor", "", "Warrior", "Warrior"]);
    for (const id of [ids[side].hand[0], ...ids[side].hand.slice(2)]) expect(state.instances[id].zone).toBe("play");
  });
  add(`${eldrik.id} ${side} renews the first-Warrior payment after ordinary turn transitions`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(eldrik.id), deck, energy: 8,
      hand: [v.vanilla3.id, v.vanilla3.id] }, [other]: { deck } },
    steps: ids => [playFromHand(ids, side)],
  }, ({ state, ids }) => {
    expect(state.sides[side].currentEnergy).toBe(6);
    expect(engine.view(state, side).instances[ids[side].hand[1]].characteristics.cost).toBe(3);
    const next = nextOwnDay(state, side);
    expect(engine.view(next, side).instances[ids[side].hand[1]].characteristics.cost).toBe(2);
    const played = engine.apply(next, side, { kind: "play", card: ids[side].hand[1], from: "hand" }, new ScriptedSource([]));
    expect(next.sides[side].currentEnergy - played.state.sides[side].currentEnergy).toBe(2);
    expect(played.state.instances[ids[side].hand[1]].zone).toBe("play");
  });
  add(`${valdren.id} ${side} grants one duplicate physical Warrior plain Reclaim and pays its normal cost`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(valdren.id), deck, energy: 5,
      void: [v.vanilla3.id, v.vanilla3.id, v.survivorVictim.id] }, [other]: { deck, void: [v.vanilla3.id] } },
    steps: ids => [activate(side), { side, action: { kind: "play", card: ids[side].void[1], from: "void" } }],
    answers: ids => [[ids[side].void[1]]],
  }, ({ state, ids, events }) => {
    const target = ids[side].void[1];
    expect(state.sides[side].currentEnergy).toBe(0);
    expect(state.sides[side].avatar?.exhausted).toBe(true);
    expect(state.instances[target].zone).toBe("play");
    expect(state.instances[target].status.reclaimed).toBe(true);
    expect(hasKeyword(state, engine.catalog, target, "reclaim")).toBe(true);
    for (const id of [ids[side].void[0], ids[side].void[2], ids[other].void[0]]) {
      expect(state.instances[id].zone).toBe("void");
      expect(hasKeyword(state, engine.catalog, id, "reclaim")).toBe(false);
    }
    expect(events.filter(event => event.kind === "effectStarted")).toEqual([
      expect.objectContaining({ controller: side, source: { kind: "avatar", side }, expiry: { at: "endOfTurn" },
        change: { kind: "keyword", instance: target, keyword: "reclaim", gains: true } }),
    ]);
    expect(state.turnLog.played[side].map(card => card.instance)).toEqual([target]);
  });
  add(`${valdren.id} ${side} expires an unplayed physical void grant at ordinary Ending`, {
    board: { active: side, phase: "day", [side]: { avatar: parseAvatarId(valdren.id), deck, energy: 2,
      void: [v.vanilla3.id] }, [other]: { deck } },
    steps: () => [activate(side)],
  }, ({ state, ids }) => {
    const target = ids[side].void[0];
    expect(hasKeyword(state, engine.catalog, target, "reclaim")).toBe(true);
    const afterEnding = passUntil(engine, state, at(engine, other, "day")).state;
    expect(hasKeyword(afterEnding, engine.catalog, target, "reclaim")).toBe(false);
    expect(afterEnding.instances[target].zone).toBe("void");
    expect(afterEnding.floating).toEqual([]);
  });
}

export default { slug: "avatars-07", scenarios } satisfies ScenarioModule;
