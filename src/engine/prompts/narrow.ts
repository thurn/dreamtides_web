/**
 * Narrowing a play-time prompt to the answers with a feasible continuation
 * (engine-design § Legality by search). The narrowed prompt states its legal
 * set in its own fields where they can: fewer candidates, tighter bounds, a
 * mode marked not legal. When they cannot, it lists the legal answers in
 * `allowed`. A prompt whose every answer is feasible comes back unchanged,
 * fingerprint included.
 */
import type { InstanceId } from "../state/ids";
import { canonicalAnswer, legalAnswers } from "./answers";
import type { Answer, ArrangeAnswer, Prompt } from "./types";

/** How many ways to choose `size` of `count` cards. */
function choose(count: number, size: number): number {
  let ways = 1;
  for (let index = 0; index < size; index++) ways = (ways * (count - index)) / (index + 1);
  return ways;
}

/** Whether `prompt` has more legal answers than `count`. */
function hasMoreAnswersThan(prompt: Prompt, count: number): boolean {
  let seen = 0;
  for (const answer of legalAnswers(prompt)) {
    void answer;
    seen += 1;
    if (seen > count) return true;
  }
  return false;
}

/**
 * `prompt` restricted to the answers in `feasible`, a subset of its legal
 * answers in `legalAnswers` order. An empty `feasible` gives a prompt with no
 * legal answer.
 */
export function narrowPrompt(prompt: Prompt, feasible: readonly Answer[]): Prompt {
  if (!hasMoreAnswersThan(prompt, feasible.length)) return prompt;
  const keys = new Set(feasible.map((answer) => canonicalAnswer(prompt, answer)));
  switch (prompt.kind) {
    case "chooseMode":
      return {
        ...prompt,
        options: prompt.options.map((option) => ({ mode: option.mode, legal: option.legal && keys.has(canonicalAnswer(prompt, option.mode)) })),
      };
    case "chooseNumber": {
      const values = (feasible as readonly number[]).slice().sort((a, b) => a - b);
      const [min] = values;
      const max = values[values.length - 1];
      if (min === undefined || max === undefined) return { ...prompt, allowed: [] };
      const narrowed = { ...prompt, min, max };
      return values.length === max - min + 1 ? narrowed : { ...narrowed, allowed: values };
    }
    case "chooseTargets":
    case "chooseCards": {
      const selections = feasible as readonly (readonly InstanceId[])[];
      if (selections.length === 0) return { ...prompt, allowed: [] };
      const used = new Set(selections.flat());
      const sizes = selections.map((selection) => selection.length);
      const narrowed = {
        ...prompt,
        candidates: prompt.candidates.filter((id) => used.has(id)),
        min: Math.min(...sizes),
        max: Math.max(...sizes),
      };
      let total = 0;
      for (let size = narrowed.min; size <= narrowed.max; size++) total += choose(narrowed.candidates.length, size);
      return total === selections.length ? narrowed : { ...narrowed, allowed: selections.map((selection) => [...selection]) };
    }
    case "arrange":
      return { ...prompt, allowed: feasible as readonly ArrangeAnswer[] };
    case "confirm":
    case "payOrDecline":
      return { ...prompt, allowed: feasible as readonly boolean[] };
  }
}
