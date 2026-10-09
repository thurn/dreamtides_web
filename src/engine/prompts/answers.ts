import type { InstanceId } from "../state/ids";
import type { BattleConfig } from "../state/types";
import type { Answer, ArrangeAnswer, ArrangeDestination, ArrangePrompt, ArrangeSlot, Prompt } from "./types";

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

/** Whether the prompt's fields (candidates, bounds, legal modes, destinations, payability) allow `value`, ignoring `allowed`. */
export function fieldsAllow(prompt: Prompt, value: Answer): boolean {
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

/** The prompt's list of legal answers when it withholds some (`allowed`), else `undefined`. */
export function allowedAnswers(prompt: Prompt): readonly Answer[] | undefined {
  return prompt.kind === "chooseMode" ? undefined : prompt.allowed;
}

/**
 * A key equal for two answers to `prompt` exactly when they mean the same
 * choice: a selection is a set, and an arrangement is each destination's
 * cards in order.
 */
export function canonicalAnswer(prompt: Prompt, value: Answer): string {
  if (prompt.kind === "chooseTargets" || prompt.kind === "chooseCards") {
    return isInstanceList(value) ? JSON.stringify([...value].sort()) : JSON.stringify(value);
  }
  if (prompt.kind === "arrange" && isArrangement(value)) {
    return JSON.stringify(prompt.destinations.map((slot) => value.filter((entry) => entry.to === slot.to).map((entry) => entry.card)));
  }
  return JSON.stringify(value);
}

/** Whether `value` is a legal answer to `prompt`. Answers are validated against the engine's own prompt. */
export function isLegalAnswer(prompt: Prompt, value: Answer): boolean {
  if (!fieldsAllow(prompt, value)) return false;
  const allowed = allowedAnswers(prompt);
  if (allowed === undefined) return true;
  const key = canonicalAnswer(prompt, value);
  return allowed.some((answer) => canonicalAnswer(prompt, answer) === key);
}

/**
 * Whether the prompt has at least one legal answer. A prompt without one
 * must never be raised. Assumes the prompt is well formed (`isWellFormedPrompt`).
 */
export function hasLegalAnswer(prompt: Prompt): boolean {
  const allowed = allowedAnswers(prompt);
  if (allowed !== undefined) return allowed.length > 0;
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

/** Every `size`-card selection from `pool`, in lexicographic order of positions. */
function* selections(pool: readonly InstanceId[], size: number, from = 0): Generator<InstanceId[]> {
  if (size === 0) {
    yield [];
    return;
  }
  for (let index = from; index <= pool.length - size; index++) {
    const card = pool[index];
    if (card === undefined) continue;
    for (const rest of selections(pool, size - 1, index + 1)) yield [card, ...rest];
  }
}

/** Every ordering of `cards`, in lexicographic order of positions. */
function* orderings(cards: readonly InstanceId[]): Generator<InstanceId[]> {
  if (cards.length === 0) {
    yield [];
    return;
  }
  for (const [index, card] of cards.entries()) {
    for (const rest of orderings([...cards.slice(0, index), ...cards.slice(index + 1)])) yield [card, ...rest];
  }
}

/** Every per-destination card count that holds `total` cards, the earlier destinations fullest first. */
function* destinationCounts(slots: readonly ArrangeSlot[], total: number): Generator<number[]> {
  const [slot, ...rest] = slots;
  if (slot === undefined) {
    if (total === 0) yield [];
    return;
  }
  for (let count = Math.min(slot.max, total); count >= slot.min; count--) {
    for (const counts of destinationCounts(rest, total - count)) yield [count, ...counts];
  }
}

/**
 * Every legal answer to `prompt`, lazily, each meaning a different choice;
 * the first is `firstLegalAnswer`. A prompt that lists `allowed` answers
 * yields those. Selections go from the fewest cards up, numbers and modes
 * from the lowest, a confirmation accepts before it declines, and an
 * arrangement lists each ordering of its cards with each split among the
 * destinations.
 */
export function* legalAnswers(prompt: Prompt): Generator<Answer> {
  const allowed = allowedAnswers(prompt);
  if (allowed !== undefined) {
    yield* allowed;
    return;
  }
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards":
      for (let size = prompt.min; size <= Math.min(prompt.max, prompt.candidates.length); size++) {
        yield* selections(prompt.candidates, size);
      }
      return;
    case "chooseMode":
      for (const option of prompt.options) if (option.legal) yield option.mode;
      return;
    case "chooseNumber":
      for (let value = prompt.min; value <= prompt.max; value++) yield value;
      return;
    case "arrange":
      for (const order of orderings(prompt.cards)) {
        for (const counts of destinationCounts(prompt.destinations, order.length)) {
          let next = 0;
          yield prompt.destinations.flatMap((slot, index) =>
            order.slice(next, (next += counts[index] ?? 0)).map((card) => ({ card, to: slot.to })),
          );
        }
      }
      return;
    case "confirm":
      yield true;
      yield false;
      return;
    case "payOrDecline":
      if (prompt.payable) yield true;
      yield false;
      return;
  }
}

/**
 * The prompt's only legal answer, when it has exactly one and the battle's
 * config enables auto-answers; otherwise `undefined`.
 */
export function forcedAnswer(
  prompt: Prompt,
  config: Pick<BattleConfig, "autoAnswerForcedPrompts">,
): Answer | undefined {
  if (!config.autoAnswerForcedPrompts) return undefined;
  const allowed = allowedAnswers(prompt);
  if (allowed !== undefined) return allowed.length === 1 ? allowed[0] : undefined;
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
  const allowed = allowedAnswers(prompt);
  if (allowed !== undefined) {
    const answer = allowed[pickIndex(allowed.length)];
    if (answer === undefined) throw new Error(`A ${prompt.kind} prompt allows no answer`);
    return answer;
  }
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

/**
 * The first legal answer, which `legalAnswers` also yields first: the first
 * allowed answer, the minimum selection, the lowest legal mode or number,
 * acceptance, or paying when payable.
 */
export function firstLegalAnswer(prompt: Prompt): Answer {
  return randomLegalAnswer(prompt, () => 0);
}
