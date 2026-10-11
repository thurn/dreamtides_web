import { createEngine } from "../../../engine";
import type { Answer, Prompt } from "../../../prompts/types";
import { type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { AnswerSource } from "../../../steps/types";
import { DSL_CARDS } from "../../../testing/dsl-cards";
import { SYNTHETIC, testCatalog } from "../../../testing/synthetic-cards";
import { type DiscoverCostsOf } from "../../../policy/prompts";

export const engine = createEngine(testCatalog(DSL_CARDS));

export const v = SYNTHETIC;

export const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];

/** Greedy answers here raise no free Discover cost choice. */
export const noDiscoverCosts: DiscoverCostsOf = () => new Set();

/**
 * `committed` as the fold recovers it from a step that fails after its
 * private prompt was published: `side` alone also knows `cards`, what that
 * prompt's run showed it, and nothing else of the step remains.
 */
export function knowing(committed: BattleState, side: Side, cards: readonly InstanceId[]): BattleState {
  return { ...committed, knownTo: { ...committed.knownTo, [side]: [...committed.knownTo[side], ...cards] } };
}

/** Answers every prompt with `pick` of its candidates, keeping each prompt it was asked. */
export class PickingSource implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (candidates: readonly InstanceId[]) => readonly InstanceId[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind} prompt`);
    return this.pick(prompt.candidates);
  }
}
