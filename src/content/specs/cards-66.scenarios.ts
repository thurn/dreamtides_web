/** D20: growth feeds departure rewards; a departed source's own abandonment gain cannot reach it. */
import { expect } from "vitest";
import { parseFigmentId, type Side } from "../../engine/state/ids";
import { playFromHand, type NamedScenario, type ScenarioModule, type ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC as v } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import cinder from "../cards/cinderheart-8624f9c7";
import herald from "../cards/inferno-s-herald-01a8482b";
import warrior from "../figments/warrior-bb1a5acd";
import { SYNTHETIC_ABANDONER } from "./abandonment-fixture";

const CINDER = parseCardId(cinder.id), HERALD = parseCardId(herald.id);
const WARRIOR = parseFigmentId(warrior.id);
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
const pass = (side: Side): ScenarioStep => ({ side, action: { kind: "pass" } });

function dawn(side: Side, amplified: boolean): NamedScenario {
  const other = side === "player" ? "enemy" : "player";
  const gain = amplified ? 2 : 1;
  return {
    name: `${herald.id} ${side} ${amplified ? "amplified" : "base"} Dawn growth becomes Dissolved Warrior output`,
    spec: {
      board: { active: side, phase: "day", [side]: { hand: [{ cardId: HERALD, amplified }, v.dissolveVictim.id], energy: (herald.energyCost ?? 0) + 10, deck }, [other]: { back: [v.vanilla5.id], deck } },
      steps: ids => [playFromHand(ids, side), pass(side), pass(other), pass(side), pass(other), pass(side), pass(other), playFromHand(ids, side, 1)],
      answers: ids => [[ids[side].hand[0]]],
    },
    check: ({ state, events, ids }) => {
      const source = ids[side].hand[0];
      const growth = events.findIndex(e => e.kind === "sparkGained" && e.instance === source && e.amount === gain);
      const departure = events.findIndex(e => e.kind === "leftPlay" && e.instance === source);
      expect(growth).toBeGreaterThanOrEqual(0);
      expect(departure).toBeGreaterThan(growth);
      const left = events.find(e => e.kind === "leftPlay" && e.instance === source);
      if (left?.kind !== "leftPlay" || left.spark === undefined) throw new Error("missing captured departure spark");
      expect(left).toMatchObject({ side, to: "void", spark: (herald.spark ?? 0) + gain });
      expect(state.instances[source]).toMatchObject({ zone: "void", status: { gainedSpark: gain } });
      const figments = Object.values(state.instances).filter(i => i.printing.kind === "figment" && i.printing.figment === WARRIOR);
      expect(figments.reduce((total, i) => total + (i.printing.kind === "figment" ? i.printing.spark ?? 0 : 0), 0)).toBe(left.spark);
      for (const figment of figments) {
        expect(figment).toMatchObject({ controller: side, zone: "play" });
        expect(events.findIndex(e => e.kind === "materialized" && e.instance === figment.id)).toBeGreaterThan(departure);
      }
      expect(state.stack).toEqual([]);
    },
  };
}

function abandonment(side: Side, amplified: boolean): NamedScenario {
  const other = side === "player" ? "enemy" : "player";
  const gain = amplified ? 2 : 1;
  return {
    name: `${cinder.id} ${side} ${amplified ? "amplified" : "base"} abandonment growth survives as departure points`,
    spec: {
      board: { active: side, phase: "day", [side]: { hand: [{ cardId: CINDER, amplified }], back: [SYNTHETIC_ABANDONER.id, v.vanilla1.id], energy: (cinder.energyCost ?? 0) + 10, deck }, [other]: { deck } },
      steps: ids => [playFromHand(ids, side), { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } }, { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } }],
      answers: ids => [[ids[side].back[1]!], [ids[side].hand[0]]],
    },
    check: ({ state, events, ids }) => {
      const source = ids[side].hand[0], fodder = ids[side].back[1]!;
      expect(events).toContainEqual({ kind: "abandoned", instance: fodder, side });
      expect(events).toContainEqual({ kind: "abandoned", instance: source, side });
      expect(events.flatMap(e => e.kind === "sparkGained" && e.instance === source ? [e.amount] : [])).toEqual([gain]);
      const growth = events.findIndex(e => e.kind === "sparkGained" && e.instance === source);
      const otherAbandoned = events.findIndex(e => e.kind === "abandoned" && e.instance === fodder);
      const ownAbandoned = events.findIndex(e => e.kind === "abandoned" && e.instance === source);
      expect(growth).toBeGreaterThan(otherAbandoned);
      expect(ownAbandoned).toBeGreaterThan(growth);
      const left = events.find(e => e.kind === "leftPlay" && e.instance === source);
      if (left?.kind !== "leftPlay" || left.spark === undefined) throw new Error("missing captured departure spark");
      expect(left).toMatchObject({ side, to: "void", spark: (cinder.spark ?? 0) + gain });
      const resolved = events.filter(e => e.kind === "triggerResolved" && e.source === source);
      expect(resolved).toHaveLength(3);
      expect(events.filter(e => e.kind === "triggerQueued" && e.source === source && e.subject === source)).toHaveLength(2);
      expect(state.instances[source]).toMatchObject({ zone: "void", status: { gainedSpark: gain } });
      expect(state.sides[side].score).toBe(left.spark);
      expect(state.sides[other].score).toBe(0);
      expect(state.stack).toEqual([]);
    },
  };
}

export default { slug: "cards-66", scenarios: (["player", "enemy"] as const).flatMap(side => [false, true].flatMap(amplified => [dawn(side, amplified), abandonment(side, amplified)])) } satisfies ScenarioModule;
