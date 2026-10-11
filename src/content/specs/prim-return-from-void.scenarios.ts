import { expect } from "vitest";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import dynamo from "../cards/ruptured-dynamo-ed02e610";
import vanguard from "../cards/returned-vanguard-4733876a";

const DYNAMO = parseCardId(dynamo.id);
const VANGUARD = parseCardId(vanguard.id);
const DECK = Array.from({ length: 4 }, () => SYNTHETIC.vanilla1.id);

const scenarios: NamedScenario[] = [true, false].map((pay) => ({
  name: `${vanguard.id} abandoned to ${dynamo.id} chooses ${pay ? "payment" : "decline"} independently of the void target`,
  spec: {
    board: {
      active: "player", phase: "day",
      player: { back: [DYNAMO, VANGUARD], void: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id], energy: 2, deck: DECK },
      enemy: { deck: DECK },
    },
    steps: (ids) => [{ side: "player", action: { kind: "activate", source: ids.player.back[0]!, ability: 0 } }],
    answers: (ids) => [[ids.player.void[1]], [ids.player.back[1]!], pay],
  },
  check: ({ state, events, ids }) => {
    const source = ids.player.back[1]!;
    expect(events).toContainEqual({ kind: "abandoned", instance: source, side: "player" });
    expect(events).toContainEqual({ kind: "dissolved", instance: source, side: "player" });
    expect(state.sides.player.hand).toEqual(pay ? [source, ids.player.void[1]] : [ids.player.void[1]]);
    expect(state.sides.player.void).toEqual(pay ? [ids.player.void[0]] : [source, ids.player.void[0]]);
    expect(state.sides.player.currentEnergy).toBe(pay ? 1 : 2);
    expect(events.filter((event) => event.kind === "returnedToHand").map((event) => event.instance)).toEqual(pay ? [source, ids.player.void[1]] : [ids.player.void[1]]);
  },
}));

scenarios.push({
  name: `${dynamo.id} abandons itself while returning a previously targeted void character`,
  spec: {
    board: { active: "player", phase: "day", player: { back: [DYNAMO], void: [SYNTHETIC.vanilla1.id], deck: DECK }, enemy: { deck: DECK } },
    steps: (ids) => [{ side: "player", action: { kind: "activate", source: ids.player.back[0]!, ability: 0 } }],
  },
  check: ({ state, ids }) => {
    expect(state.sides.player.hand).toEqual(ids.player.void);
    expect(state.sides.player.void).toEqual([ids.player.back[0]]);
  },
});

export default { slug: "prim-return-from-void", scenarios } satisfies ScenarioModule;
