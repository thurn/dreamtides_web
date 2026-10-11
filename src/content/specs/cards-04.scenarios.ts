/**
 * Scenario specs for the cards-04 batch (D20): Pattern Seeker's draw from the
 * Ending hand-limit discard, which comes after that Ending's Ephemeral
 * banishment step (RD-hv-umm2.116-2).
 */
import { expect } from "vitest";
import type { EngineEvent } from "../../engine/events";
import type { InstanceId } from "../../engine/state/ids";
import type { BoardIds, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import patternSeeker from "../cards/pattern-seeker-9a18d375";

const PATTERN_SEEKER = parseCardId(patternSeeker.id);
const FILLER = SYNTHETIC.vanilla1.id;

/** The index of the first event at or after `from` matching `matches`, failing the check when there is none. */
function indexOf(
  events: readonly EngineEvent[],
  matches: (event: EngineEvent) => boolean,
  from = 0,
): number {
  const index = events.findIndex((event, at) => at >= from && matches(event));
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

/** The first card placed in the player's hand. */
function firstHandCard(ids: BoardIds): InstanceId {
  const card = ids.player.hand[0];
  if (card === undefined) throw new Error("the board places no hand card");
  return card;
}

export default {
  slug: "cards-04",
  scenarios: [
    {
      name: `${patternSeeker.id} a hand-limit discard draws an Ephemeral card that is banished at the next Ending`,
      spec: {
        board: {
          active: "player",
          phase: "night",
          player: {
            back: [PATTERN_SEEKER],
            hand: Array.from({ length: 11 }, () => FILLER),
            deck: [FILLER, FILLER, FILLER],
          },
          enemy: { hand: [FILLER], deck: [FILLER, FILLER, FILLER] },
        },
        // The player's Night, then the enemy's Day, the player's Dusk window,
        // and the enemy's Night, after which the enemy's Ending runs.
        steps: () => [
          { side: "player", action: { kind: "pass" } },
          { side: "enemy", action: { kind: "pass" } },
          { side: "player", action: { kind: "pass" } },
          { side: "enemy", action: { kind: "pass" } },
        ],
        answers: (ids) => [[firstHandCard(ids)]],
      },
      check: ({ events, state, ids }) => {
        const discarded = indexOf(
          events,
          (event) =>
            event.kind === "discarded" && event.instance === firstHandCard(ids),
        );
        const drawn = indexOf(
          events,
          (event) => event.kind === "cardDrawn" && event.side === "player",
          discarded,
        );
        const drawnEvent = events[drawn];
        if (drawnEvent?.kind !== "cardDrawn" || drawnEvent.instance === null)
          throw new Error("no draw follows the discard");
        const card = drawnEvent.instance;
        const enemyTurn = indexOf(
          events,
          (event) => event.kind === "turnStarted" && event.side === "enemy",
        );
        const enemyEnding = indexOf(
          events,
          (event) =>
            event.kind === "phaseChanged" &&
            event.phase === "ending" &&
            event.active === "enemy",
        );
        const banished = indexOf(
          events,
          (event) => event.kind === "banished" && event.instance === card,
        );
        expect(drawn).toBeLessThan(enemyTurn);
        expect(banished).toBeGreaterThan(enemyEnding);
        expect(state.instances[card]?.zone).toBe("banished");
      },
    },
  ],
} satisfies ScenarioModule;
