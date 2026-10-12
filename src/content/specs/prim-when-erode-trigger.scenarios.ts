/**
 * Scenario specs for prim-when-erode-trigger (D20): From the Barrow's two
 * abilities together. Its "events in your void gain reclaim" names the
 * events in the void as it resolves, never itself on the stack nor an event
 * put there later, and ends with the turn; its "When you discard or erode
 * this card" works from the void, so an eroded copy is played from there for
 * 3● and its first ability still applies (RD-hv-umm2.87-1, RD-hv-umm2.87-2).
 */
import { expect } from "vitest";
import type { EngineEvent } from "../../engine/events";
import type { EffectId, InstanceId } from "../../engine/state/ids";
import type { ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import fromTheBarrow from "../cards/from-the-barrow-4752fc43";
import nightScavenger from "../cards/night-scavenger-19aeffa6";

const BARROW = parseCardId(fromTheBarrow.id);
const SCAVENGER = parseCardId(nightScavenger.id);
const DECK = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);

/** The cards `source`'s floating effects gave Reclaim, with the effects' ids. */
function reclaimGrants(events: readonly EngineEvent[], source: InstanceId | undefined): { instance: InstanceId; effect: EffectId }[] {
  return events.flatMap((event) =>
    event.kind === "effectStarted" && event.source === source && event.change.kind === "keyword" && event.change.keyword === "reclaim"
      ? [{ instance: event.change.instance, effect: event.effect }]
      : [],
  );
}

export default {
  slug: "prim-when-erode-trigger",
  scenarios: [
    {
      name: `${fromTheBarrow.id} gives Reclaim until end of turn to the events in its controller's void as it resolves, not itself or later arrivals`,
      spec: {
        board: {
          active: "player",
          phase: "day",
          player: { hand: [BARROW, SYNTHETIC.event1.id], void: [SYNTHETIC.event0.id, SYNTHETIC.vanilla1.id, BARROW], energy: 6, deck: DECK },
          enemy: { void: [SYNTHETIC.event0.id], deck: DECK },
        },
        steps: (ids) => [
          { side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } },
          { side: "player", action: { kind: "play", card: ids.player.hand[1], from: "hand" } },
          // The player passes Day, the enemy its Dusk window, and the player Night: the turn ends.
          { side: "player", action: { kind: "pass" } },
          { side: "enemy", action: { kind: "pass" } },
          { side: "player", action: { kind: "pass" } },
        ],
      },
      check: ({ events, state, ids }) => {
        const [played, later] = ids.player.hand;
        const [event, , copy] = ids.player.void;
        const grants = reclaimGrants(events, played);
        expect(grants.map((grant) => grant.instance)).toEqual([event, copy]);
        expect(state.instances[played]?.zone).toBe("void");
        expect(state.instances[later]?.zone).toBe("void");
        // Resolving into the void is neither a discard nor an erode.
        expect(events.some((entry) => entry.kind === "triggerQueued")).toBe(false);
        // The turn ended, and with it every grant.
        expect(state.turn.active).toBe("enemy");
        const ended = events.flatMap((entry) => (entry.kind === "effectEnded" ? [entry.effect] : []));
        for (const grant of grants) expect(ended).toContain(grant.effect);
        expect(state.floating.some((effect) => grants.some((grant) => grant.effect === effect.id))).toBe(false);
      },
    },
    {
      name: `${fromTheBarrow.id} eroded from its owner's deck gains reclaim 3● and is played from the void, granting its events and banished`,
      spec: {
        board: {
          active: "player",
          phase: "day",
          player: { hand: [SCAVENGER], void: [SYNTHETIC.event0.id, SYNTHETIC.vanilla1.id], energy: 6, deck: [BARROW, ...DECK] },
          enemy: { deck: DECK },
        },
        steps: (ids) => [
          { side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } },
          { side: "player", action: { kind: "play", card: ids.player.deck[0], from: "void" } },
        ],
      },
      check: ({ events, state, ids }) => {
        const [barrow] = ids.player.deck;
        const [event] = ids.player.void;
        expect(events).toContainEqual(expect.objectContaining({ kind: "eroded", side: "player", instance: barrow }));
        expect(events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: barrow, controller: "player", subject: barrow }));
        // 3● for Night Scavenger, then the gained Reclaim's 3● in place of the printed 5●.
        expect(state.sides.player.currentEnergy).toBe(0);
        expect(state.instances[barrow]?.zone).toBe("banished");
        const grants = reclaimGrants(events, barrow);
        // The trigger's own permanent grant on itself, then the played card's grant on the event left in the void.
        expect(grants.map((grant) => grant.instance)).toEqual([barrow, event]);
        expect(state.floating.some((effect) => effect.change.kind === "keyword" && effect.change.instance === event)).toBe(true);
      },
    },
  ],
} satisfies ScenarioModule;
