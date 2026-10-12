/** Synthetic self-permitting cards and a harness shared by the playSelfFromZone contracts. */
import { expect } from "vitest";
import { printedCardId, type EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { additionalCost, banishFromVoidCost, energy, event, reclaim, stackItem, staticAbility } from "../../../dsl/builders";
import type { ChooseModePrompt } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { instanceOf } from "../../../rules/zones";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { zoneCatalog } from "../../../testing/zone-cards";
import { playSelfFromZone } from "../play-from-zone";
import { prevent } from "../prevent";
import { v } from "./cards-support";
import { Answering, filler, PERMIT } from "./play-from-zone-support";

function character(index: number, abilities: EngineCardDefinition["abilities"], synthetic?: EngineCardDefinition["synthetic"]): EngineCardDefinition {
  return {
    id: syntheticId(0x7c40 + index),
    cardType: "character",
    costs: [energy(1)],
    spark: 7,
    subtype: "Ancient",
    speed: "standard",
    status: "authored",
    abilities,
    ...(synthetic === undefined ? {} : { synthetic }),
  };
}

/** The banish count the synthetic additional cost asks for. */
export const BANISH = 3;

const selfPermission = staticAbility(playSelfFromZone("void"), { zone: "void" });

export const SELF = {
  /** "To play this character, banish 3 cards from your void. You may play this character from your void." */
  abomination: character(0, () => [additionalCost(banishFromVoidCost(BANISH)), selfPermission]),
  /** The same, with "Reclaim 0●". */
  reclaimable: character(1, () => [additionalCost(banishFromVoidCost(BANISH)), selfPermission, reclaim(energy(0))]),
  /** Self-permitting, with a play-time choice whose second mode throws: a play step that fails before its commit point. */
  failing: character(2, () => [selfPermission], {
    play(ctx, self) {
      const purpose = { source: self, cardId: printedCardId(instanceOf(ctx.state, self).printing), ability: 0, role: "chooseOne" } as const;
      const mode = ctx.choose<ChooseModePrompt>({ kind: "chooseMode", side: "player", purpose, options: [{ mode: 0, legal: true }, { mode: 1, legal: true }] });
      if (mode === 1) throw new Error("the play fails mid-step");
      return {};
    },
  }),
} as const satisfies Record<string, EngineCardDefinition>;

/** ❖❖ "Prevent a card the opponent played." Its prevented card goes to its owner's void. */
export const PREVENTER: EngineCardDefinition = {
  id: syntheticId(0x7c4e),
  cardType: "event",
  costs: [energy(1)],
  spark: null,
  subtype: "",
  speed: "interrupt",
  status: "authored",
  abilities: () => [event(prevent(stackItem({ controller: "opponent" })))],
};

export const engine = createEngine(zoneCatalog([...Object.values(PERMIT), ...Object.values(SELF), PREVENTER]));

/** Void cards that can pay the banish. */
export const payers = (count: number) => Array.from({ length: count }, () => v.vanilla1.id);

/** A Day-phase board on `active`'s turn, with filler decks. */
export function placed(player: SideSetup, enemy: SideSetup = {}, active: Side = "player") {
  return boardState(engine.catalog, { active, phase: "day", player: { deck: filler, ...player }, enemy: { deck: filler, ...enemy } });
}

/** Banish prompts take the first `BANISH` candidates; other prompts answer as `Answering` does. */
export const banishFirst = () => new Answering((candidates) => candidates.slice(0, BANISH));

/** Applies `action` for `side`, checking the engine invariants of the result. */
export function act(state: BattleState, side: Side, action: Action, source: Answering = banishFirst()) {
  const result = engine.apply(state, side, action, source);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return { ...result, prompts: source.prompts };
}

export const resolveStack = (state: BattleState): BattleState => passUntil(engine, state, (next) => next.stack.length === 0).state;

/** The void cards `side` may play now. */
export function voidPlays(state: BattleState, side: Side = "player"): InstanceId[] {
  return engine.legalActions(state, side).flatMap((action) => (action.kind === "play" && action.from === "void" ? [action.card] : []));
}
