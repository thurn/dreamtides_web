/** D20: Dawn growth feeds a departure gift; physical challengers exclude only their own source. */
import { expect } from "vitest";
import type { Side } from "../../engine/state/ids";
import { opponent } from "../../engine/state/ids";
import { playFromHand, type NamedScenario, type ScenarioModule, type ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC as v } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import barrage from "../cards/barrage-specialist-55340736";
import wired from "../cards/wired-duelist-cb2d9f1e";

const BARRAGE = parseCardId(barrage.id), WIRED = parseCardId(wired.id);
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
const pass = (side: Side): ScenarioStep => ({ side, action: { kind: "pass" } });
const nextOwnDay = (side: Side): ScenarioStep[] => [side, opponent(side), side, opponent(side), side, opponent(side)].map(pass);

function dawnGift(side: Side, amplified: boolean): NamedScenario {
  const other = opponent(side), gain = amplified ? 2 : 1;
  return {
    name: `${wired.id} ${side} ${amplified ? "amplified" : "base"} Dawn growth transfers the departed source's effective spark`,
    spec: {
      board: { active: side, phase: "day", scoreToWin: 100,
        [side]: { hand: [{ cardId: WIRED, amplified }, v.dissolveVictim.id], back: [v.vanilla2.id, v.vanilla0.id], energy: 10, deck },
        [other]: { back: [v.vanilla3.id], deck } },
      steps: ids => [playFromHand(ids, side), ...nextOwnDay(side), playFromHand(ids, side, 1)],
      answers: ids => [[ids[side].hand[0]], [ids[side].back[0]!]],
    },
    check: ({ state, events, ids }) => {
      const source = ids[side].hand[0], recipient = ids[side].back[0]!, enemy = ids[other].back[0]!;
      const departureSpark = (wired.spark ?? 0) + gain;
      const growth = events.findIndex(e => e.kind === "sparkGained" && e.instance === source);
      const departure = events.findIndex(e => e.kind === "leftPlay" && e.instance === source);
      const gift = events.findIndex(e => e.kind === "sparkGained" && e.instance === recipient);
      expect(growth).toBeGreaterThanOrEqual(0);
      expect(departure).toBeGreaterThan(growth);
      expect(gift).toBeGreaterThan(departure);
      expect(events.filter(e => e.kind === "sparkGained" && e.instance === source)).toEqual([
        { kind: "sparkGained", instance: source, amount: gain, expiry: { at: "never" }, additional: false },
      ]);
      expect(events).toContainEqual({ kind: "leftPlay", instance: source, side, to: "void", spark: departureSpark });
      expect(events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source, controller: side, ability: 1, lastKnownSourceSpark: departureSpark }));
      expect(events.filter(e => e.kind === "sparkGained" && e.instance === recipient)).toEqual([
        { kind: "sparkGained", instance: recipient, amount: departureSpark, expiry: { at: "never" }, additional: false },
      ]);
      expect(state.instances[source]).toMatchObject({ zone: "void", variant: { amplified }, status: { gainedSpark: gain } });
      expect(state.instances[recipient]).toMatchObject({ zone: "play", controller: side, status: { gainedSpark: departureSpark } });
      expect(state.instances[enemy]?.status.gainedSpark).toBe(0);
      expect(state.stack).toEqual([]);
      expect(state.triggerQueue).toEqual([]);
    },
  };
}

function physicalCohort(side: Side, amplified: boolean): NamedScenario {
  const other = opponent(side), gain = amplified ? 2 : 1;
  return {
    name: `${barrage.id} ${side} ${amplified ? "amplified" : "base"} two same-printing challengers each exclude their own physical source`,
    spec: {
      board: { active: side, phase: "day", scoreToWin: 100,
        [side]: { hand: [{ cardId: BARRAGE, amplified }, { cardId: BARRAGE, amplified }], front: [null, null, v.vanilla2.id], back: [v.vanilla0.id], energy: 10, deck },
        [other]: { front: [v.vanilla8.id, v.vanilla8.id], back: [v.vanilla1.id], deck } },
      steps: ids => [playFromHand(ids, side), playFromHand(ids, side, 1), ...nextOwnDay(side),
        { side, action: { kind: "reposition", card: ids[side].hand[0], to: { rank: "front", index: 0 } } },
        { side, action: { kind: "reposition", card: ids[side].hand[1], to: { rank: "front", index: 1 } } },
        pass(side), pass(other), pass(side)],
    },
    check: ({ state, events, ids }) => {
      const [first, second] = ids[side].hand, cohort = ids[side].front[2]!;
      expect(first).not.toBe(second);
      expect(events.filter(e => e.kind === "triggerResolved" && (e.source === first || e.source === second))).toHaveLength(2);
      const gains = events.filter(e => e.kind === "sparkGained");
      for (const source of [first, second]) {
        expect(gains.filter(e => e.kind === "sparkGained" && e.instance === source)).toEqual([
          { kind: "sparkGained", instance: source, amount: gain, expiry: { at: "never" }, additional: false },
        ]);
        expect(state.instances[source]).toMatchObject({ zone: "void", variant: { amplified }, status: { gainedSpark: gain } });
      }
      expect(gains.filter(e => e.kind === "sparkGained" && e.instance === cohort)).toHaveLength(2);
      expect(state.instances[cohort]?.status.gainedSpark).toBe(2 * gain);
      for (const id of [ids[side].back[0]!, ...ids[other].front, ids[other].back[0]!]) {
        expect(gains.some(e => e.kind === "sparkGained" && e.instance === id)).toBe(false);
        expect(state.instances[id!]?.status.gainedSpark).toBe(0);
      }
      expect(gains).toHaveLength(4);
      expect(state.stack).toEqual([]);
      expect(state.triggerQueue).toEqual([]);
    },
  };
}

export default { slug: "cards-67", scenarios: (["player", "enemy"] as const).flatMap(side => [false, true].flatMap(amplified => [dawnGift(side, amplified), physicalCohort(side, amplified)])) } satisfies ScenarioModule;
