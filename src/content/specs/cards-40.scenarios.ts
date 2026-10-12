/**
 * Scenario specs for the cards-40 batch (D20): Soulkindler's abandonment cost
 * moves it into the void, the functional zone of its own ▸Dawn ability, whose
 * intervening "if" then erodes 3 at its controller's next Dawn, while the
 * same ability does nothing from play (RD-hv-7x4l.6-1, RD-hv-7x4l.6-2).
 */
import { expect } from "vitest";
import type { Side } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule, ScenarioStep } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import soulkindler from "../cards/soulkindler-4edf2d8d";

const SOULKINDLER = parseCardId(soulkindler.id);
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
const pass = (side: Side): ScenarioStep => ({ side, action: { kind: "pass" } });

const scenarios: NamedScenario[] = [
  {
    name: `${soulkindler.id} abandoning itself returns the chosen void character, then erodes 3 from the void at the next Dawn`,
    spec: {
      board: {
        active: "player", phase: "day",
        player: { back: [SOULKINDLER], void: [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id], deck },
        enemy: { deck },
      },
      // The player's Day, the enemy's Dusk window, the player's Night, then
      // the enemy's Day, the player's Dusk window, and the enemy's Night,
      // after which the player's turn reaches Dawn.
      steps: (ids) => [
        { side: "player", action: { kind: "activate", source: ids.player.back[0]!, ability: 0 } },
        pass("player"), pass("enemy"), pass("player"), pass("enemy"), pass("player"), pass("enemy"),
      ],
      answers: (ids) => [[ids.player.void[1]]],
    },
    check: ({ state, ids, events }) => {
      const source = ids.player.back[0]!;
      const [kept, returned] = ids.player.void;
      const abandoned = events.findIndex((event) => event.kind === "dissolved" && event.instance === source);
      const dawn = events.findIndex((event) => event.kind === "phaseChanged" && event.phase === "dawn" && event.active === "player");
      const eroded = events.flatMap((event, index) => event.kind === "eroded" ? [{ instance: event.instance, index }] : []);
      expect(abandoned).toBeGreaterThanOrEqual(0);
      expect(state.instances[returned]?.zone).toBe("hand");
      expect(state.instances[source]?.zone).toBe("void");
      expect(eroded).toHaveLength(3);
      for (const erode of eroded) expect(erode.index).toBeGreaterThan(dawn);
      expect(events.some((event) => event.kind === "triggerResolved" && event.source === source && event.applied)).toBe(true);
      // The void lists its newest card first.
      expect(state.sides.player.void).toEqual([...eroded.map((erode) => erode.instance).reverse(), source, kept]);
    },
  },
  {
    name: `${soulkindler.id} its void ▸Dawn ability does nothing while the card is in play`,
    spec: {
      board: {
        active: "enemy", phase: "night",
        player: { back: [SOULKINDLER], deck },
        enemy: { deck },
      },
      steps: () => [pass("enemy")],
    },
    check: ({ state, ids, events }) => {
      expect(events.some((event) => event.kind === "phaseChanged" && event.phase === "dawn" && event.active === "player")).toBe(true);
      expect(events.some((event) => event.kind === "eroded")).toBe(false);
      expect(events.some((event) => event.kind === "triggerQueued")).toBe(false);
      expect(state.instances[ids.player.back[0]!]?.zone).toBe("play");
      expect(state.sides.player.void).toEqual([]);
    },
  },
];

export default { slug: "cards-40", scenarios } satisfies ScenarioModule;
