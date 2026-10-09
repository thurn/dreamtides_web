import { hashString } from "../state/hash";
import { allowedAnswers, canonicalAnswer } from "./answers";
import type { Prompt, PromptFingerprint } from "./types";

/**
 * A hash of the prompt's identifying fields: kind, side, purpose, sorted
 * candidates, bounds, options, destinations with their counts, cost, and the
 * allowed answers of a narrowed prompt. Replaying a step compares it, so
 * nondeterministic rules code fails loudly on the first replay.
 */
export function promptFingerprint(prompt: Prompt): PromptFingerprint {
  const fields: unknown[] = [prompt.kind, prompt.side, prompt.purpose, prompt.privateTo ?? null];
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards":
      fields.push([...prompt.candidates].sort(), prompt.min, prompt.max);
      break;
    case "chooseMode":
      fields.push(prompt.options);
      break;
    case "chooseNumber":
      fields.push(prompt.min, prompt.max);
      break;
    case "arrange":
      fields.push(
        [...prompt.cards].sort(),
        prompt.destinations.map((slot) => [slot.to, slot.min, slot.max]),
      );
      break;
    case "confirm":
      break;
    case "payOrDecline":
      fields.push(prompt.energy, prompt.payable);
      break;
  }
  const allowed = allowedAnswers(prompt);
  if (allowed !== undefined) fields.push(allowed.map((answer) => canonicalAnswer(prompt, answer)).sort());
  return hashString(JSON.stringify(fields)).toString(36) as PromptFingerprint;
}
