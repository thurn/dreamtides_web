/**
 * Scenario specs for prim-materialize-nth-trigger (D20): nth-in-turn
 * counters and interactions between a card's own abilities. Paleclaw
 * Panther, materialized as your second spirit animal of the turn, triggers
 * both of its abilities on itself; in play it counts each later spirit
 * animal. Dawnprowler is the first spirit animal it sees, so it gains only
 * from the later ones (RD-hv-umm2.107-1, RD-hv-umm2.107-2).
 */
import { expect } from "vitest";
import type { EngineEvent } from "../../engine/events";
import type { AbilitySource, InstanceId } from "../../engine/state/ids";
import type { ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import dawnprowler from "../cards/dawnprowler-f38ab9b6";
import markedDirewolf from "../cards/marked-direwolf-e83014d3";
import paleclawPanther from "../cards/paleclaw-panther-cd2d4eaf";

const PALECLAW = parseCardId(paleclawPanther.id);
const DAWNPROWLER = parseCardId(dawnprowler.id);
/** A vanilla 4● spirit animal. */
const DIREWOLF = parseCardId(markedDirewolf.id);
const FILLER = SYNTHETIC.vanilla1.id;
const DECK = Array.from({ length: 8 }, () => FILLER);

const play = (card: InstanceId | undefined) => ({ side: "player" as const, action: { kind: "play" as const, card: card!, from: "hand" as const } });

/** The subject of each trigger of `source`'s ability `ability`, in order. */
function fired(events: readonly EngineEvent[], source: AbilitySource | null | undefined, ability: number): (InstanceId | null)[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" && entry.source === source && entry.ability === ability ? [entry.subject] : []));
}

export default {
  slug: "prim-materialize-nth-trigger",
  scenarios: [
    {
      name: `${paleclawPanther.id} materialized as your second spirit animal this turn triggers both its abilities on itself`,
      spec: {
        board: {
          active: "player",
          phase: "day",
          player: { hand: [DIREWOLF, PALECLAW], back: [DIREWOLF], energy: 8, deck: [FILLER, DIREWOLF, ...DECK] },
          enemy: { deck: DECK },
        },
        steps: (ids) => [play(ids.player.hand[0]), play(ids.player.hand[1])],
      },
      check: ({ events, state, ids }) => {
        const [, panther] = ids.player.hand;
        const [topFiller, deckDirewolf] = ids.player.deck;
        // The direwolf already in play was not materialized this turn; the one played first was.
        expect(fired(events, panther, 0)).toEqual([panther]);
        expect(fired(events, panther, 1)).toEqual([panther]);
        expect(state.sides.player.currentEnergy).toBe(1);
        expect(state.sides.player.hand).toEqual([deckDirewolf]);
        expect(state.sides.player.deck[0]).toBe(topFiller);
      },
    },
    {
      name: `${paleclawPanther.id} in play gains from every spirit animal and draws only for the second`,
      spec: {
        board: {
          active: "player",
          phase: "day",
          player: { hand: [DIREWOLF, DIREWOLF, DIREWOLF], back: [PALECLAW], energy: 12, deck: [FILLER, DIREWOLF, DIREWOLF, ...DECK] },
          enemy: { deck: DECK },
        },
        steps: (ids) => ids.player.hand.map((card) => play(card)),
      },
      check: ({ events, state, ids }) => {
        const [panther] = ids.player.back;
        const [first, second, third] = ids.player.hand;
        const [, deckDirewolf] = ids.player.deck;
        expect(fired(events, panther, 0)).toEqual([first, second, third]);
        expect(fired(events, panther, 1)).toEqual([second]);
        expect(state.sides.player.currentEnergy).toBe(3);
        expect(state.sides.player.hand).toEqual([deckDirewolf]);
      },
    },
    {
      name: `${dawnprowler.id} gains for each spirit animal after the first this turn, itself the first`,
      spec: {
        board: {
          active: "player",
          phase: "day",
          player: { hand: [DAWNPROWLER, DIREWOLF, DIREWOLF], energy: 10, deck: DECK },
          enemy: { deck: DECK },
        },
        steps: (ids) => ids.player.hand.map((card) => play(card)),
      },
      check: ({ events, state, ids }) => {
        const [prowler, second, third] = ids.player.hand;
        expect(fired(events, prowler, 0)).toEqual([second, third]);
        expect(state.sides.player.currentEnergy).toBe(10 - 1 - 4 - 4 + 2);
      },
    },
  ],
} satisfies ScenarioModule;
