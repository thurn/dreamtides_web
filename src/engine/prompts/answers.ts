import { BATTLE } from "../../content/battle";
import type { InstanceId } from "../state/ids";
import type { Answer, ArrangeAnswer, ArrangeDestination, ArrangePrompt, Prompt } from "./types";

function isInstanceList(value: Answer): value is readonly InstanceId[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isArrangement(value: Answer): value is ArrangeAnswer {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "object" && item !== null && "card" in item && "to" in item)
  );
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function isLegalArrangement(prompt: ArrangePrompt, value: ArrangeAnswer): boolean {
  if (value.length !== prompt.cards.length) return false;
  const cards = new Set(value.map((entry) => entry.card));
  if (cards.size !== prompt.cards.length || !prompt.cards.every((card) => cards.has(card))) {
    return false;
  }
  if (!value.every((entry) => prompt.destinations.some((slot) => slot.to === entry.to))) {
    return false;
  }
  return prompt.destinations.every((slot) => {
    const count = value.filter((entry) => entry.to === slot.to).length;
    return count >= slot.min && count <= slot.max;
  });
}

/** Whether `value` is a legal answer to `prompt`. Answers are validated against the engine's own prompt. */
export function isLegalAnswer(prompt: Prompt, value: Answer): boolean {
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards": {
      if (!isInstanceList(value)) return false;
      const unique = new Set(value);
      return (
        unique.size === value.length &&
        value.length >= prompt.min &&
        value.length <= prompt.max &&
        value.every((id) => prompt.candidates.includes(id))
      );
    }
    case "chooseMode":
      return (
        typeof value === "number" &&
        prompt.options.some((option) => option.mode === value && option.legal)
      );
    case "chooseNumber":
      return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= prompt.min &&
        value <= prompt.max
      );
    case "arrange":
      return isArrangement(value) && isLegalArrangement(prompt, value);
    case "confirm":
      return typeof value === "boolean";
    case "payOrDecline":
      return typeof value === "boolean" && (prompt.payable || !value);
  }
}

/**
 * Whether the prompt has at least one legal answer. A prompt without one
 * must never be raised. Assumes the prompt is well formed (`isWellFormedPrompt`).
 */
export function hasLegalAnswer(prompt: Prompt): boolean {
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards":
      return prompt.min <= prompt.max && prompt.min <= prompt.candidates.length;
    case "chooseMode":
      return prompt.options.some((option) => option.legal);
    case "chooseNumber":
      return prompt.min <= prompt.max;
    case "arrange": {
      const count = prompt.cards.length;
      return (
        sum(prompt.destinations.map((slot) => slot.min)) <= count &&
        sum(prompt.destinations.map((slot) => slot.max)) >= count
      );
    }
    case "confirm":
    case "payOrDecline":
      return true;
  }
}

/**
 * The prompt's only legal answer, when it has exactly one and the battle
 * data module enables auto-answers; otherwise `undefined`.
 */
export function forcedAnswer(prompt: Prompt): Answer | undefined {
  if (!BATTLE.autoAnswerForcedPrompts) return undefined;
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards":
      if (prompt.max === 0) return [];
      return prompt.min === prompt.candidates.length && prompt.max === prompt.min
        ? [...prompt.candidates]
        : undefined;
    case "chooseMode": {
      const legal = prompt.options.filter((option) => option.legal);
      return legal.length === 1 ? legal[0]?.mode : undefined;
    }
    case "chooseNumber":
      return prompt.min === prompt.max ? prompt.min : undefined;
    case "arrange": {
      const [card, ...rest] = prompt.cards;
      if (card === undefined) return [];
      if (rest.length > 0) return undefined;
      const legal = prompt.destinations.filter((slot) => isLegalArrangement(prompt, [{ card, to: slot.to }]));
      const [only] = legal;
      return legal.length === 1 && only !== undefined ? [{ card, to: only.to }] : undefined;
    }
    case "confirm":
      return undefined;
    case "payOrDecline":
      return prompt.payable ? undefined : false;
  }
}

/** A legal answer drawn with `random` (a uniform `[0, 1)` source). */
export function randomLegalAnswer(prompt: Prompt, random: () => number): Answer {
  const pickIndex = (count: number): number => Math.floor(random() * count);
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards": {
      const span = Math.min(prompt.max, prompt.candidates.length) - prompt.min;
      const count = prompt.min + pickIndex(span + 1);
      const pool = [...prompt.candidates];
      const chosen: InstanceId[] = [];
      for (let index = 0; index < count; index++) {
        const [card] = pool.splice(pickIndex(pool.length), 1);
        if (card !== undefined) chosen.push(card);
      }
      return chosen;
    }
    case "chooseMode": {
      const legal = prompt.options.filter((option) => option.legal);
      return legal[pickIndex(legal.length)]?.mode ?? 0;
    }
    case "chooseNumber":
      return prompt.min + pickIndex(prompt.max - prompt.min + 1);
    case "arrange": {
      const pool = [...prompt.cards];
      const order: InstanceId[] = [];
      while (pool.length > 0) {
        const [card] = pool.splice(pickIndex(pool.length), 1);
        if (card !== undefined) order.push(card);
      }
      // Every destination gets its minimum, then each remaining card goes to
      // a random destination with room left.
      const counts = prompt.destinations.map((slot) => slot.min);
      for (let remaining = order.length - sum(counts); remaining > 0; remaining--) {
        const open = prompt.destinations.flatMap((slot, index) =>
          (counts[index] ?? 0) < slot.max ? [index] : [],
        );
        const index = open[pickIndex(open.length)];
        if (index === undefined) break;
        counts[index] = (counts[index] ?? 0) + 1;
      }
      const arrangement: { card: InstanceId; to: ArrangeDestination }[] = [];
      prompt.destinations.forEach((slot, index) => {
        for (let count = 0; count < (counts[index] ?? 0); count++) {
          const card = order[arrangement.length];
          if (card !== undefined) arrangement.push({ card, to: slot.to });
        }
      });
      return arrangement;
    }
    case "confirm":
      return random() < 0.5;
    case "payOrDecline":
      return prompt.payable && random() < 0.5;
  }
}

/** The first legal answer: the minimum selection, the lowest legal mode or number, or "decline". */
export function firstLegalAnswer(prompt: Prompt): Answer {
  return randomLegalAnswer(prompt, () => 0);
}
