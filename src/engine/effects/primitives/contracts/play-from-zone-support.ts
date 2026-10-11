/** Synthetic play-permission cards and a harness shared by the playFromZone contracts. */
import { expect } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { activated, energy, event, everyIn, exhaustSelf, staticAbility } from "../../../dsl/builders";
import { triggered, whenDiscard } from "../../../dsl/triggers";
import type { Answer, Prompt } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { instanceOrigin } from "../../../rules/activation";
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
import { discard } from "../discard";
import { playFromZone } from "../play-from-zone";
import { shuffleInto } from "../shuffle-into";
import { v } from "./cards-support";

function card(index: number, cardType: "character" | "event", cost: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition {
  return {
    id: syntheticId(0x7c10 + index),
    cardType,
    costs: [energy(cost)],
    spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed: "standard",
    status: "authored",
    abilities,
  };
}

export const PERMIT = {
  /** "You may play ≤2● cost characters from your void." */
  lowCharacters: card(0, "character", 4, () => [staticAbility(playFromZone("void", { cardType: "character", costAtMost: 2 }))]),
  /** "When you discard a card, you may play that card from your void this turn." */
  salvager: card(1, "character", 2, () => [triggered(whenDiscard(), playFromZone("void", {}, { cards: { kind: "subject" }, duration: "untilEndOfTurn" }))]),
  /** "☾: You may play an event from your void." */
  technician: card(2, "character", 2, () => [activated([exhaustSelf()], playFromZone("void", { cardType: "event" }, { next: true }))]),
  /** "You may play cards from your void." */
  anything: card(3, "character", 3, () => [staticAbility(playFromZone("void"))]),
  /** "Discard a card." */
  discarder: card(4, "event", 0, () => [event(discard(1))]),
  /** "Shuffle your void into your deck." */
  shuffler: card(5, "event", 0, () => [event(shuffleInto([everyIn("void")]))]),
  /** Lets its controller play events from their void, then throws: a step that fails after its permission. */
  permitThenFail: {
    ...card(6, "event", 0, () => []),
    synthetic: {
      resolve(ctx, item) {
        resolveEffect(ctx, playFromZone("void", { cardType: "event" }, { next: true }), {
          source: item.instance,
          origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
          ability: 0,
          controller: item.controller,
          x: null,
          optionalPaid: [],
          choices: { modes: [], targets: [] },
        });
        throw new Error("the step fails after its permission");
      },
    },
  },
} as const satisfies Record<string, EngineCardDefinition>;

export const engine = createEngine(zoneCatalog(Object.values(PERMIT)));

export const filler = Array.from({ length: 4 }, () => v.vanilla1.id);

/** A Day-phase board on the player's turn, with filler decks. */
export function placed(player: SideSetup, enemy: SideSetup = {}) {
  return boardState(engine.catalog, { active: "player", phase: "day", player: { deck: filler, ...player }, enemy: { deck: filler, ...enemy } });
}

/** Answers card prompts with `pick` over their candidates and mode prompts with `mode`, keeping each prompt. */
export class Answering implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(
    private readonly pick: (candidates: readonly InstanceId[]) => readonly InstanceId[] = (candidates) => [candidates[0]],
    private readonly mode = 0,
  ) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind === "chooseMode") return this.mode;
    if (prompt.kind !== "chooseTargets" && prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind} prompt`);
    return this.pick(prompt.candidates);
  }
}

/** Applies `action` for `side`, checking the engine invariants of the result. */
export function act(state: BattleState, side: Side, action: Action, source: Answering = new Answering()) {
  const result = engine.apply(state, side, action, source);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return { ...result, prompts: source.prompts };
}

/** Passes until the stack is empty. */
export function resolveStack(state: BattleState): BattleState {
  return passUntil(engine, state, (next) => next.stack.length === 0).state;
}

export const fromVoid = (card: InstanceId | null | undefined): Action => ({ kind: "play", card: card!, from: "void" });
export const activate = (source: InstanceId | null | undefined): Action => ({ kind: "activate", source: source!, ability: 0 });

/** The void cards `side` may play now. */
export function voidPlays(state: BattleState, side: Side = "player"): InstanceId[] {
  return engine.legalActions(state, side).flatMap((action) => (action.kind === "play" && action.from === "void" ? [action.card] : []));
}

export const zoneOf = (state: BattleState, id: InstanceId | null | undefined) => state.instances[id!]?.zone ?? null;
