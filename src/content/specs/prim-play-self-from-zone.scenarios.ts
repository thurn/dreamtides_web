/** The production "play this character from your void" card: its void-banish cost and its static ability working from the void. */
import { expect } from "vitest";
import { engineCardFromContent } from "../../engine/content-catalog";
import { createEngine } from "../../engine/engine";
import type { Prompt } from "../../engine/prompts/types";
import type { InstanceId } from "../../engine/state/ids";
import type { BattleState } from "../../engine/state/types";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, testCatalog } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import abomination from "../cards/abomination-of-memory-3e802ecd";

const ABOMINATION = parseCardId(abomination.id);
/** The number of other void cards its additional cost banishes. */
const BANISH = 7;
const DECK = Array.from({ length: 4 }, () => v.vanilla1.id);
const engine = createEngine(testCatalog([engineCardFromContent(abomination)]));
const voidPlays = (state: BattleState) => engine.legalActions(state, "player").filter((action) => action.kind === "play" && action.from === "void");
const others = (count: number) => Array.from({ length: count }, () => v.vanilla1.id);

const board = (otherVoidCards: number, energy: number) => ({
  active: "player" as const,
  phase: "day" as const,
  player: { void: [ABOMINATION, ...others(otherVoidCards)], energy, deck: DECK },
  enemy: { deck: DECK },
});

const scenarios: NamedScenario[] = [
  {
    name: `${abomination.id} is not playable from the void with only ${String(BANISH - 1)} other void cards to banish`,
    spec: { board: board(BANISH - 1, 5), steps: () => [] },
    check: ({ start, ids }) => {
      const [self] = ids.player.void;
      // The permission covers the card in the void; the banish cost alone blocks the play.
      expect(engine.view(start, "player").staticPlayPermissions).toEqual([expect.objectContaining({ kind: "playFrom", player: "player", zone: "void", instance: self })]);
      expect(voidPlays(start)).toEqual([]);
    },
  },
  ...[BANISH, BANISH + 2].map((otherVoidCards): NamedScenario => ({
    name: `${abomination.id} played from the void with ${String(otherVoidCards)} other void cards banishes exactly ${String(BANISH)} others and resolves into play unreclaimed`,
    spec: {
      board: board(otherVoidCards, 1),
      steps: (ids) => [{ side: "player", action: { kind: "play", card: ids.player.void[0], from: "void" } }],
      // With exactly seven other void cards the only legal banish is answered automatically.
      answers: (ids) => (otherVoidCards > BANISH ? [ids.player.void.slice(1, 1 + BANISH)] : []),
    },
    check: ({ start, state, answers, ids }) => {
      const [self, ...rest] = ids.player.void;
      expect(voidPlays(start)).toEqual([{ kind: "play", card: self, from: "void" }]);
      // The banish choice offers every other void card and never the card being played.
      expect(answers).toHaveLength(1);
      expect([...(answers[0].value as readonly InstanceId[])].sort()).toEqual(rest.slice(0, BANISH).sort());
      const prompts: Prompt[] = [];
      engine.apply(start, "player", { kind: "play", card: self, from: "void" }, {
        answer: (prompt) => {
          prompts.push(prompt);
          if (prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind} prompt`);
          return prompt.candidates.slice(0, BANISH);
        },
      });
      for (const prompt of prompts) {
        if (prompt.kind !== "chooseCards") throw new Error("expected a card choice");
        expect(prompt).toMatchObject({ purpose: { role: "banishCost" }, min: BANISH, max: BANISH });
        expect([...prompt.candidates].sort()).toEqual([...rest].sort());
      }

      expect([...state.sides.player.banished].sort()).toEqual(rest.slice(0, BANISH).sort());
      expect(state.sides.player.void).toEqual(rest.slice(BANISH));
      expect(state.sides.player.currentEnergy).toBe(0);
      expect(state.instances[self]).toMatchObject({ zone: "play", status: { reclaimed: false, playedViaReclaim: false } });
    },
  })),
];

export default { slug: "prim-play-self-from-zone", scenarios } satisfies ScenarioModule;
