/** D20: a drawn-card conjunction and an entry-only benefit retain physical subjects. */
import { expect } from "vitest";
import type { EngineCardDefinition } from "../../engine/catalog";
import { characteristicsOf } from "../../engine/continuous/characteristics";
import { adjustedEnergy, costModifier } from "../../engine/continuous/costs";
import { energy, event } from "../../engine/dsl/builders";
import { createEngine } from "../../engine/engine";
import { eventSeenBy } from "../../engine/events";
import { draw } from "../../engine/effects/primitives/draw";
import { deserializeState, serializeState, stateHash } from "../../engine/state/hash";
import { opponent, type Side } from "../../engine/state/ids";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { boardState } from "../../engine/testing/board";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { parseDreamsignId } from "../../types/identifiers";
import feather from "../dreamsigns/blue-feather-1dfa4d90";
import key from "../dreamsigns/silver-key-11018e32";

const featherId = parseDreamsignId(feather.id), keyId = parseDreamsignId(key.id);
const drawer: EngineCardDefinition = { ...v.interruptEvent, id: syntheticId(0x255001), costs: [energy(0)],
  status: "authored", abilities: () => [event(draw(2))] };
const engine = createEngine(testCatalog([drawer], { dreamsigns: [
  { id: featherId, status: "authored", abilities: feather.abilities! },
  { id: keyId, status: "authored", abilities: key.abilities! },
] }));
const deck = Array.from({ length: 12 }, () => v.vanilla3.id);
const scenarios: NamedScenario[] = [];
const empty = { board: { active: "player" as const, phase: "day" as const }, steps: () => [] };
const settled = (side: Side) => (state: Parameters<typeof engine.decision>[0]) =>
  state.stack.length === 0 && state.triggerQueue.length === 0 && at(engine, side, "day")(state);

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  for (const occasion of ["first-warrior", "first-nonwarrior", "opponent-turn"] as const) {
    scenarios.push({
      name: `${feather.id} ${side} ${occasion} preserves ordinal, turn, private subject and permanent benefits`,
      spec: empty,
      check: () => {
        const active = occasion === "opponent-turn" ? other : side;
        const b = boardState(engine.catalog, { active, phase: "day",
          [side]: { dreamsigns: [featherId], hand: [drawer.id], energy: 8,
            deck: [occasion === "first-nonwarrior" ? v.event1.id : v.vanilla3.id, ...deck] },
          [other]: { hand: active === other ? [v.event0.id] : [], deck, energy: 8 } });
        let state = b.state;
        if (active === other) state = engine.apply(state, other, { kind: "play", card: b.ids[other].hand[0], from: "hand" }, NO_PROMPTS).state;
        const cast = engine.apply(state, side, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
        const done = passUntil(engine, cast.state, settled(active));
        const events = [...cast.events, ...done.events];
        const [first, later] = b.ids[side].deck;
        const yes = occasion === "first-warrior";
        expect(events.flatMap(e => e.kind === "cardDrawn" && e.side === side ? [e.instance] : [])).toEqual([first, later]);
        expect([first, later].map(id => done.state.instances[id].status.gainedSpark)).toEqual([yes ? 2 : 0, 0]);
        const costs = events.filter(e => e.kind === "effectStarted" && e.change.kind === "cardCost");
        expect(costs).toEqual(yes ? [expect.objectContaining({ source: { kind: "dreamsign", side, index: 0 },
          controller: side, expiry: { at: "never" }, change: { kind: "cardCost", instance: first, mode: "reduce", amount: 1 } })] : []);
        const gains = events.filter(e => e.kind === "sparkGained");
        expect(gains).toEqual(yes ? [expect.objectContaining({ instance: first, amount: 2, expiry: { at: "never" } })] : []);
        expect(engine.view(done.state, other).instances[first]).toBeUndefined();
        if (!yes) return;
        expect(eventSeenBy(costs[0], other, done.state)).toBeNull();
        expect(eventSeenBy(gains[0], other, done.state)).toBeNull();
        expect(characteristicsOf(done.state, engine.catalog, first).spark).toBe(5);
        const reloaded = deserializeState(serializeState(done.state));
        const play = { kind: "play" as const, card: first, from: "hand" as const };
        const played = engine.apply(done.state, side, play, NO_PROMPTS);
        const resumed = engine.apply(reloaded, side, play, NO_PROMPTS);
        expect(stateHash(resumed.state)).toBe(stateHash(played.state));
        expect(resumed.events).toEqual(played.events);
        expect(played.state.sides[side].currentEnergy).toBe(done.state.sides[side].currentEnergy - 2);
        expect(characteristicsOf(played.state, engine.catalog, first).spark).toBe(5);
        const away = passUntil(engine, played.state, at(engine, other, "day"));
        expect(away.state.instances[first].status.gainedSpark).toBe(2);
        expect(adjustedEnergy(3, costModifier(away.state, engine.catalog, first, side))).toBe(2);
        expect(away.state.instances[later].status.gainedSpark).toBe(0);
      },
    });
  }
  scenarios.push({
    name: `${key.id} ${side} gives the original first character entry its permanent gain before observers`,
    spec: empty,
    check: () => {
      const b = boardState(engine.catalog, { active: side, phase: "day",
        [side]: { dreamsigns: [keyId], hand: [v.vanilla3.id, v.vanilla3.id], deck, energy: 8 },
        [other]: { deck } });
      const [first, later] = b.ids[side].hand;
      const played = engine.apply(b.state, side, { kind: "play", card: first, from: "hand" }, NO_PROMPTS);
      const second = engine.apply(played.state, side, { kind: "play", card: later, from: "hand" }, NO_PROMPTS);
      expect([first, later].map(id => second.state.instances[id].status.gainedSpark)).toEqual([1, 0]);
      expect([first, later].map(id => characteristicsOf(second.state, engine.catalog, id).spark)).toEqual([4, 3]);
      const gain = played.events.findIndex(e => e.kind === "sparkGained" && e.instance === first);
      const entry = played.events.findIndex(e => e.kind === "materialized" && e.instance === first);
      expect(gain).toBeGreaterThanOrEqual(0);
      expect(gain).toBeLessThan(entry);
      expect(played.events[gain]).toMatchObject({ entrySpark: { source: { kind: "dreamsign", side, index: 0 }, ability: 0, controller: side } });
      expect(second.events.filter(e => e.kind === "sparkGained")).toEqual([]);
    },
  });
}

export default { slug: "dreamsigns-battle-18", scenarios } satisfies ScenarioModule;
