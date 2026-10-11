/** Synthetic "not banished" cards and a harness shared by the reclaimNotBanished contracts. */
import { expect } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { all, anyCharacter, energy, enemyCharacter, event, keyword, stackItem, staticAbility, target } from "../../../dsl/builders";
import { onDissolved, triggered } from "../../../dsl/triggers";
import type { Answer, Prompt } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { dissolve as dissolveCard } from "../../../rules/zones";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { zoneCatalog } from "../../../testing/zone-cards";
import { banishUntil } from "../banish-until";
import { dissolve } from "../dissolve";
import { gainControl } from "../gain-control";
import { gainPoints } from "../gain-points";
import { prevent } from "../prevent";
import { reclaimNotBanished } from "../reclaim-not-banished";
import { returnToHand } from "../return-to-hand";
import { v } from "./cards-support";

function card(
  index: number,
  cardType: "character" | "event",
  cost: number,
  abilities: EngineCardDefinition["abilities"],
  speed: EngineCardDefinition["speed"] = "standard",
): EngineCardDefinition {
  return {
    id: syntheticId(0x7d40 + index),
    cardType,
    costs: [energy(cost)],
    spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed,
    status: "authored",
    abilities,
  };
}

export const KEEP = {
  /** "Cards you reclaim are not banished when they leave play." */
  keeper: card(0, "character", 2, () => [staticAbility(reclaimNotBanished())]),
  /** "Cards you reclaim are not banished when they leave play. Reclaim" */
  selfKeeper: card(1, "character", 2, () => [staticAbility(reclaimNotBanished()), keyword("reclaim")]),
  /** "▸Dissolved: Gain 1⍟. Reclaim" */
  revenant: card(2, "character", 1, () => [triggered(onDissolved(), gainPoints(1)), keyword("reclaim")]),
  /** "Gain 1⍟. Reclaim" */
  spell: card(3, "event", 1, () => [event(gainPoints(1)), keyword("reclaim")]),
  /** "Dissolve a character." */
  dissolveOne: card(4, "event", 0, () => [event(dissolve(target(anyCharacter())))]),
  /** "Dissolve each character." */
  wipe: card(5, "event", 0, () => [event(dissolve(all(anyCharacter())))]),
  /** "Return a character to its owner's hand." */
  bounce: card(6, "event", 0, () => [event(returnToHand(target(anyCharacter())))]),
  /** "Banish a character until end of turn." */
  exile: card(7, "event", 0, () => [event(banishUntil(target(anyCharacter()), "untilEndOfTurn"))]),
  /** ❖❖ "Prevent an event the opponent controls." */
  preventEvent: card(8, "event", 0, () => [event(prevent(stackItem({ controller: "opponent", cardType: "event" })))], "interrupt"),
  /** "Gain control of an enemy." */
  seize: card(9, "event", 0, () => [event(gainControl(target(enemyCharacter())))]),
  /** Dissolves the first character in its controller's back rank, then throws: a step that fails after a reclaimed card left play. */
  dissolveThenFail: {
    ...card(10, "event", 0, () => []),
    synthetic: {
      resolve(ctx, item) {
        const first = ctx.state.sides[item.controller].backRank.find((id): id is InstanceId => id !== null);
        if (first !== undefined) dissolveCard(ctx, first, item.controller);
        throw new Error("the step fails after the dissolve");
      },
    },
  },
} as const satisfies Record<string, EngineCardDefinition>;

export const engine = createEngine(zoneCatalog(Object.values(KEEP)));

const filler = Array.from({ length: 4 }, () => v.vanilla1.id);

/** A Day-phase board on the player's turn, with filler decks. */
export function placed(player: SideSetup, enemy: SideSetup = {}) {
  return boardState(engine.catalog, { active: "player", phase: "day", player: { deck: filler, ...player }, enemy: { deck: filler, ...enemy } });
}

/** Answers target prompts with `pick` over their candidates, keeping each prompt. */
export class Answering implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (candidates: readonly InstanceId[]) => readonly InstanceId[] = (candidates) => [candidates[0]]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind !== "chooseTargets" && prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind} prompt`);
    return this.pick(prompt.candidates);
  }
}

/** Applies `action` for `side`, checking the engine invariants of the result. */
export function act(state: BattleState, side: Side, action: Action, source: AnswerSource = new Answering()) {
  const result = engine.apply(state, side, action, source);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}

/** Passes until the stack is empty. */
export function resolveStack(state: BattleState): BattleState {
  return passUntil(engine, state, (next) => next.stack.length === 0).state;
}

export const fromVoid = (card: InstanceId | null | undefined): Action => ({ kind: "play", card: card!, from: "void" });
export const fromHand = (card: InstanceId | null | undefined): Action => ({ kind: "play", card: card!, from: "hand" });

/** `side` plays `card` from its void by Reclaim and the stack resolves. */
export function reclaim(state: BattleState, card: InstanceId | null | undefined, side: Side = "player"): BattleState {
  return resolveStack(act(state, side, fromVoid(card)).state);
}

/** `side` plays `card` from its hand choosing `chosen` as its target, and the stack resolves; with the events published. */
export function playOn(state: BattleState, card: InstanceId | null | undefined, chosen: InstanceId | null | undefined, side: Side = "player") {
  const played = act(state, side, fromHand(card), new Answering(() => [chosen!]));
  const resolved = passUntil(engine, played.state, (next) => next.stack.length === 0);
  return { state: resolved.state, events: [...played.events, ...resolved.events] };
}

export const zoneOf = (state: BattleState, id: InstanceId | null | undefined) => state.instances[id!]?.zone ?? null;
