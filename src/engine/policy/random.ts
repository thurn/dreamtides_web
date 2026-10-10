/**
 * The Random policy and its policy-private random stream. The fuzzer plays
 * both sides with `randomAction`; the AI host runs `RANDOM_POLICY`.
 */
import { randomLegalAnswer } from "../prompts/answers";
import type { Action } from "../rules/actions";
import { hashString } from "../state/hash";
import type { BattleSeed } from "../state/ids";
import type { BattleView } from "../view/view";
import { declineAnswer, optionalChainSpent } from "./prompts";
import type { Policy, PolicyChoice, PolicyContext, PolicyDecision, PolicyResult } from "./types";

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

/**
 * The Random policy for the AI host: `randomAction` for a top-level
 * decision and a uniformly random legal answer for a prompt, declining once
 * the optional chain is spent.
 */
export const RANDOM_POLICY: Policy = {
  id: "random",
  decide(view: BattleView, decision: PolicyDecision, ctx: PolicyContext): PolicyResult {
    const started = ctx.now();
    let choice: PolicyChoice;
    let declined = false;
    if (decision.kind === "topLevel") {
      choice = { kind: "action", action: randomAction(decision.legal, ctx.random) };
    } else if (optionalChainSpent(view.automaticChoices)) {
      declined = true;
      choice = { kind: "answer", value: declineAnswer(decision.prompt) };
    } else {
      choice = { kind: "answer", value: randomLegalAnswer(decision.prompt, () => ctx.random.next()) };
    }
    return {
      choice,
      trace: {
        policy: "random",
        budget: ctx.budget,
        used: { iterations: 1, ms: ctx.now() - started },
        determinizations: 0,
        candidates: [],
        chosen: choice,
        ...(declined ? { declined: "optionalChain" as const } : {}),
      },
    };
  },
};
