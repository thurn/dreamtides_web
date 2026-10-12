import { hashString } from "../state/hash";
import { allowedAnswers, canonicalAnswer } from "./answers";
import type { Prompt, PromptFingerprint } from "./types";

/**
 * A hash of the prompt's identifying fields: kind, side, purpose, sorted
 * candidates, bounds, options with any character types they name, destinations with their counts, cost, and the
 * allowed answers of a narrowed prompt. Replaying a step compares it, so
 * nondeterministic rules code fails loudly on the first replay.
 */
function fingerprintHash(prompt: Prompt, includeCostOptions = true): PromptFingerprint {
  const fields: unknown[] = [prompt.kind, prompt.side, prompt.purpose, prompt.privateTo ?? null];
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards":
      fields.push([...prompt.candidates].sort(), prompt.min, prompt.max);
      break;
    case "chooseSlot":
      fields.push(prompt.fieldSide, prompt.slots);
      break;
    case "chooseMode":
      fields.push(prompt.options);
      if (prompt.subtypes !== undefined) fields.push(prompt.subtypes);
      if (includeCostOptions && prompt.costOptions !== undefined) fields.push(prompt.costOptions);
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

/** Cost metadata has an explicit format so current records compare it strictly. */
const COST_CHOICE_VERSION = "cost-choice-v1:";

function versionedCostChoice(prompt: Prompt): boolean {
  return prompt.kind === "chooseMode" && prompt.purpose.role === "chooseCost" && prompt.costOptions !== undefined;
}

/** Metadata-free prompts retain their established fingerprint format. */
export function promptFingerprint(prompt: Prompt): PromptFingerprint {
  const hash = fingerprintHash(prompt);
  return (versionedCostChoice(prompt) ? COST_CHOICE_VERSION + hash : hash) as PromptFingerprint;
}

/**
 * Replay accepts the two unversioned cost-choice formats saved by earlier
 * engines: the full metadata hash and the hash of its decision surface alone.
 * Versioned records require exact equality, including every payment detail;
 * every accepted answer still needs the live prompt's legality check.
 */
export function matchesPromptFingerprint(prompt: Prompt, recorded: PromptFingerprint, current: PromptFingerprint): boolean {
  if (recorded === current) return true;
  if (!versionedCostChoice(prompt) || !/^[0-9a-z]+$/.test(recorded)) return false;
  return recorded === fingerprintHash(prompt) || recorded === fingerprintHash(prompt, false);
}
