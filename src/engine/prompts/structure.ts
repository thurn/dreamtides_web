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

/**
 * Whether rules code built `prompt` correctly: distinct candidates, cards,
 * modes, and destinations, and non-negative integer bounds with
 * `min <= max`. Validation of answers and auto-answers assumes this holds.
 */
export function isWellFormedPrompt(prompt: Prompt): boolean {
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
