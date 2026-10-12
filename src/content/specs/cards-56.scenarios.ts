/**
 * D20: Emberfang's activated gain triggers its own additional-spark ability
 * (C17), and Crescent Dancer's materialize trigger sees its own
 * materialization and awakens every other character, the newly materialized
 * one included (RD-hv-umm2.168-1).
 */
import { expect } from "vitest";
import type { ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import crescentDancer from "../cards/crescent-dancer-20a6474c";
import emberfang from "../cards/emberfang-26a05558";
import empyrealLight from "../cards/empyreal-light-a36898f6";

export default {
  slug: "cards-56",
  scenarios: [
    {
      name: `${emberfang.id} its activated +1✦ gains one additional ✦ from its own trigger`,
      spec: {
        board: {
          active: "player", phase: "day",
          player: { back: [parseCardId(emberfang.id), SYNTHETIC.vanilla1.id], deck: [SYNTHETIC.vanilla2.id], energy: 2 },
        },
        steps: (ids) => [{ side: "player", action: { kind: "activate", source: ids.player.back[0]!, ability: 1 } }],
        answers: (ids) => [[ids.player.back[1]!]],
      },
      check: ({ state, ids }) => {
        const source = ids.player.back[0]!;
        const pumped = ids.player.back[1]!;
        expect(state.sides.player.currentEnergy).toBe(0);
        expect(state.instances[source]?.status.exhausted).toBe(true);
        expect(state.instances[pumped]?.status.gainedSpark).toBe(2);
        expect(state.instances[source]?.status.gainedSpark ?? 0).toBe(0);
      },
    },
    {
      name: `${crescentDancer.id} awakens each other character as it and later characters materialize`,
      spec: {
        board: {
          active: "player", phase: "day",
          player: {
            back: [parseCardId(empyrealLight.id), SYNTHETIC.vanilla2.id],
            hand: [parseCardId(crescentDancer.id), SYNTHETIC.vanilla1.id],
            deck: [SYNTHETIC.vanilla3.id],
            energy: 5,
          },
        },
        steps: (ids) => [
          { side: "player", action: { kind: "activate", source: ids.player.back[0]!, ability: 0 } },
          { side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } },
          { side: "player", action: { kind: "play", card: ids.player.hand[1], from: "hand" } },
        ],
        answers: (ids) => [[ids.player.back[1]!]],
      },
      check: ({ state, ids, events }) => {
        const [light, dancer, later] = [ids.player.back[0]!, ids.player.hand[0], ids.player.hand[1]];
        const reawakened = events.findIndex((event) => event.kind === "exhaustionChanged" && event.instance === light && !event.exhausted);
        const dancerEntered = events.findIndex((event) => event.kind === "materialized" && event.instance === dancer);
        expect(dancerEntered).toBeGreaterThanOrEqual(0);
        expect(reawakened).toBeGreaterThan(dancerEntered);
        expect(state.instances[dancer]).toMatchObject({ zone: "play", status: { exhausted: true } });
        expect(state.instances[later]).toMatchObject({ zone: "play", status: { exhausted: false } });
        expect(state.instances[light]?.status.exhausted).toBe(false);
        expect(state.sides.player.currentEnergy).toBe(0);
      },
    },
  ],
} satisfies ScenarioModule;
