/**
 * Durations (rules § Durations): each kind ends exactly at its boundary,
 * extra turns count as their player's turns (C8), and "until the opponent
 * pays" ends with the payable effect (C7).
 */
import { describe, expect, it } from "vitest";
import { energy, self } from "../dsl/builders";
import { triggered, whenDiscard } from "../dsl/triggers";
import type { EngineCardDefinition } from "../catalog";
import * as p from "../effects/primitives";
import { createEngine } from "../engine";
import type { Answer } from "../prompts/types";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { runStep } from "../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import { boardState, type BoardSetup } from "../testing/board";
import { DSL } from "../testing/dsl-cards";
import { SYNTHETIC, syntheticId } from "../testing/synthetic-cards";
import { TRIGGER } from "../testing/trigger-cards";
import { at, passUntil, triggerCatalog, type Observed } from "../testing/trigger-harness";
import { effectiveSpark } from "./spark";

const v = SYNTHETIC;
const t = TRIGGER;
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);

/** "When you discard a card, this character gains +1✦ until end of turn." */
const discardPump: EngineCardDefinition = {
  id: syntheticId(851),
  cardType: "character",
  costs: [energy(1)],
  spark: 1,
  subtype: "Warrior",
  speed: "standard",
  status: "authored",
  abilities: () => [triggered(whenDiscard(), p.gainSpark(self(), 1, "untilEndOfTurn"))],
};

const engine = createEngine(triggerCatalog([discardPump]));

function board(setup: Partial<BoardSetup>) {
  return boardState(engine.catalog, { active: "player", phase: "day", ...setup });
}

function play(state: BattleState, side: Side, card: InstanceId | undefined, answers: readonly Answer[] = []): BattleState {
  if (card === undefined) throw new Error("no card");
  return engine.apply(state, side, { kind: "play", card, from: "hand" }, new ScriptedSource(answers)).state;
}

/** The index of the first observed step, after step `from`, after which `test` holds. */
function firstStep(steps: readonly Observed[], test: (state: BattleState) => boolean, from = 0): number {
  const index = steps.findIndex((step, position) => position > from && test(step.state));
  if (index < 1) throw new Error("boundary not observed");
  return index;
}

/** Pumps `target` with the event `card`, then passes until `done`, recording every step. */
function pumpAndRun(card: EngineCardDefinition, done: (state: BattleState) => boolean) {
  const { state, ids } = board({ player: { back: [v.vanilla1.id], hand: [card.id], energy: 1, deck }, enemy: { deck } });
  const pumped = ids.player.back[0]!;
  const start = play(state, "player", ids.player.hand[0], [[pumped]]);
  expect(effectiveSpark(start, engine.catalog, pumped)).toBeGreaterThan(1);
  return { start, pumped, ...passUntil(engine, start, done) };
}

describe("duration boundaries", () => {
  it("ends 'until end of turn' at Ending, after the Challenge phase", () => {
    const { steps, pumped } = pumpAndRun(DSL.pumpUntilEndOfTurn, at(engine, "enemy", "day"));
    const ending = firstStep(steps, (state) => state.turn.phase === "ending");
    expect(steps[ending - 1]?.state.turn.phase).toBe("challenge");
    expect(steps[ending - 1]?.state.floating).toHaveLength(1);
    expect(steps[ending]?.state.floating).toEqual([]);
    expect(effectiveSpark(steps[ending].state, engine.catalog, pumped)).toBe(1);
  });

  it("ends an 'until end of turn' effect that began during Ending as the turn ends", () => {
    const { state, ids } = board({ phase: "night", player: { back: [discardPump.id], hand: Array.from({ length: 11 }, () => v.vanilla1.id), deck }, enemy: { deck } });
    const { steps } = passUntil(engine, state, at(engine, "enemy", "day"), new ScriptedSource([[ids.player.hand[0]]]));
    const pumped = steps.findIndex((step) => step.step.kind === "resolveTrigger");
    expect(steps[pumped]?.state.turn.phase).toBe("ending");
    expect(steps[pumped]?.state.floating).toHaveLength(1);
    expect(steps[pumped + 1]?.state.turn.active).toBe("enemy");
    expect(steps[pumped + 1]?.state.floating).toEqual([]);
  });

  it("ends 'until your next turn' as its controller's next turn begins", () => {
    const { steps } = pumpAndRun(t.pumpUntilNextTurn, (state) => at(engine, "player", "day")(state) && state.turn.round > 2);
    const enemyTurn = steps.findIndex((step) => step.state.turn.active === "enemy");
    const begins = firstStep(steps, (state) => state.turn.active === "player", enemyTurn);
    expect(steps[begins - 1]?.state.turn).toMatchObject({ active: "enemy", phase: "ending" });
    expect(steps[begins - 1]?.state.floating).toHaveLength(1);
    expect(steps[begins]?.state.turn.phase).toBe("dreamwell");
    expect(steps[begins]?.state.floating).toEqual([]);
  });

  it("ends a floating 'until your next turn' start-of-turn trigger before it can trigger at that boundary", () => {
    const { state, ids } = board({ player: { hand: [t.turnStartUntilNextTurn.id], deck }, enemy: { deck } });
    const start = play(state, "player", ids.player.hand[0]);
    expect(start.floating).toHaveLength(1);
    const next = passUntil(engine, start, (current) => at(engine, "player", "day")(current) && current.turn.turnNumber > start.turn.turnNumber);
    expect(next.events.some((entry) => entry.kind === "triggerQueued")).toBe(false);
    expect(next.state.floating).toEqual([]);
    expect(next.state.sides.player.score).toBe(0);
  });

  it("counts extra turns as their player's turns for 'until your next turn' (C8)", () => {
    const { state, ids } = board({ player: { back: [v.vanilla1.id], hand: [t.pumpUntilNextTurn.id], energy: 1, deck }, enemy: { deck } });
    const pumped = play(state, "player", ids.player.hand[0], [[ids.player.back[0]!]]);
    // The player's own extra turn ends it.
    const ownExtra = passUntil(engine, { ...pumped, turn: { ...pumped.turn, extraTurns: ["player"] } }, (s) => s.turn.extra);
    expect(ownExtra.state.floating).toEqual([]);
    // The opponent's extra turn does not; the player's next turn does.
    const theirs = passUntil(engine, { ...pumped, turn: { ...pumped.turn, extraTurns: ["enemy"] } }, (s) => s.turn.active === "enemy" && !s.turn.extra && s.turn.phase === "day");
    expect(theirs.steps.some((step) => step.state.turn.extra)).toBe(true);
    expect(theirs.state.floating).toHaveLength(1);
    expect(passUntil(engine, theirs.state, at(engine, "player", "day")).state.floating).toEqual([]);
  });

  it("ends 'until the next Day phase' as the next Day phase begins, whoever's it is", () => {
    const { steps } = pumpAndRun(t.pumpUntilNextDay, at(engine, "enemy", "day"));
    const day = firstStep(steps, (state) => state.turn.phase === "day");
    expect(steps[day - 1]?.state.turn).toMatchObject({ active: "enemy", phase: "dawn" });
    expect(steps[day - 1]?.state.floating).toHaveLength(1);
    expect(steps[day]?.state.floating).toEqual([]);
  });

  it("ends 'while this is in play' as the source leaves play, and keeps it across turns until then", () => {
    const { state, ids } = board({ player: { back: [v.vanilla1.id], hand: [t.whilePresentPump.id, DSL.returnAnyToHand.id], energy: 3, deck }, enemy: { deck } });
    const ally = ids.player.back[0]!;
    const source = ids.player.hand[0];
    let current = play(state, "player", source);
    expect(effectiveSpark(current, engine.catalog, ally)).toBe(3);
    current = passUntil(engine, passUntil(engine, current, at(engine, "enemy", "day")).state, at(engine, "player", "day")).state;
    expect(effectiveSpark(current, engine.catalog, ally)).toBe(3);
    current = play(current, "player", ids.player.hand[1], [[source]]);
    expect(current.floating).toEqual([]);
    expect(effectiveSpark(current, engine.catalog, ally)).toBe(1);
  });

  it("makes no change when 'while this is in play' resolves with its source out of play", () => {
    const { state, ids } = board({ player: { back: [v.vanilla1.id], void: [t.whilePresentPump.id], deck }, enemy: { deck } });
    const source = ids.player.void[0];
    state.triggerQueue = [
      { source, controller: "player", origin: { kind: "card", cardId: t.whilePresentPump.id, variant: { amplified: false } }, ability: 0, node: null, subject: source },
    ];
    const result = runStep(state, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog);
    if (result.kind !== "done") throw new Error("suspended");
    expect(result.state.floating).toEqual([]);
    expect(result.events.some((entry) => entry.kind === "sparkGained")).toBe(false);
    expect(effectiveSpark(result.state, engine.catalog, ids.player.back[0]!)).toBe(1);
  });

  it("keeps 'until the opponent pays' across turns until the opponent pays to end it (C7)", () => {
    const { state, ids } = board({ player: { hand: [t.shrinkUntilPays.id], energy: 1, deck }, enemy: { back: [v.vanilla3.id], energy: 2, deck } });
    const enemy = ids.enemy.back[0]!;
    let current = play(state, "player", ids.player.hand[0]);
    expect(effectiveSpark(current, engine.catalog, enemy)).toBe(1);
    const [payable] = current.payable;
    expect(payable).toMatchObject({ payer: "enemy", cost: 1, affects: [enemy] });
    current = passUntil(engine, current, at(engine, "enemy", "day")).state;
    expect(effectiveSpark(current, engine.catalog, enemy)).toBe(1);
    current = engine.apply(current, "enemy", { kind: "payToEnd", effect: payable.id }, NO_PROMPTS).state;
    expect(current.payable).toEqual([]);
    expect(current.floating).toEqual([]);
    expect(effectiveSpark(current, engine.catalog, enemy)).toBe(3);
  });

  it("keeps a permanent delayed trigger across turns until it fires", () => {
    const { state, ids } = board({ player: { back: [v.vanilla1.id], hand: [t.delayedByTrigger.id, DSL.returnAnyToHand.id], energy: 2, deck }, enemy: { deck } });
    let current = play(state, "player", ids.player.hand[0]);
    current = passUntil(engine, passUntil(engine, current, at(engine, "enemy", "day")).state, at(engine, "player", "day")).state;
    expect(current.floating.map((effect) => effect.expiry)).toEqual([{ at: "never" }]);
    current = play(current, "player", ids.player.hand[1], [[ids.player.back[0]!]]);
    expect(current.floating).toEqual([]);
  });

  it("ends spark gained with a duration wherever the card is", () => {
    const { state, ids } = board({ player: { back: [v.vanilla1.id], hand: [t.pumpUntilNextTurn.id, DSL.returnAnyToHand.id], energy: 2, deck }, enemy: { deck } });
    const pumped = ids.player.back[0]!;
    let current = play(state, "player", ids.player.hand[0], [[pumped]]);
    current = play(current, "player", ids.player.hand[1], [[pumped]]);
    expect(current.instances[pumped]?.zone).toBe("hand");
    expect(effectiveSpark(current, engine.catalog, pumped)).toBe(3);
    current = passUntil(engine, current, (next) => at(engine, "player", "day")(next) && next.turn.round > 2).state;
    expect(current.floating).toEqual([]);
  });
});
