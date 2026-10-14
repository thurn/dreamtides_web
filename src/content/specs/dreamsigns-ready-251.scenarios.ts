/** D20: actual draw ordinals bind a permanent discount to one physical card and renew each turn. */
import { expect } from "vitest";
import type { EngineCardDefinition } from "../../engine/catalog";
import { adjustedEnergy, costModifier } from "../../engine/continuous/costs";
import { energy, event } from "../../engine/dsl/builders";
import { createEngine } from "../../engine/engine";
import { eventSeenBy } from "../../engine/events";
import { draw } from "../../engine/effects/primitives/draw";
import { opponent, type InstanceId } from "../../engine/state/ids";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { playFromHand, runScenario, type NamedScenario, type ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { parseDreamsignId } from "../../types/identifiers";
import amulet from "../dreamsigns/green-amulet-a42c99b2";

const id = parseDreamsignId(amulet.id);
const drawer: EngineCardDefinition = { ...v.event0, id: syntheticId(0x668001), status: "authored", abilities: () => [event(draw(3))] };
const event3: EngineCardDefinition = { ...v.event1, id: syntheticId(0x668002), costs: [energy(3)] };
const engine = createEngine(testCatalog([drawer, event3], { dreamsigns: [{ id, status: "authored", abilities: amulet.abilities! }] }));
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) for (const second of [v.vanilla3, event3]) {
  const other = opponent(side), first = second.cardType === "character" ? event3 : v.vanilla3;
  const source = { kind: "dreamsign", side, index: 0 } as const;
  scenarios.push({
    name: `${amulet.id} ${side} discounts only its second actual draw (${second.cardType}), retaining it across turns`,
    spec: { board: { active: side, phase: "day" }, steps: () => [] },
    check: () => {
      const result = runScenario(engine, {
        board: { active: side, phase: "day",
          [side]: { dreamsigns: [id], hand: [drawer.id, drawer.id], energy: 5,
            deck: [first.id, second.id, second.id, ...Array.from({ length: 10 }, () => v.vanilla3.id)] },
          [other]: { deck: Array.from({ length: 10 }, () => v.vanilla3.id) } },
        steps: (ids) => [playFromHand(ids, side)],
      });
      const { state, events, ids } = result;
      const [drawnFirst, discounted, duplicate] = ids[side].deck;
      const price = (s: typeof state, card: InstanceId) => adjustedEnergy(3, costModifier(s, engine.catalog, card, side));
      expect(events.filter(e => e.kind === "cardDrawn").map(e => e.instance)).toEqual([drawnFirst, discounted, duplicate]);
      expect([drawnFirst, discounted, duplicate].map(card => price(state, card))).toEqual([3, 1, 3]);
      const queued = events.find(e => e.kind === "triggerQueued");
      expect(queued).toMatchObject({ source, subject: discounted, controller: side, subjectHiddenFrom: [other] });
      expect(eventSeenBy(queued!, other, state)).toMatchObject({ source, subject: null });
      const effect = events.find(e => e.kind === "effectStarted");
      expect(effect).toMatchObject({ source, controller: side, expiry: { at: "never" },
        change: { kind: "cardCost", instance: discounted, mode: "reduce", amount: 2 } });
      expect(eventSeenBy(effect!, other, state)).toBeNull();
      expect(engine.view(state, other).instances[discounted]).toBeUndefined();
      expect(state.turnLog.drawn[side]).toBe(3);
      expect(events.filter(e => e.kind === "triggerResolved")).toHaveLength(1);
      const away = passUntil(engine, state, at(engine, other, "day"));
      const next = passUntil(engine, away.state, at(engine, side, "day"));
      expect(next.state.turnLog.drawn[side]).toBe(1);
      expect(price(next.state, discounted)).toBe(1);
      expect(next.state.floating).toEqual(state.floating);
      const before = next.state.sides[side].currentEnergy;
      const paid = engine.apply(next.state, side, { kind: "play", card: discounted, from: "hand" }, NO_PROMPTS);
      expect(paid.state.sides[side].currentEnergy).toBe(before - 1);
      expect(paid.state.instances[discounted].zone).toBe(second.cardType === "character" ? "play" : "void");
      expect(price(paid.state, discounted)).toBe(1);
      const newSecond = paid.state.sides[side].deck[0];
      const renewed = engine.apply(paid.state, side, { kind: "play", card: ids[side].hand[1], from: "hand" }, NO_PROMPTS);
      expect(renewed.events.filter(e => e.kind === "triggerQueued")).toEqual([
        expect.objectContaining({ source, controller: side, subject: newSecond }),
      ]);
      expect(price(renewed.state, newSecond)).toBe(1);
      expect(price(renewed.state, duplicate)).toBe(3);
      expect(renewed.state.stack).toEqual([]);
    },
  });
}

export default { slug: "dreamsigns-ready-251", scenarios } satisfies ScenarioModule;
