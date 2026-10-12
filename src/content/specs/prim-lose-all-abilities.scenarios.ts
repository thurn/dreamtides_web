/** Fracture Fate's payable loss and Signal Hijacker's taken abilities, on the real cards, for both sides. */
import { expect } from "vitest";
import type { Side } from "../../engine/state/ids";
import { opponent, SIDES } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { playFromHand } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import fracture from "../cards/fracture-fate-9e9efbc0";
import hijacker from "../cards/signal-hijacker-890970bd";

const FRACTURE = parseCardId(fracture.id);
const HIJACKER = parseCardId(hijacker.id);
const DECK = Array.from({ length: 4 }, () => SYNTHETIC.vanilla1.id);
const VENGEFUL = SYNTHETIC.vengeful1.id;

function fractures(side: Side, amplified: boolean): NamedScenario {
  const target = opponent(side);
  return {
    name: `${fracture.id} ${side} ${amplified ? "amplified" : "base"} removes an enemy's abilities until its controller pays`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: { hand: [{ cardId: FRACTURE, amplified }], energy: 1, deck: DECK },
        [target]: { back: [VENGEFUL], deck: DECK },
      },
      steps: (ids) => [playFromHand(ids, side)],
    },
    check: ({ state, ids }) => {
      const enemy = ids[target].back[0]!;
      expect(state.floating).toEqual([expect.objectContaining({ controller: side, change: { kind: "loseAbilities", instance: enemy } })]);
      expect(state.payable).toEqual([expect.objectContaining({ payer: target, cost: amplified ? 4 : 3, affects: [enemy] })]);
      expect(state.floating[0]?.expiry).toEqual({ at: "paid", effect: state.payable[0]?.id });
      expect(state.instances[enemy]?.status.lostAbilities).toBe(0);
    },
  };
}

function hijacks(side: Side): NamedScenario {
  const target = opponent(side);
  return {
    name: `${hijacker.id} ${side} takes the abilities of the enemy it makes lose them`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: { hand: [HIJACKER], energy: 2, deck: DECK },
        [target]: { back: [VENGEFUL], deck: DECK },
      },
      steps: (ids) => [playFromHand(ids, side)],
    },
    check: ({ state, ids }) => {
      const enemy = ids[target].back[0]!;
      const self = ids[side].hand[0];
      expect(state.instances[self]?.zone).toBe("play");
      expect(state.instances[enemy]?.status.lostAbilities).toBe(0);
      expect(state.instances[self]?.status.gainedAbilities).toEqual([{ cardId: VENGEFUL, variant: { amplified: false } }]);
      expect(state.floating.map(({ change }) => change.kind)).toEqual(["loseAbilities", "abilities"]);
    },
  };
}

export default {
  slug: "prim-lose-all-abilities",
  scenarios: SIDES.flatMap((side) => [fractures(side, false), fractures(side, true), hijacks(side)]),
} satisfies ScenarioModule;
