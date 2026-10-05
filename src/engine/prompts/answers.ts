import { BATTLE } from "../../content/battle";
import type { InstanceId } from "../state/ids";
import type { Answer, ArrangeAnswer, Prompt } from "./types";

function isInstanceList(value: Answer): value is readonly InstanceId[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isArrangement(value: Answer): value is ArrangeAnswer {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "object" && item !== null && "card" in item && "to" in item)
  );
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
    case "arrange": {
      if (!isArrangement(value) || value.length !== prompt.cards.length) return false;
      const cards = new Set(value.map((entry) => entry.card));
      return (
        cards.size === prompt.cards.length &&
        prompt.cards.every((card) => cards.has(card)) &&
        value.every((entry) => prompt.destinations.includes(entry.to))
      );
    }
    case "confirm":
      return typeof value === "boolean";
    case "payOrDecline":
      return typeof value === "boolean" && (prompt.payable || !value);
  }
}

/** Whether the prompt has at least one legal answer. A prompt without one must never be raised. */
export function hasLegalAnswer(prompt: Prompt): boolean {
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards":
      return prompt.min <= prompt.max && prompt.min <= prompt.candidates.length;
    case "chooseMode":
      return prompt.options.some((option) => option.legal);
    case "chooseNumber":
      return prompt.min <= prompt.max;
    case "arrange":
      return prompt.cards.length === 0 || prompt.destinations.length > 0;
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
    case "arrange":
      return prompt.cards.length <= 1 && prompt.destinations.length === 1
        ? prompt.cards.map((card) => ({ card, to: prompt.destinations[0] ?? "top" }))
        : undefined;
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
      const arrangement: { card: InstanceId; to: (typeof prompt.destinations)[number] }[] = [];
      while (pool.length > 0) {
        const [card] = pool.splice(pickIndex(pool.length), 1);
        const to = prompt.destinations[pickIndex(prompt.destinations.length)];
        if (card !== undefined && to !== undefined) arrangement.push({ card, to });
      }
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
