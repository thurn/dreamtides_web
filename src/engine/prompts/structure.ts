import type { InstanceId } from "../state/ids";
import { allowedAnswers, canonicalAnswer, fieldsAllow } from "./answers";
import type { Prompt } from "./types";

function isBound(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function bounded(min: number, max: number): boolean {
  return isBound(min) && isBound(max) && min <= max;
}

function distinct(values: readonly unknown[]): boolean {
  return new Set(values).size === values.length;
}

/** Whether a narrowed prompt's allowed answers are distinct and each allowed by its fields. */
function wellFormedAllowed(prompt: Prompt): boolean {
  const allowed = allowedAnswers(prompt);
  return (
    allowed === undefined ||
    (distinct(allowed.map((answer) => canonicalAnswer(prompt, answer))) && allowed.every((answer) => fieldsAllow(prompt, answer)))
  );
}

/**
 * Whether rules code built `prompt` correctly: distinct candidates, cards,
 * modes, and destinations, non-negative integer bounds with `min <= max`,
 * and distinct allowed answers its fields allow. Validation of answers and
 * auto-answers assumes this holds.
 */
export function isWellFormedPrompt(prompt: Prompt): boolean {
  return wellFormedFields(prompt) && wellFormedAllowed(prompt);
}

function wellFormedFields(prompt: Prompt): boolean {
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards":
      return distinct(prompt.candidates) && bounded(prompt.min, prompt.max);
    case "chooseMode":
      return (
        distinct(prompt.options.map((option) => option.mode)) &&
        prompt.options.every((option) => Number.isInteger(option.mode))
      );
    case "chooseNumber":
      return bounded(prompt.min, prompt.max);
    case "arrange":
      return (
        distinct(prompt.cards) &&
        distinct(prompt.destinations.map((slot) => slot.to)) &&
        prompt.destinations.every((slot) => bounded(slot.min, slot.max))
      );
    case "confirm":
      return true;
    case "payOrDecline":
      return isBound(prompt.energy);
  }
}

/** Rules code raised a malformed prompt, which must never happen. */
export class MalformedPrompt extends Error {
  constructor(readonly prompt: Prompt) {
    super(`A ${prompt.kind} prompt (${prompt.purpose.role}) is malformed`);
  }
}

/** The instances a prompt shows: its candidates or the cards it arranges. */
export function promptCards(prompt: Prompt): readonly InstanceId[] {
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards":
      return prompt.candidates;
    case "arrange":
      return prompt.cards;
    case "chooseMode":
    case "chooseNumber":
    case "confirm":
    case "payOrDecline":
      return [];
  }
}
