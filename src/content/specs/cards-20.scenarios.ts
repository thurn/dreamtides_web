/** D20: a once-per-turn discard trigger draws a payer but does not trigger for the next paid discard. */
import { expect } from "vitest";
import { opponent } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import augury from "../cards/thought-augury-b4838d67";

const AUGURY = parseCardId(augury.id);
const deck = Array.from({ length: 4 }, () => v.vanilla1.id);
const scenarios: NamedScenario[] = [];

for (const side of ["player", "enemy"] as const) {
  const other = opponent(side);
  for (const amplified of [false, true]) {
    const gain = amplified ? 2 : 1;
    scenarios.push({
      name: `${augury.id} ${side} ${amplified ? "amplified" : "base"} draws once across two paid discards`,
      spec: {
        board: {
          active: side, phase: "day",
          [side]: { back: [v.discardOne.id], hand: [{ cardId: AUGURY, amplified }, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck, energy: 3 },
          [other]: { deck },
        },
        steps: (ids) => [
          { side, action: { kind: "play", card: ids[side].hand[0], from: "hand" } },
          { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
          { side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } },
        ],
        answers: (ids) => [[ids[side].hand[1]], [ids[side].deck[0]]],
      },
      check: ({ start, state, events, ids }) => {
        const source = ids[side].hand[0];
        const first = ids[side].hand[1], drawn = ids[side].deck[0];
        expect(events.filter(event => event.kind === "discarded")).toEqual([
          { kind: "discarded", side, instance: first },
          { kind: "discarded", side, instance: drawn },
        ]);
        expect(events.filter(event => event.kind === "triggerQueued" && event.source === source)).toEqual([
          expect.objectContaining({ controller: side, ability: 0, subject: first }),
        ]);
        expect(events.filter(event => event.kind === "triggerResolved" && event.source === source)).toEqual([
          expect.objectContaining({ controller: side, ability: 0, applied: true }),
        ]);
        expect(events.filter(event => event.kind === "cardDrawn")).toEqual([{ kind: "cardDrawn", side, instance: drawn }]);
        const draw = events.findIndex(event => event.kind === "cardDrawn");
        const energy = events.findIndex(event => event.kind === "energyChanged" && event.cause === "effect");
        expect(energy).toBeGreaterThan(draw);
        expect(events.filter(event => event.kind === "energyChanged" && event.cause === "effect")).toEqual([
          { kind: "energyChanged", side, current: gain, max: 3, change: gain, maxChange: 0, cause: "effect" },
        ]);
        expect(state.instances[source]).toMatchObject({ zone: "play", variant: { amplified } });
        expect(state.sides[side].hand).toEqual(ids[side].hand.slice(2));
        expect(state.sides[side].deck).toEqual(ids[side].deck.slice(1));
        expect(state.sides[side]).toMatchObject({ currentEnergy: gain, maxEnergy: 3 });
        expect(state.sides[other]).toEqual(start.sides[other]);
        expect(state.stack).toEqual([]);
      },
    });
  }
}

export default { slug: "cards-20", scenarios } satisfies ScenarioModule;
