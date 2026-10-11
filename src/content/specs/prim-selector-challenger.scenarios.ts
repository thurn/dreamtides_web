/**
 * Scenario specs for the selectorChallenger primitive bead: Impending Fury's
 * catalog definition, base and amplified, drawing then discarding unless its
 * controller holds a challenger as the discard would happen (rules §
 * Challengers, Blockers, and Scoring → Holding a role), for the player and
 * through the enemy's Day, Dusk, Night, and Challenge.
 */
import { expect } from "vitest";
import type { EngineEvent } from "../../engine/events";
import type { CardId, InstanceId, Side } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule, ScenarioResult, ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import impendingFury from "../cards/impending-fury-3b5f5686";

const FURY = parseCardId(impendingFury.id);
const ONE = SYNTHETIC.vanilla1.id;
const TWO = SYNTHETIC.vanilla2.id;
const THREE = SYNTHETIC.vanilla3.id;
const DECK = [ONE, ONE, ONE, ONE];

const pass = (side: Side): ScenarioStep => ({ side, action: { kind: "pass" } });

/** The `index`-th placed instance of a zone, failing when the board places none. */
function placed(ids: readonly (InstanceId | null)[], index = 0): InstanceId {
  const id = ids[index];
  if (id === undefined || id === null) throw new Error(`the board places no card at ${String(index)}`);
  return id;
}

/** The cards `side` drew, in order. */
function drawn(events: readonly EngineEvent[], side: Side): (InstanceId | null)[] {
  return events.flatMap((event) => (event.kind === "cardDrawn" && event.side === side ? [event.instance] : []));
}

/** The cards discarded from `side`'s hand, in order. */
function discarded(result: ScenarioResult, side: Side): InstanceId[] {
  return result.events.flatMap((event) =>
    event.kind === "discarded" && result.start.instances[event.instance]?.owner === side ? [event.instance] : [],
  );
}

/**
 * The player's Night with Impending Fury in play: it draws the top card,
 * then discards the first hand card unless `keeps`.
 */
function playerNight(name: string, board: { front?: readonly CardId[]; back?: readonly CardId[] }, keeps: boolean): NamedScenario {
  return {
    name: `${impendingFury.id} ${name}`,
    spec: {
      board: {
        active: "player",
        phase: "day",
        player: { ...board, hand: [THREE], deck: DECK },
        enemy: { front: [TWO], deck: DECK },
      },
      // The player's Day, then the enemy's Dusk window; Night triggers resolve.
      steps: () => [pass("player"), pass("enemy")],
      answers: (ids) => (keeps ? [] : [[placed(ids.player.hand)]]),
    },
    check: (result) => {
      const { ids, state } = result;
      expect(state.turn).toMatchObject({ active: "player", phase: "night" });
      expect(drawn(result.events, "player")).toEqual([ids.player.deck[0]]);
      expect(discarded(result, "player")).toEqual(keeps ? [] : [placed(ids.player.hand)]);
      expect(state.sides.player.hand).toHaveLength(keeps ? 2 : 1);
      expect(state.sides.enemy.void).toEqual([]);
    },
  };
}

/**
 * Amplified Impending Fury played during the player's Day beside the `front`
 * characters, which become challengers: in its controller's own turn no
 * blocker counts, so only a challenger spares the discard.
 */
function amplifiedNight(name: string, front: readonly CardId[], keeps: boolean): NamedScenario {
  return {
    name: `${impendingFury.id} ${name}`,
    spec: {
      board: {
        active: "player",
        phase: "day",
        player: { front, hand: [{ cardId: FURY, amplified: true }, THREE], deck: DECK, energy: 2 },
        enemy: { front: [TWO], deck: DECK },
      },
      steps: (ids) => [
        { side: "player", action: { kind: "play", card: placed(ids.player.hand), from: "hand" } },
        pass("player"),
        pass("enemy"),
      ],
      answers: (ids) => (keeps ? [] : [[placed(ids.player.hand, 1)]]),
    },
    check: (result) => {
      const { ids, state } = result;
      const fury = placed(ids.player.hand);
      expect(state.instances[fury]).toMatchObject({ zone: "play", variant: { amplified: true } });
      expect(state.turn).toMatchObject({ active: "player", phase: "night" });
      expect(drawn(result.events, "player")).toEqual([ids.player.deck[0]]);
      expect(discarded(result, "player")).toEqual(keeps ? [] : [placed(ids.player.hand, 1)]);
    },
  };
}

export default {
  slug: "prim-selector-challenger",
  scenarios: [
    playerNight("draws, then discards with no challenger in its controller's Night", { back: [FURY] }, false),
    playerNight("draws and keeps its hand while it is itself a challenger", { front: [FURY] }, true),
    playerNight("draws and keeps its hand while another character it controls is a challenger", { back: [FURY], front: [ONE] }, true),
    amplifiedNight("amplified draws, then discards with no challenger in its controller's own turn", [], false),
    amplifiedNight("amplified draws and keeps its hand while its controller has a challenger", [ONE], true),
    {
      name: `${impendingFury.id} resolves for the enemy after live repositioning, and the Challenge phase scores the same pair`,
      spec: {
        board: {
          active: "enemy",
          phase: "day",
          player: { front: [TWO], deck: DECK },
          enemy: { back: [FURY, THREE], hand: [ONE], deck: DECK },
        },
        steps: (ids) => [
          // The enemy moves a character to the front rank in its Day, and the
          // player moves its character opposite it in the Dusk window.
          { side: "enemy", action: { kind: "reposition", card: placed(ids.enemy.back, 1), to: { rank: "front", index: 1 } } },
          pass("enemy"),
          { side: "player", action: { kind: "reposition", card: placed(ids.player.front), to: { rank: "front", index: 1 } } },
          pass("player"),
          // The enemy's Night window, then its Challenge.
          pass("enemy"),
        ],
      },
      check: (result: ScenarioResult) => {
        const { ids, state, events } = result;
        const challenger = placed(ids.enemy.back, 1);
        const blocker = placed(ids.player.front);
        expect(events).toContainEqual({ kind: "challengersDesignated", side: "enemy", challengers: [challenger] });
        expect(events).toContainEqual({ kind: "blockersDesignated", side: "player", blockers: { [challenger]: blocker } });
        expect(drawn(events, "enemy")).toContain(ids.enemy.deck[0]);
        expect(discarded(result, "enemy")).toEqual([]);
        expect(events).toContainEqual(expect.objectContaining({ kind: "laneResolved", lane: 1, challenger, blocker, winner: "enemy", scored: 1 }));
        expect(state.sides.enemy.score).toBe(1);
        expect(state.instances[blocker]?.zone).toBe("void");
        expect(state.sides.enemy.hand).toContain(ids.enemy.deck[0]);
      },
    },
  ],
} satisfies ScenarioModule;
