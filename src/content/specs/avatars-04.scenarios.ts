/** D20: an Avatar's delayed copy consumes only its next matching play and expires at Ending. */
import { expect } from "vitest";
import type { Side } from "../../engine/state/ids";
import { playFromHand, type NamedScenario, type ScenarioModule, type ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseAvatarId } from "../../types/identifiers";
import kasane from "../avatars/kasane-2b7e921d";

const KASANE = parseAvatarId(kasane.id);
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla0.id);
const pass = (side: Side): ScenarioStep => ({ side, action: { kind: "pass" } });
const activate = (side: Side): ScenarioStep => ({ side, action: { kind: "activate", source: { kind: "avatar", side }, ability: 0 } });
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  const other = side === "player" ? "enemy" : "player";
  scenarios.push({
    name: `${kasane.id} ${side} copies only its next event after a character and the opponent's Interrupt`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: { avatar: KASANE, hand: [SYNTHETIC.vanilla0.id, SYNTHETIC.event0.id, SYNTHETIC.event0.id], energy: 4, deck },
        [other]: { hand: [SYNTHETIC.interruptEvent.id], energy: 1, deck },
      },
      steps: (ids) => [
        activate(side), pass(other),
        playFromHand(ids, side), playFromHand(ids, other),
        playFromHand(ids, side, 1), playFromHand(ids, side, 2),
      ],
    },
    check: ({ state, events, ids }) => {
      const original = ids[side].hand[1];
      const copies = events.filter((event) => event.kind === "cardCopied");
      expect(copies).toHaveLength(1);
      const copied = copies[0];
      expect(copied).toMatchObject({ side, original });
      const copyResolution = events.findIndex((event) => event.kind === "resolved" && event.instance === copied.copy);
      const originalResolution = events.findIndex((event) => event.kind === "resolved" && event.instance === original);
      expect(copyResolution).toBeGreaterThanOrEqual(0);
      expect(originalResolution).toBeGreaterThan(copyResolution);
      expect(events).toContainEqual({ kind: "ceasedToExist", instance: copied.copy, side, from: "stack" });
      expect(events.some((event) => event.kind === "cardPlayed" && event.instance === copied.copy)).toBe(false);
      expect(state.turnLog.played[side].map((played) => played.instance)).toEqual(ids[side].hand);
      expect(state.turnLog.played[other].map((played) => played.instance)).toEqual(ids[other].hand);
      expect(state.instances[copied.copy]).toBeUndefined();
      for (const id of ids[side].hand.slice(1)) expect(state.instances[id]?.zone).toBe("void");
      expect(state.instances[ids[other].hand[0]]?.zone).toBe("void");
      expect(state.sides[side].currentEnergy).toBe(0);
      expect(state.sides[side].avatar).toEqual({ id: KASANE, exhausted: true });
      const started = events.find((event) => event.kind === "effectStarted");
      if (started?.kind !== "effectStarted") throw new Error("Delayed copy did not start");
      expect(started).toMatchObject({ controller: side, source: { kind: "avatar", side }, expiry: { at: "endOfTurn" } });
      const consumed = events.findIndex((event) => event.kind === "effectEnded" && event.effect === started.effect);
      expect(consumed).toBeGreaterThanOrEqual(0);
      expect(consumed).toBeLessThan(events.indexOf(copied));
      expect(state.floating).toEqual([]);
      expect(state.stack).toEqual([]);
    },
  });
  scenarios.push({
    name: `${kasane.id} ${side} expires an unused copy before the next turn's event`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: { avatar: KASANE, hand: [SYNTHETIC.event0.id], energy: 4, deck },
        [other]: { deck },
      },
      steps: (ids) => [
        activate(side),
        pass(side), pass(other), pass(side), pass(other), pass(side), pass(other),
        playFromHand(ids, side),
      ],
    },
    check: ({ state, events, ids }) => {
      const started = events.find((event) => event.kind === "effectStarted");
      if (started?.kind !== "effectStarted") throw new Error("Delayed copy did not start");
      const ending = events.findIndex((event) => event.kind === "effectEnded" && event.effect === started.effect);
      const played = events.findIndex((event) => event.kind === "cardPlayed" && event.instance === ids[side].hand[0]);
      expect(ending).toBeGreaterThanOrEqual(0);
      expect(played).toBeGreaterThan(ending);
      expect(events.some((event) => event.kind === "cardCopied")).toBe(false);
      expect(state.instances[ids[side].hand[0]]?.zone).toBe("void");
      expect(state.sides[side].avatar).toEqual({ id: KASANE, exhausted: false });
      expect(state.floating).toEqual([]);
      expect(state.stack).toEqual([]);
    },
  });
}

export default { slug: "avatars-04", scenarios } satisfies ScenarioModule;
