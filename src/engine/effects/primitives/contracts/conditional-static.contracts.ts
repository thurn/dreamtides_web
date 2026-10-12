import { describe, expect, it } from "vitest";
import { characteristicsOf } from "../../../continuous/characteristics";
import { costModifier } from "../../../continuous/costs";
import { playPermission } from "../../../continuous/permissions";
import { anyCharacter, characterYouControl, conditionCardCounts, costPaid, enemyCharacter, self, staticAbility } from "../../../dsl/builders";
import { createEngine, IllegalAction } from "../../../engine";
import { oncePerTurnKey } from "../../../rules/activation";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { CONDITIONAL, CONDITIONAL_STATIC_CARDS } from "../../../testing/conditional-static-cards";
import { comparableView, determinizationDivergences } from "../../../testing/determinization-fidelity";
import { SYNTHETIC } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { zoneCatalog } from "../../../testing/zone-cards";
import type { Action } from "../../../rules/actions";
import { grant } from "../grant";

const engine = createEngine(zoneCatalog(CONDITIONAL_STATIC_CARDS));
const filler = Array.from({ length: 8 }, () => CONDITIONAL.freeEvent.id);
const board = (setup: BoardSetup) => boardState(engine.catalog, setup);
const apply = (state: BattleState, side: Side, action: Action) => {
  const result = engine.apply(state, side, action, NO_PROMPTS);
  return passUntil(engine, result.state, (next) => next.stack.length === 0).state;
};
const legalVoid = (state: BattleState, side: Side, card: InstanceId) =>
  engine.legalActions(state, side).some((action) => action.kind === "play" && action.card === card && action.from === "void");
const decklists = (state: BattleState) => ({
  player: Object.values(state.instances).flatMap((card) => card.owner === "player" && card.printing.kind === "card" ? [{ cardId: card.printing.cardId }] : []),
  enemy: Object.values(state.instances).flatMap((card) => card.owner === "enemy" && card.printing.kind === "card" ? [{ cardId: card.printing.cardId }] : []),
});

describe("conditional static abilities", () => {
  it("suppresses and restores each controller's void permission without renewing its spent allowance", () => {
    for (const side of SIDES) {
      const placed = board({ active: side, phase: "day", [side]: {
        back: [CONDITIONAL.permit.id], hand: [CONDITIONAL.freeEvent.id],
        void: [CONDITIONAL.freeEvent.id, CONDITIONAL.freeEvent.id], deck: filler,
      } });
      let state = placed.state;
      const source = placed.ids[side].back[0]!;
      const first = placed.ids[side].void[0];
      const remaining = placed.ids[side].void[1];
      const key = oncePerTurnKey(source, 0, state.instances[source].enteredZoneAt);
      const permission = () => playPermission(state, engine.catalog, first, side);
      expect(permission()).toEqual({ consumes: null, oncePerTurn: key });
      expect(legalVoid(state, side, first)).toBe(true);
      state = apply(state, side, { kind: "activate", source, ability: 1 });
      expect(state.sides[side].hand).toHaveLength(2);
      expect(permission()).toBeNull();
      expect(legalVoid(state, side, first)).toBe(false);
      const before = stateHash(state);
      expect(() => engine.apply(state, side, { kind: "play", card: first, from: "void" }, NO_PROMPTS)).toThrow(IllegalAction);
      expect(stateHash(state)).toBe(before);
      expect(state.oncePerTurn).not.toContain(key);
      const off = deserializeState(serializeState(state));
      expect(playPermission(off, engine.catalog, first, side)).toBeNull();
      expect(engine.view(off, side).staticPlayPermissions).toEqual([]);
      state = apply(state, side, { kind: "play", card: state.sides[side].hand[0], from: "hand" });
      expect(state.sides[side].hand).toHaveLength(1);
      expect(permission()).toEqual({ consumes: null, oncePerTurn: key });
      expect(legalVoid(state, side, first)).toBe(true);
      state = apply(state, side, { kind: "play", card: first, from: "void" });
      expect(state.oncePerTurn).toContain(key);
      expect(state.instances[first].zone).toBe("void");
      expect(legalVoid(state, side, remaining)).toBe(false);
      state = apply(state, side, { kind: "activate", source, ability: 1 });
      expect(engine.view(state, side).staticPlayPermissions).toEqual([]);
      state = apply(state, side, { kind: "play", card: state.sides[side].hand[0], from: "hand" });
      expect(state.sides[side].hand).toHaveLength(1);
      expect(engine.view(state, side).staticPlayPermissions).toHaveLength(1);
      expect(state.oncePerTurn.filter((spent) => spent === key)).toHaveLength(1);
      expect(legalVoid(state, side, remaining)).toBe(false);
      const spent = deserializeState(serializeState(state));
      expect(spent.oncePerTurn).toContain(key);
      expect(playPermission(spent, engine.catalog, remaining, side)).toBeNull();
      expect(determinizationDivergences(engine, spent, decklists(spent), battleSeed("conditional-spent"), 0)).toEqual([]);
    }
  });

  it("re-reads controlled character counts after actual entry and departure", () => {
    for (const side of SIDES) {
      const { state: start, ids } = board({ active: side, phase: "day", [side]: {
        back: [CONDITIONAL.crowd.id], hand: [SYNTHETIC.vanilla0.id], deck: filler,
      } });
      const source = ids[side].back[0]!;
      expect(characteristicsOf(start, engine.catalog, source).spark).toBe(1);
      const joined = apply(start, side, { kind: "play", card: ids[side].hand[0], from: "hand" });
      expect(characteristicsOf(joined, engine.catalog, source).spark).toBe(3);
      const left = apply(joined, side, { kind: "activate", source, ability: 1 });
      expect(left.instances[ids[side].hand[0]].zone).toBe("hand");
      expect(characteristicsOf(left, engine.catalog, source).spark).toBe(1);
    }
  });

  it("reads a self-matching spark condition before its own spark modification", () => {
    const { state, ids } = board({ active: "player", phase: "day", player: { back: [CONDITIONAL.selfBound.id], deck: filler } });
    expect(characteristicsOf(state, engine.catalog, ids.player.back[0]!).spark).toBe(3);
    expect(determinizationDivergences(engine, state, decklists(state), battleSeed("conditional-spark"), 0)).toEqual([]);
  });

  it("reads lower type layers for conditional keywords and applies costs live, preserving unconditional statics", () => {
    for (const handSize of [1, 2]) {
      const { state, ids } = board({ active: "player", phase: "day", player: {
        back: [CONDITIONAL.layers.id, CONDITIONAL.discount.id, CONDITIONAL.unconditional.id],
        hand: Array.from({ length: handSize }, () => SYNTHETIC.event1.id), void: [CONDITIONAL.freeEvent.id], deck: filler,
      } });
      const shaped = characteristicsOf(state, engine.catalog, ids.player.back[0]!);
      expect(shaped.allTypes).toBe(handSize === 1);
      expect(shaped.keywords.includes("vengeful")).toBe(handSize === 1);
      expect(costModifier(state, engine.catalog, ids.player.hand[0], "player").reduction).toBe(handSize === 1 ? 1 : 0);
      expect(playPermission(state, engine.catalog, ids.player.void[0], "player")).toEqual({ consumes: null });
      expect(determinizationDivergences(engine, state, decklists(state), battleSeed("conditional-layers"), handSize)).toEqual([]);
    }
  });

  it("counts filtered public void characteristics and unfiltered public deck size", () => {
    for (const voidCards of [[], [SYNTHETIC.vanilla1.id], [SYNTHETIC.vanilla0.id], [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id]]) {
      const { state, ids } = board({ active: "player", phase: "day", player: {
        back: [CONDITIONAL.voidCount.id, CONDITIONAL.emptyDeck.id], void: voidCards,
      } });
      const characteristics = characteristicsOf(state, engine.catalog, ids.player.back[0]!);
      expect(characteristics.keywords.includes("vengeful")).toBe(voidCards.length === 1 && voidCards[0] === SYNTHETIC.vanilla1.id);
      expect(characteristicsOf(state, engine.catalog, ids.player.back[1]!).keywords).toContain("awakened");
      expect(determinizationDivergences(engine, state, decklists(state), battleSeed("conditional-void"), voidCards.length)).toEqual([]);
    }
  });

  it("uses the opponent's public hand count independently of hidden printings", () => {
    const views: unknown[] = [];
    for (const handCard of [SYNTHETIC.vanilla1.id, SYNTHETIC.event1.id]) {
      const other = handCard === SYNTHETIC.vanilla1.id ? SYNTHETIC.event1.id : SYNTHETIC.vanilla1.id;
      const { state, ids } = board({ active: "player", phase: "day", player: { back: [CONDITIONAL.opponentCount.id], deck: filler },
        enemy: { hand: [handCard, CONDITIONAL.freeEvent.id], deck: [other, ...filler] } });
      expect(characteristicsOf(state, engine.catalog, ids.player.back[0]!).spark).toBe(4);
      views.push(comparableView(engine.view(state, "player")));
      expect(determinizationDivergences(engine, state, decklists(state), battleSeed("conditional-public-count"), 0)).toEqual([]);
    }
    expect(views[0]).toEqual(views[1]);
    const { state, ids } = board({ active: "player", phase: "day", player: { back: [CONDITIONAL.opponentCount.id] }, enemy: { hand: [CONDITIONAL.freeEvent.id] } });
    expect(characteristicsOf(state, engine.catalog, ids.player.back[0]!).spark).toBe(1);
  });

  it("keeps resolving-only optional payments and hidden-printing filters outside the static condition type", () => {
    const effect = grant(self(), "vengeful");
    const override = { controller: "opponent", sparkAtMost: 2 };
    const undefinedOverride = { controller: undefined, sparkAtMost: 2 };
    // @ts-expect-error An explicitly undefined controller is also a supplied controller key.
    characterYouControl({ controller: undefined, sparkAtMost: 2 });
    // @ts-expect-error Variables cannot supply an undefined controller key.
    characterYouControl(undefinedOverride);
    // @ts-expect-error An explicitly undefined controller is also a supplied controller key.
    enemyCharacter({ controller: undefined, sparkAtMost: 2 });
    // @ts-expect-error Variables cannot supply an undefined controller key.
    enemyCharacter(undefinedOverride);
    // @ts-expect-error An explicitly undefined controller is also a supplied controller key.
    anyCharacter({ controller: undefined, sparkAtMost: 2 });
    // @ts-expect-error Variables cannot supply an undefined controller key.
    anyCharacter(undefinedOverride);
    // @ts-expect-error A selector factory supplies its own controller.
    characterYouControl({ controller: "opponent", sparkAtMost: 2 });
    // @ts-expect-error A variable must not override the factory's controller either.
    characterYouControl(override);
    // @ts-expect-error A selector factory supplies its own controller.
    enemyCharacter({ controller: "you", sparkAtMost: 2 });
    // @ts-expect-error A variable must not override the factory's controller either.
    enemyCharacter(override);
    // @ts-expect-error A selector factory supplies its own controller.
    anyCharacter({ controller: "you", sparkAtMost: 2 });
    // @ts-expect-error A variable must not override the factory's controller either.
    anyCharacter(override);
    // @ts-expect-error Optional payment history belongs to a resolving stack item.
    staticAbility(effect, { while: costPaid() });
    // @ts-expect-error Filtered hidden hand printings are not public static inputs.
    staticAbility(effect, { while: conditionCardCounts("hand", 1, { filter: { cardType: "character" } }) });
    // @ts-expect-error Filtered hidden deck printings are not public static inputs.
    staticAbility(effect, { while: conditionCardCounts("deck", 1, { filter: { sparkAtLeast: 1 } }) });
  });
});
