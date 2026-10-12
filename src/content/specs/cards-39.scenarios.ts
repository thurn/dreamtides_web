/**
 * D20: Revenant Automaton's void activation (rules § Ability Types → Where
 * activated abilities work) puts it back into play, where its own
 * Materialized trigger fires again.
 */
import { expect } from "vitest";
import type { ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import automaton from "../cards/revenant-automaton-ecf77f27";

const DECK = Array.from({ length: 4 }, () => SYNTHETIC.vanilla1.id);

export default {
  slug: "cards-39",
  scenarios: [{
    name: `${automaton.id} abandons a character to materialize itself from the void and gains 1⍟ from its own trigger`,
    spec: {
      board: {
        active: "player", phase: "day",
        player: { back: [SYNTHETIC.vanilla2.id], void: [parseCardId(automaton.id)], deck: DECK },
        enemy: { deck: DECK },
      },
      steps: (ids) => [{ side: "player", action: { kind: "activate", source: ids.player.void[0], ability: 1 } }],
    },
    check: ({ start, state, events, ids }) => {
      const revenant = ids.player.void[0];
      const payer = ids.player.back[0]!;
      expect(events).toContainEqual({ kind: "abandoned", instance: payer, side: "player" });
      expect(state.instances[revenant]).toMatchObject({ zone: "play", controller: "player" });
      expect(state.sides.player.backRank).toContain(revenant);
      expect(state.sides.player.void).toEqual([payer]);
      expect(state.sides.player.score).toBe(start.sides.player.score + 1);
    },
  }],
} satisfies ScenarioModule;
