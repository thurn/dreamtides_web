/**
 * Scenario specs for prim-when-return-trigger (D20): interactions between a
 * card's own abilities. Ferryman of the Falls's ▸Materialized return triggers
 * its own "When you return another character to your hand" and Breach
 * Artist's, which stack; Breach Artist's Phasing returns Ferryman, which does
 * not see its own return (RD-hv-umm2.102-1, RD-hv-umm2.102-2).
 */
import { expect } from "vitest";
import type { ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import type { BattleState } from "../../engine/state/types";
import type { InstanceId } from "../../engine/state/ids";
import { parseCardId } from "../../types/card-identity";
import breachArtist from "../cards/breach-artist-87aba308";
import ferrymanOfTheFalls from "../cards/ferryman-of-the-falls-ad76c77a";

const BREACH = parseCardId(breachArtist.id);
const FERRYMAN = parseCardId(ferrymanOfTheFalls.id);
const DECK = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);

/** The reductions floating on `id`, in creation order. */
function reductions(state: BattleState, id: InstanceId | null | undefined): number[] {
  return state.floating.flatMap(({ change }) => (change.kind === "cardCost" && change.instance === id && change.mode === "reduce" ? [change.amount] : []));
}

export default {
  slug: "prim-when-return-trigger",
  scenarios: [
    {
      name: `${ferrymanOfTheFalls.id} returns another character, whose cost both it and Breach Artist reduce`,
      spec: {
        board: {
          active: "player",
          phase: "day",
          player: { hand: [FERRYMAN], back: [BREACH, SYNTHETIC.vanilla3.id], energy: 1, deck: DECK },
          enemy: { deck: DECK },
        },
        steps: (ids) => [{ side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }],
        answers: (ids) => [[ids.player.back[1]!]],
      },
      check: ({ events, state, ids }) => {
        const [ferryman] = ids.player.hand;
        const [breach, returned] = ids.player.back;
        const queued = events.flatMap((entry) => (entry.kind === "triggerQueued" && entry.subject === returned ? [entry.source] : []));
        expect(queued).toEqual([breach, ferryman]);
        expect(state.instances[returned!]?.zone).toBe("hand");
        expect(reductions(state, returned)).toEqual([2, 1]);
      },
    },
    {
      name: `${breachArtist.id} phases out Ferryman of the Falls and reduces its cost; Ferryman ignores its own return`,
      spec: {
        board: {
          active: "player",
          phase: "day",
          player: { hand: [BREACH], back: [FERRYMAN], energy: 2, deck: DECK },
          enemy: { deck: DECK },
        },
        // Ferryman is Phasing's only choice, so its target prompt answers itself.
        steps: (ids) => [{ side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }],
      },
      check: ({ events, state, ids }) => {
        const [breach] = ids.player.hand;
        const [ferryman] = ids.player.back;
        const queued = events.flatMap((entry) => (entry.kind === "triggerQueued" && entry.subject === ferryman ? [entry.source] : []));
        expect(queued).toEqual([breach]);
        expect(state.instances[ferryman!]?.zone).toBe("hand");
        expect(reductions(state, ferryman)).toEqual([2]);
        // Phasing moves Breach Artist to Ferryman's position.
        expect(state.sides.player.backRank[0]).toBe(breach);
      },
    },
  ],
} satisfies ScenarioModule;
