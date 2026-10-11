import { expect } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { characterYouControl, energy, energyX, enemyCharacter, event, self, target } from "../../../dsl/builders";
import { triggered, whenYouPlay } from "../../../dsl/triggers";
import type { Answer, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import type { Action } from "../../../rules/actions";
import { instanceOf } from "../../../rules/zones";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { zoneCatalog } from "../../../testing/zone-cards";
import { resolveEffect } from "../../interpreter";
import { drawMatching } from "../draw-matching";
import { modifyCardCost } from "../modify-card-cost";
import { returnToHand } from "../return-to-hand";
import { v } from "./cards-support";

function card(
  index: number,
  cardType: "character" | "event",
  costs: EngineCardDefinition["costs"],
  abilities: EngineCardDefinition["abilities"],
  options: { readonly subtype?: EngineCardDefinition["subtype"]; readonly speed?: EngineCardDefinition["speed"] } = {},
): EngineCardDefinition {
  return {
    id: syntheticId(0x7b00 + index),
    cardType,
    costs,
    spark: cardType === "character" ? 1 : null,
    subtype: options.subtype ?? (cardType === "character" ? "Warrior" : ""),
    speed: options.speed ?? "standard",
    status: "authored",
    abilities,
  };
}

/** Synthetic cards for the `modifyCardCost` contracts. */
export const MC = {
  /** "Return an enemy to hand. It costs 2● more." */
  repel: card(0, "event", [energy(1)], () => [event(modifyCardCost(returnToHand(target(enemyCharacter())), { increase: 2 }))]),
  /** "Draw a ≤2● cost card. It costs 0●." */
  weave: card(1, "event", [energy(0)], () => [event(modifyCardCost(drawMatching({ costAtMost: 2 }), { set: 0 }))]),
  /** A 3● spirit animal: "When you play a spirit animal, return this character to hand. It costs 0● this turn." */
  courser: card(2, "character", [energy(3)], () => [
    triggered(whenYouPlay({ subtype: "Spirit Animal" }), modifyCardCost(returnToHand(self()), { set: 0 }, { duration: "untilEndOfTurn" })),
  ], { subtype: "Spirit Animal" }),
  /** A vanilla 1● spirit animal. */
  animal: card(3, "character", [energy(1)], () => [], { subtype: "Spirit Animal" }),
  /** A vanilla 2● event costing 1● plus X. */
  xSpell: card(4, "event", [energy(1), energyX(0)], () => []),
  /** An interrupt "Return a character you control to hand" for 0●, a response. */
  quickRecall: card(5, "event", [energy(0)], () => [event(returnToHand(target(characterYouControl())))], { speed: "interrupt" }),
  /** A 2● event: "Draw a ≤2● cost card. It costs 2● more." */
  heavyDraw: card(6, "event", [energy(0)], () => [event(modifyCardCost(drawMatching({ costAtMost: 2 }), { increase: 2 }))]),
} as const;

/** Returns the chosen enemy to hand and sets its cost to 0●, then throws: a step that fails after its change. */
export const changeThenFail: EngineCardDefinition = {
  ...card(7, "event", [energy(0)], () => []),
  synthetic: {
    resolve(ctx, item) {
      const enemy = ctx.state.sides[item.controller === "player" ? "enemy" : "player"].backRank.find((id) => id !== null) ?? null;
      if (enemy === null) throw new Error("no enemy");
      resolveEffect(ctx, modifyCardCost(returnToHand(target(enemyCharacter())), { set: 0 }), {
        source: item.instance,
        origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0,
        controller: item.controller,
        x: null,
        optionalPaid: [],
        choices: { modes: [], targets: [[enemy]] },
      });
      throw new Error("the step fails after its cost change");
    },
  },
};

export const engine = createEngine(zoneCatalog([...Object.values(MC), changeThenFail]));

export const filler = Array.from({ length: 4 }, () => v.vanilla1.id);

export function placed(player: SideSetup, enemy: SideSetup = {}) {
  return boardState(engine.catalog, { active: "player", phase: "day", player: { deck: filler, ...player }, enemy: { deck: filler, ...enemy } });
}

/** Answers target and card prompts with `pick`, and a number prompt with its maximum, keeping each prompt. */
export class Picking implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (candidates: readonly InstanceId[]) => readonly InstanceId[] = (c) => [c[0]]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind === "chooseNumber") return prompt.max;
    if (prompt.kind !== "chooseTargets" && prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind} prompt`);
    return this.pick(prompt.candidates);
  }
}

export function act(state: BattleState, side: Side, action: Action, source: Picking = new Picking()) {
  const result = engine.apply(state, side, action, source);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return { ...result, prompts: source.prompts };
}

export const play = (card: InstanceId | null | undefined): Action => ({ kind: "play", card: card!, from: "hand" });

export const resolveStack = (state: BattleState) => passUntil(engine, state, (next) => next.stack.length === 0);

/** Plays `card` from hand for `side` and resolves the stack, with every event of both. */
export function playAndResolve(state: BattleState, side: Side, card: InstanceId | null | undefined, source?: Picking) {
  const played = act(state, side, play(card), source);
  const rest = resolveStack(played.state);
  expect(invariantViolations(rest.state, engine.catalog)).toEqual([]);
  return { state: rest.state, events: [...played.events, ...rest.events] };
}

/** The energy `side` pays to play `card` from hand now, as legality and the view read it. */
export function costNow(state: BattleState, card: InstanceId | null | undefined, viewer: Side): number | undefined {
  return engine.view(state, viewer).instances[card!]?.characteristics.cost;
}

/** Whether `side` may play `card` from hand now. */
export function canPlay(state: BattleState, side: Side, card: InstanceId | null | undefined): boolean {
  return engine.legalActions(state, side).some((action) => action.kind === "play" && action.card === card && action.from === "hand");
}
