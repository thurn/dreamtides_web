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
 * The Random policy: passes a quarter of the time, otherwise plays a card when
 * it can, otherwise repositions, so random games make progress and end.
 */
export function randomAction(legal: readonly Action[], random: PolicyRandom): Action {
  const plays = legal.filter((action) => action.kind === "play");
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
