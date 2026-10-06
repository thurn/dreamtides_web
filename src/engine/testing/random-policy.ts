import type { Action } from "../rules/actions";
import { hashString } from "../state/hash";
import type { BattleSeed } from "../state/ids";

/** A policy-private deterministic random stream; never the battle's RNG. */
export class PolicyRandom {
  private index = 0;

  constructor(private readonly seed: BattleSeed) {}

  next(): number {
    const value = hashString(`${this.seed}|${String(this.index)}`) / 2 ** 53;
    this.index += 1;
    return value;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) {
      throw new Error("pick from an empty list");
    }
    return item;
  }
}

/**
 * The Random policy: accepts a loop on offer half the time, repeating it one
 * to three times; otherwise passes a quarter of the time, otherwise plays a
 * card, activates an ability, or pays to end an effect when it can,
 * otherwise repositions, so random games make progress and end.
 */
export function randomAction(legal: readonly Action[], random: PolicyRandom): Action {
  const loop = legal.find((action) => action.kind === "repeatLoop");
  if (loop !== undefined && random.next() < 0.5) {
    return { ...loop, count: 1 + Math.floor(random.next() * 3) };
  }
  const plays = legal.filter(
    (action) => action.kind === "play" || action.kind === "activate" || action.kind === "payToEnd",
  );
  const moves = legal.filter((action) => action.kind === "reposition");
  const roll = random.next();
  if (roll < 0.25 || (plays.length === 0 && moves.length === 0)) {
    return { kind: "pass" };
  }
  if (plays.length > 0 && (roll < 0.8 || moves.length === 0)) {
    return random.pick(plays);
  }
  return moves.length > 0 ? random.pick(moves) : { kind: "pass" };
}
