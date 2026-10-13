/** D20: a printed variant reaches its own Dawn, readies normally, and pays itself after exhaustion. */
import { expect } from "vitest";
import { opponent } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import pharaoh from "../cards/iron-pharaoh-0458658d";

const PHARAOH = parseCardId(pharaoh.id);
const deck = Array.from({ length: 4 }, () => SYNTHETIC.vanilla1.id);
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  for (const amplified of [false, true]) {
    const gain = amplified ? 2 : 1;
    scenarios.push({
      name: `${pharaoh.id} ${side} ${amplified ? "amplified" : "base"} reaches Dawn then exhausts and abandons itself for current energy`,
      spec: {
        board: {
          active: side, phase: "day",
          [side]: { back: [SYNTHETIC.vanilla1.id], hand: [{ cardId: PHARAOH, amplified }], deck, energy: 3 },
          [other]: { deck },
        },
        steps: (ids) => [
          { side, action: { kind: "play", card: ids[side].hand[0], from: "hand" } },
          { side, action: { kind: "pass" } },
          { side: other, action: { kind: "pass" } },
          { side, action: { kind: "pass" } },
          { side: other, action: { kind: "pass" } },
          { side, action: { kind: "pass" } },
          { side: other, action: { kind: "pass" } },
          { side, action: { kind: "activate", source: ids[side].hand[0], ability: 1 } },
        ],
        answers: (ids) => [[ids[side].hand[0]]],
      },
      check: ({ start, state, events, ids }) => {
        const source = ids[side].hand[0];
        const dawn = events.findIndex(event => event.kind === "phaseChanged" && event.phase === "dawn" && event.active === side);
        const day = events.findIndex((event, index) => index > dawn && event.kind === "phaseChanged" && event.phase === "day" && event.active === side);
        const exhausted = events.findIndex((event, index) => index > day && event.kind === "exhaustionChanged" && event.instance === source && event.exhausted);
        const abandoned = events.findIndex(event => event.kind === "abandoned" && event.instance === source);
        expect(dawn).toBeGreaterThanOrEqual(0);
        expect(day).toBeGreaterThan(dawn);
        expect(exhausted).toBeGreaterThan(day);
        expect(abandoned).toBeGreaterThan(exhausted);
        expect(events.findIndex(event => event.kind === "dissolved" && event.instance === source)).toBeGreaterThan(abandoned);
        expect(events.filter(event => event.kind === "triggerQueued" && event.source === source)).toEqual([
          expect.objectContaining({ controller: side, ability: 0 }),
        ]);
        expect(events.filter(event => event.kind === "energyChanged" && event.cause === "effect")).toEqual([
          { kind: "energyChanged", side, current: 3 + gain, max: 3, change: gain, maxChange: 0, cause: "effect" },
          { kind: "energyChanged", side, current: 3 + 2 * gain, max: 3, change: gain, maxChange: 0, cause: "effect" },
        ]);
        expect(events).toContainEqual({ kind: "abilityResolved", source, side, ability: 1 });
        expect(state.instances[source]).toMatchObject({ zone: "void", variant: { amplified } });
        expect(state.instances[ids[side].back[0]!].zone).toBe("play");
        expect(state.sides[side]).toMatchObject({ currentEnergy: 3 + 2 * gain, maxEnergy: 3, score: 0 });
        expect(state.sides[other].currentEnergy).toBe(start.sides[other].currentEnergy);
        expect(state.sides[other].maxEnergy).toBe(start.sides[other].maxEnergy);
        expect(state.stack).toEqual([]);
      },
    });
  }
}

export default { slug: "cards-17", scenarios } satisfies ScenarioModule;
