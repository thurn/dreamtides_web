import { sha256 } from "js-sha256";

/**
 * The four-axis context that fully determines every random draw in a Dream
 * Journey. Two draws sharing all five fields plus the label produce the same
 * float; varying any field rotates the resulting digest.
 */
export type DrawContext = {
  seed: string;
  contentVersion: string;
  rootJourneyIndex: number;
  sequenceStep?: number;
  selectionAttempt?: number;
};

/**
 * Produce a uniform float in `[0, 1)` from `(context, label)` by hashing a
 * canonical labeled tuple with SHA-256 and reading the top 13 hex digits as a
 * 52-bit integer.
 *
 * The hash-input layout - null-byte-joined `seed:`, `content:`, `root:`,
 * `step:`, optional `attempt:`, `label:` - is the byte-stable contract shared
 * with the CLI. Any change to that layout silently re-randomises every
 * existing seed and must be treated as a content-version bump.
 */
function drawUnit(context: DrawContext, label: string): number {
  const material = [
    `seed:${context.seed}`,
    `content:${context.contentVersion}`,
    `root:${context.rootJourneyIndex}`,
    `step:${context.sequenceStep ?? "root"}`,
    ...(context.selectionAttempt === undefined ? [] : [`attempt:${context.selectionAttempt}`]),
    `label:${label}`,
  ].join("\0");
  const digest = sha256(material);
  const value = Number.parseInt(digest.slice(0, 13), 16);

  return value / 0x10000000000000;
}

export { drawUnit };

export function drawInt(
  context: DrawContext,
  label: string,
  minInclusive: number,
  maxInclusive: number,
): number {
  if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive)) {
    throw new Error("drawInt bounds must be integers");
  }

  if (maxInclusive < minInclusive) {
    throw new Error("drawInt maxInclusive must be greater than or equal to minInclusive");
  }

  const span = maxInclusive - minInclusive + 1;
  return minInclusive + Math.floor(drawUnit(context, label) * span);
}

export function weightedChoice<T>(
  context: DrawContext,
  label: string,
  choices: readonly { item: T; weight: number }[],
): T {
  const viableChoices = choices.filter((choice) => choice.weight > 0);

  if (viableChoices.length === 0) {
    throw new Error("weightedChoice requires at least one positive weight");
  }

  const totalWeight = viableChoices.reduce((total, choice) => total + choice.weight, 0);
  let threshold = drawUnit(context, label) * totalWeight;

  for (const choice of viableChoices) {
    threshold -= choice.weight;

    if (threshold <= 0) {
      return choice.item;
    }
  }

  return viableChoices[viableChoices.length - 1].item;
}

export function shuffleDeterministic<T>(
  context: DrawContext,
  label: string,
  items: readonly T[],
): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = drawInt(context, `${label}:${index}`, 0, index);
    const item = shuffled[index];

    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = item;
  }

  return shuffled;
}

export function deterministicTieJitter(
  context: DrawContext,
  label: string,
  magnitude: number,
): number {
  if (magnitude < 0) {
    throw new Error("deterministicTieJitter magnitude must be nonnegative");
  }

  return (drawUnit(context, label) * 2 - 1) * magnitude;
}
